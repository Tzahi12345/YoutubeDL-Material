const path = require('path');
const config_api = require('../config');
const consts = require('../consts');
const fs = require('fs-extra');
const jwt = require('jsonwebtoken');
const { uuid } = require('uuidv4');
const bcrypt = require('bcryptjs');

var LocalStrategy = require('passport-local').Strategy;
var LdapStrategy = require('passport-ldapauth');
var JwtStrategy = require('passport-jwt').Strategy,
    ExtractJwt = require('passport-jwt').ExtractJwt;

// other required vars
let logger = null;
let db =  null;
let users_db = null;
let SERVER_SECRET = null;
let JWT_EXPIRATION = null;
let opts = null;
let saltRounds = null;

exports.initialize = function(input_db, input_users_db, input_logger) {
  setLogger(input_logger)
  setDB(input_db, input_users_db);

  /*************************
   * Authentication module
   ************************/
  saltRounds = 10;

  JWT_EXPIRATION = config_api.getConfigItem('ytdl_jwt_expiration');

  SERVER_SECRET = null;
  if (users_db.get('jwt_secret').value()) {
    SERVER_SECRET = users_db.get('jwt_secret').value();
  } else {
    SERVER_SECRET = uuid();
    users_db.set('jwt_secret', SERVER_SECRET).write();
  }

  opts = {}
  opts.jwtFromRequest = ExtractJwt.fromUrlQueryParameter('jwt');
  opts.secretOrKey = SERVER_SECRET;
  /*opts.issuer = 'example.com';
  opts.audience = 'example.com';*/

  exports.passport.use(new JwtStrategy(opts, function(jwt_payload, done) {
    const user = users_db.get('users').find({uid: jwt_payload.user}).value();
    if (user) {
        return done(null, user);
    } else {
        return done(null, false);
        // or you could create a new account
    }
  }));
}

function setLogger(input_logger) {
  logger = input_logger;
}

