const config_api = require('../config');
const consts = require('../consts');
const logger = require('../logger');
const db_api = require('../db');

const jwt = require('jsonwebtoken');
const { uuid } = require('uuidv4');
const bcrypt = require('bcryptjs');

var LocalStrategy = require('passport-local').Strategy;
var LdapStrategy = require('passport-ldapauth');
var JwtStrategy = require('passport-jwt').Strategy,
    ExtractJwt = require('passport-jwt').ExtractJwt;

// other required vars
let SERVER_SECRET = null;
let JWT_EXPIRATION = null;
let opts = null;
let saltRounds = null;

exports.initialize = function () {
  /*************************
   * Authentication module
   ************************/

  if (db_api.database_initialized) {
    setupRoles();
  } else {
      db_api.database_initialized_bs.subscribe(init => {
          if (init) setupRoles();
      });
  }

  saltRounds = 10;

  JWT_EXPIRATION = config_api.getConfigItem('ytdl_jwt_expiration');

  SERVER_SECRET = null;
  if (db_api.users_db.get('jwt_secret').value()) {
    SERVER_SECRET = db_api.users_db.get('jwt_secret').value();
  } else {
    SERVER_SECRET = uuid();
    db_api.users_db.set('jwt_secret', SERVER_SECRET).write();
  }

  opts = {}
  opts.jwtFromRequest = ExtractJwt.fromUrlQueryParameter('jwt');
  opts.secretOrKey = SERVER_SECRET;

  exports.passport.use(new JwtStrategy(opts, async function(jwt_payload, done) {
    const user = await db_api.getRecord('users', {uid: jwt_payload.user});
    if (user) {
        return done(null, user);
    } else {
        return done(null, false);
        // or you could create a new account
    }
  }));
}

const setupRoles = async () => {
  const required_roles = {
    admin: {
        permissions: [
            'filemanager',
            'settings',
            'subscriptions',
            'sharing',
            'advanced_download',
            'downloads_manager'
        ]
    },
    user: {
        permissions: [
            'filemanager',
            'subscriptions',
            'sharing'
        ]
    }
  }

  const role_keys = Object.keys(required_roles);
  for (let i = 0; i < role_keys.length; i++) {
    const role_key = role_keys[i];
    const role_in_db = await db_api.getRecord('roles', {key: role_key});
    if (!role_in_db) {
      // insert task metadata into table if missing
      await db_api.insertRecordIntoTable('roles', {
          key: role_key,
          permissions: required_roles[role_key]['permissions']
      });
    }
  }
}

exports.passport = require('passport');

exports.passport.serializeUser(function(user, done) {
    done(null, user);
});

exports.passport.deserializeUser(function(user, done) {
    done(null, user);
});

/***************************************
 * Register user with hashed password
 **************************************/
exports.registerUser = async function(req, res) {
  var userid = req.body.userid;
  var username = req.body.username;
  var plaintextPassword = req.body.password;

  if (userid !== 'admin' && !config_api.getConfigItem('ytdl_allow_registration') && !req.isAuthenticated() && (!req.user || !exports.userHasPermission(req.user.uid, 'settings'))) {
    res.sendStatus(409);
    logger.error(`Registration failed for user ${userid}. Registration is disabled.`);
    return;
  }

  if (plaintextPassword === "") {
    res.sendStatus(400);
    logger.error(`Registration failed for user ${userid}. A password must be provided.`);
    return;
  }

  bcrypt.hash(plaintextPassword, saltRounds)
    .then(async function(hash) {
      let new_user = generateUserObject(userid, username, hash);
      // check if user exists
      if (await db_api.getRecord('users', {uid: userid})) {
        // user id is taken!
        logger.error('Registration failed: UID is already taken!');
        res.status(409).send('UID is already taken!');
      } else if (await db_api.getRecord('users', {name: username})) {
          // user name is taken!
          logger.error('Registration failed: User name is already taken!');
          res.status(409).send('User name is already taken!');
      } else {
        // add to db
        await db_api.insertRecordIntoTable('users', new_user);
        logger.verbose(`New user created: ${new_user.name}`);
        res.send({
          user: new_user
        });
      }
    })
    .then(function(result) {

    })
    .catch(function(err) {
      logger.error(err);
      if( err.code == 'ER_DUP_ENTRY' ) {
        res.status(409).send('UserId already taken');
      } else {
        res.sendStatus(409);
      }
    });
}

/***************************************
 * Login methods
 **************************************/

/*************************************************
 * This gets called when passport.authenticate()
 * gets called.
 *
 * This checks that the credentials are valid.
 * If so, passes the user info to the next middleware.
 ************************************************/


exports.login = async (username, password) => {
  const user = await db_api.getRecord('users', {name: username});
  if (!user) { logger.error(`User ${username} not found`); return false }
  if (user.auth_method && user.auth_method !== 'internal') { return false }
  return await bcrypt.compare(password, user.passhash) ? user : false;
}

exports.passport.use(new LocalStrategy({
    usernameField: 'username',
    passwordField: 'password'},
    async function(username, password, done) {
      return done(null, await exports.login(username, password));
    }
));

var getLDAPConfiguration = function(req, callback) {
  const ldap_config = config_api.getConfigItem('ytdl_ldap_config');
  const opts = {server: ldap_config};
  callback(null, opts);
};

exports.passport.use(new LdapStrategy(getLDAPConfiguration,
  async function(user, done) {
    // check if ldap auth is enabled
    const ldap_enabled = config_api.getConfigItem('ytdl_auth_method') === 'ldap';
    if (!ldap_enabled) return done(null, false);

    const user_uid = user.uid;
    let db_user = await db_api.getRecord('users', {uid: user_uid});
    if (!db_user) {
      // generate DB user
      let new_user = generateUserObject(user_uid, user_uid, null, 'ldap');
      await db_api.insertRecordIntoTable('users', new_user);
      db_user = new_user;
      logger.verbose(`Generated new user ${user_uid} using LDAP`);
    }
    return done(null, db_user);
  }
));


/**********************************
 * Generating/Signing a JWT token
 * And attaches the user info into
 * the payload to be sent on every
 * request.
 *********************************/
exports.generateJWT = function(req, res, next) {
  var payload = {
      exp: Math.floor(Date.now() / 1000) + JWT_EXPIRATION
    , user: req.user.uid
  };
  req.token = jwt.sign(payload, SERVER_SECRET);
  next();
}

exports.returnAuthResponse = async function(req, res) {
  res.status(200).json({
    user: req.user,
    token: req.token,
    permissions: await exports.userPermissions(req.user.uid),
    available_permissions: consts['AVAILABLE_PERMISSIONS']
  });
}

/***************************************
 * Authorization: middleware that checks the
 * JWT token for validity before allowing
 * the user to access anything.
 *
 * It also passes the user object to the next
 * middleware through res.locals
 **************************************/
exports.ensureAuthenticatedElseError = (req, res, next) => {
  var token = getToken(req.query);
  if( token ) {
    try {
      var payload = jwt.verify(token, SERVER_SECRET);
      // console.log('payload: ' + JSON.stringify(payload));
      // check if user still exists in database if you'd like
      res.locals.user = payload.user;
      next();
    } catch(err) {
      res.status(401).send('Invalid Authentication');
    }
  } else {
    res.status(401).send('Missing Authorization header');
  }
}

// change password
exports.changeUserPassword = async (user_uid, new_pass) => {
  try {
    const hash = await bcrypt.hash(new_pass, saltRounds);
    await db_api.updateRecord('users', {uid: user_uid}, {passhash: hash});
    return true;
  } catch (err) {
    return false;
  }
}

// change user permissions
exports.changeUserPermissions = async (user_uid, permission, new_value) => {
  try {
    await db_api.pullFromRecordsArray('users', {uid: user_uid}, 'permissions', permission);
    await db_api.pullFromRecordsArray('users', {uid: user_uid}, 'permission_overrides', permission);
    if (new_value === 'yes') {
      await db_api.pushToRecordsArray('users', {uid: user_uid}, 'permissions', permission);
      await db_api.pushToRecordsArray('users', {uid: user_uid}, 'permission_overrides', permission);
    } else if (new_value === 'no') {
      await db_api.pushToRecordsArray('users', {uid: user_uid}, 'permission_overrides', permission);
    }
    return true;
  } catch (err) {
    logger.error(err);
    return false;
  }
}

// change role permissions
exports.changeRolePermissions = async (role, permission, new_value) => {
  try {
    await db_api.pullFromRecordsArray('roles', {key: role}, 'permissions', permission);
    if (new_value === 'yes') {
      await db_api.pushToRecordsArray('roles', {key: role}, 'permissions', permission);
    }
    return true;
  } catch (err) {
    logger.error(err);
    return false;
  }
}