function setDB(input_db, input_users_db) {
  db = input_db;
  users_db = input_users_db;
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
exports.registerUser = function(req, res) {
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
    .then(function(hash) {
      let new_user = generateUserObject(userid, username, hash);
      // check if user exists
      if (users_db.get('users').find({uid: userid}).value()) {
        // user id is taken!
        logger.error('Registration failed: UID is already taken!');
        res.status(409).send('UID is already taken!');
      } else if (users_db.get('users').find({name: username}).value()) {
          // user name is taken!
          logger.error('Registration failed: User name is already taken!');
          res.status(409).send('User name is already taken!');
      } else {
        // add to db
        users_db.get('users').push(new_user).write();
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
  const user = users_db.get('users').find({name: username}).value();
  if (!user) { logger.error(`User ${username} not found`); false }
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
  function(user, done) {
    // check if ldap auth is enabled
    const ldap_enabled = config_api.getConfigItem('ytdl_auth_method') === 'ldap';
    if (!ldap_enabled) return done(null, false);

    const user_uid = user.uid;
    let db_user = users_db.get('users').find({uid: user_uid}).value();
    if (!db_user) {
      // generate DB user
      let new_user = generateUserObject(user_uid, user_uid, null, 'ldap');
      users_db.get('users').push(new_user).write();
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

exports.returnAuthResponse = function(req, res) {
  res.status(200).json({
    user: req.user,
    token: req.token,
    permissions: exports.userPermissions(req.user.uid),
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
exports.ensureAuthenticatedElseError = function(req, res, next) {
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
exports.changeUserPassword = async function(user_uid, new_pass) {
  try {
    const hash = await bcrypt.hash(new_pass, saltRounds);
    users_db.get('users').find({uid: user_uid}).assign({passhash: hash}).write();
    return true;
  } catch (err) {
    return false;
  }
}

// change user permissions
exports.changeUserPermissions = function(user_uid, permission, new_value) {
  try {
    const user_db_obj = users_db.get('users').find({uid: user_uid});
    user_db_obj.get('permissions').pull(permission).write();
    user_db_obj.get('permission_overrides').pull(permission).write();
    if (new_value === 'yes') {
      user_db_obj.get('permissions').push(permission).write();
      user_db_obj.get('permission_overrides').push(permission).write();
    } else if (new_value === 'no') {
      user_db_obj.get('permission_overrides').push(permission).write();
    }
    return true;
  } catch (err) {
    logger.error(err);
    return false;
  }
}

// change role permissions
exports.changeRolePermissions = function(role, permission, new_value) {
  try {
    const role_db_obj = users_db.get('roles').get(role);
    role_db_obj.get('permissions').pull(permission).write();
    if (new_value === 'yes') {
      role_db_obj.get('permissions').push(permission).write();
    }
    return true;
  } catch (err) {
    logger.error(err);
    return false;
  }
}

exports.adminExists = function() {
  return !!users_db.get('users').find({uid: 'admin'}).value();
}

// video stuff

exports.getUserVideos = function(user_uid, type) {
    const user = users_db.get('users').find({uid: user_uid}).value();
    return type ? user['files'].filter(file => file.isAudio === (type === 'audio')) : user['files'];
}

exports.getUserVideo = function(user_uid, file_uid, requireSharing = false) {
  let file = users_db.get('users').find({uid: user_uid}).get(`files`).find({uid: file_uid}).value();

  // prevent unauthorized users from accessing the file info
  if (file && !file['sharingEnabled'] && requireSharing) file = null;

  return file;
}

exports.updatePlaylistFiles = function(user_uid, playlistID, new_filenames) {
  users_db.get('users').find({uid: user_uid}).get(`playlists`).find({id: playlistID}).assign({fileNames: new_filenames});
  return true;
}

exports.removePlaylist = function(user_uid, playlistID) {
  users_db.get('users').find({uid: user_uid}).get(`playlists`).remove({id: playlistID}).write();
  return true;
}

exports.getUserPlaylists = function(user_uid, user_files = null) {
  const user = users_db.get('users').find({uid: user_uid}).value();
  const playlists = JSON.parse(JSON.stringify(user['playlists']));
  return playlists;
}

exports.getUserPlaylist = function(user_uid, playlistID, requireSharing = false) {
  let playlist = users_db.get('users').find({uid: user_uid}).get(`playlists`).find({id: playlistID}).value();

  // prevent unauthorized users from accessing the file info
  if (requireSharing && !playlist['sharingEnabled']) playlist = null;

  return playlist;
}

exports.registerUserFile = function(user_uid, file_object) {
  users_db.get('users').find({uid: user_uid}).get(`files`)
    .remove({
        path: file_object['path']
    }).write();

  users_db.get('users').find({uid: user_uid}).get(`files`)
      .push(file_object)
      .write();
}

exports.changeSharingMode = function(user_uid, file_uid, is_playlist, enabled) {
  let success = false;
  const user_db_obj = users_db.get('users').find({uid: user_uid});
  if (user_db_obj.value()) {
    const file_db_obj = is_playlist ? user_db_obj.get(`playlists`).find({id: file_uid}) : user_db_obj.get(`files`).find({uid: file_uid});
    if (file_db_obj.value()) {
      success = true;
      file_db_obj.assign({sharingEnabled: enabled}).write();
    }
  }

  return success;
}

exports.userHasPermission = function(user_uid, permission) {
  const user_obj = users_db.get('users').find({uid: user_uid}).value();
  const role = user_obj['role'];
  if (!role) {
    // role doesn't exist
    logger.error('Invalid role ' + role);
    return false;
  }
  const role_permissions = (users_db.get('roles').value())['permissions'];

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

exports.userPermissions = function(user_uid) {
  let user_permissions = [];
  const user_obj = users_db.get('users').find({uid: user_uid}).value();
  const role = user_obj['role'];
  if (!role) {
    // role doesn't exist
    logger.error('Invalid role ' + role);
    return null;
  }
  const role_permissions = users_db.get('roles').get(role).get('permissions').value()

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