exports.adminExists = async function() {
  return !!(await db_api.getRecord('users', {uid: 'admin'}));
}

// video stuff

exports.getUserVideos = async function(user_uid, type) {
    const files = await db_api.getRecords('files', {user_uid: user_uid});
    return type ? files.filter(file => file.isAudio === (type === 'audio')) : files;
}

exports.getUserVideo = async function(user_uid, file_uid, requireSharing = false) {
  let file = await db_api.getRecord('files', {file_uid: file_uid});

  // prevent unauthorized users from accessing the file info
  if (file && !file['sharingEnabled'] && requireSharing) file = null;

  return file;
}

exports.removePlaylist = async function(user_uid, playlistID) {
  await db_api.removeRecord('playlist', {playlistID: playlistID});
  return true;
}

exports.getUserPlaylists = async function(user_uid) {
  return await db_api.getRecords('playlists', {user_uid: user_uid});
}

exports.getUserPlaylist = async function(user_uid, playlistID, requireSharing = false) {
  let playlist = await db_api.getRecord('playlists', {id: playlistID});

  // prevent unauthorized users from accessing the file info
  if (requireSharing && !playlist['sharingEnabled']) playlist = null;

  return playlist;
}

exports.changeSharingMode = async function(user_uid, file_uid, is_playlist, enabled) {
  let success = false;
  is_playlist ? await db_api.updateRecord(`playlists`, {id: file_uid}, {sharingEnabled: enabled}) : await db_api.updateRecord(`files`, {uid: file_uid}, {sharingEnabled: enabled});
  success = true;
  return success;
}

exports.userHasPermission = async function(user_uid, permission) {

  const user_obj = await db_api.getRecord('users', ({uid: user_uid}));
  const role = user_obj['role'];
  if (!role) {
    // role doesn't exist
    logger.error('Invalid role ' + role);
    return false;
  }
  const role_permissions = (await db_api.getRecords('roles'))['permissions'];

  const user_has_explicit_permission = user_obj['permissions'].includes(permission);
  const permission_in_overrides = user_obj['permission_overrides'].includes(permission);

  // check if user has a negative/positive override
  if (user_has_explicit_permission && permission_in_overrides) {
    // positive override
    return true;
  } else if (!user_has_explicit_permission && permission_in_overrides) {
    // negative override
    return false;
  }

  // no overrides, let's check if the role has the permission
  if (role_permissions.includes(permission)) {
    return true;
  } else {
    logger.verbose(`User ${user_uid} failed to get permission ${permission}`);
    return false;
  }
}

exports.userPermissions = async function(user_uid) {
  let user_permissions = [];
  const user_obj = await db_api.getRecord('users', ({uid: user_uid}));
  const role = user_obj['role'];
  if (!role) {
    // role doesn't exist
    logger.error('Invalid role ' + role);
    return null;
  }
  const role_obj = await db_api.getRecord('roles', {key: role});
  const role_permissions = role_obj['permissions'];

  for (let i = 0; i < consts['AVAILABLE_PERMISSIONS'].length; i++) {
    let permission = consts['AVAILABLE_PERMISSIONS'][i];

    const user_has_explicit_permission = user_obj['permissions'].includes(permission);
    const permission_in_overrides = user_obj['permission_overrides'].includes(permission);

    // check if user has a negative/positive override
    if (user_has_explicit_permission && permission_in_overrides) {
      // positive override
      user_permissions.push(permission);
    } else if (!user_has_explicit_permission && permission_in_overrides) {
      // negative override
      continue;
    }

    // no overrides, let's check if the role has the permission
    if (role_permissions.includes(permission)) {
      user_permissions.push(permission);
    } else {
      continue;
    }
  }

  return user_permissions;
}

function getToken(queryParams) {
  if (queryParams && queryParams.jwt) {
    var parted = queryParams.jwt.split(' ');
    if (parted.length === 2) {
      return parted[1];
    } else {
      return null;
    }
  } else {
    return null;
  }
};

function generateUserObject(userid, username, hash, auth_method = 'internal') {
  let new_user = {
    name: username,
    uid: userid,
    passhash: auth_method === 'internal' ? hash : null,
    files: [],
    playlists: [],
    subscriptions: [],
    created: Date.now(),
    role: userid === 'admin' && auth_method === 'internal' ? 'admin' : 'user',
    permissions: [],
    permission_overrides: [],
    auth_method: auth_method
  };
  return new_user;
}
