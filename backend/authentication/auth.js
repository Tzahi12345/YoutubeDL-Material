const path = require('path');
const config_api = require('../config');
const consts = require('../consts');
var subscriptions_api = require('../subscriptions')
const fs = require('fs-extra');
var jwt = require('jsonwebtoken');
const { uuid } = require('uuidv4');
var bcrypt = require('bcryptjs');


var LocalStrategy = require('passport-local').Strategy;
var LdapStrategy = require('passport-ldapauth');
var JwtStrategy = require('passport-jwt').Strategy,
    ExtractJwt = require('passport-jwt').ExtractJwt;

// other required vars
let logger = null;
var users_db = null;
let SERVER_SECRET = null;
let JWT_EXPIRATION = null;
let opts = null;
let saltRounds = null;

exports.initialize = function(input_users_db, input_logger) {
  setLogger(input_logger)
  setDB(input_users_db);

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

function setDB(input_users_db) {
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


exports.passport.use(new LocalStrategy({
    usernameField: 'username',
    passwordField: 'password'},
    async function(username, password, done) {
        const user = users_db.get('users').find({name: username}).value();
        if (!user) { logger.error(`User ${username} not found`); return done(null, false); }
        if (user.auth_method && user.auth_method !== 'internal') { return done(null, false); }
        if (user) {
            return done(null, (await bcrypt.compare(password, user.passhash)) ? user : false);
        }
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
    return user['files'][type];
}

exports.getUserVideo = function(user_uid, file_uid, type, requireSharing = false) {
  let file = null;
  if (!type) {
    file = users_db.get('users').find({uid: user_uid}).get(`files.audio`).find({uid: file_uid}).value();
    if (!file) {
        file = users_db.get('users').find({uid: user_uid}).get(`files.video`).find({uid: file_uid}).value();
        if (file) type = 'video';
    } else {
        type = 'audio';
    }
  }

  if (!file && type) file = users_db.get('users').find({uid: user_uid}).get(`files.${type}`).find({uid: file_uid}).value();

  // prevent unauthorized users from accessing the file info
  if (file && !file['sharingEnabled'] && requireSharing) file = null;

  return file;
}

exports.addPlaylist = function(user_uid, new_playlist, type) {
  users_db.get('users').find({uid: user_uid}).get(`playlists.${type}`).push(new_playlist).write();
  return true;
}

exports.updatePlaylistFiles = function(user_uid, playlistID, new_filenames, type) {
  users_db.get('users').find({uid: user_uid}).get(`playlists.${type}`).find({id: playlistID}).assign({fileNames: new_filenames});
  return true;
}

exports.removePlaylist = function(user_uid, playlistID, type) {
  users_db.get('users').find({uid: user_uid}).get(`playlists.${type}`).remove({id: playlistID}).write();
  return true;
}

exports.getUserPlaylists = function(user_uid, type) {
  const user = users_db.get('users').find({uid: user_uid}).value();
  return user['playlists'][type];
}

exports.getUserPlaylist = function(user_uid, playlistID, type, requireSharing = false) {
  let playlist = null;
  if (!type) {
    playlist = users_db.get('users').find({uid: user_uid}).get(`playlists.audio`).find({id: playlistID}).value();
    if (!playlist) {
      playlist = users_db.get('users').find({uid: user_uid}).get(`playlists.video`).find({id: playlistID}).value();
      if (playlist) type = 'video';
    } else {
        type = 'audio';
    }
  }
  if (!playlist) playlist = users_db.get('users').find({uid: user_uid}).get(`playlists.${type}`).find({id: playlistID}).value();

  // prevent unauthorized users from accessing the file info
  if (requireSharing && !playlist['sharingEnabled']) playlist = null;

  return playlist;
}

exports.registerUserFile = function(user_uid, file_object, type) {
  users_db.get('users').find({uid: user_uid}).get(`files.${type}`)
    .remove({
        path: file_object['path']
    }).write();

  users_db.get('users').find({uid: user_uid}).get(`files.${type}`)
      .push(file_object)
      .write();
}

exports.deleteUserFile = async function(user_uid, file_uid, type, blacklistMode = false) {
  let success = false;
  const file_obj = users_db.get('users').find({uid: user_uid}).get(`files.${type}`).find({uid: file_uid}).value();
  if (file_obj) {
    const usersFileFolder = config_api.getConfigItem('ytdl_users_base_path');
    const ext = type === 'audio' ? '.mp3' : '.mp4';

    // close descriptors
    if (config_api.descriptors[file_obj.id]) {
      try {
          for (let i = 0; i < config_api.descriptors[file_obj.id].length; i++) {
            config_api.descriptors[file_obj.id][i].destroy();
          }
      } catch(e) {

      }
    }

    const full_path = path.join(usersFileFolder, user_uid, type, file_obj.id + ext);
    users_db.get('users').find({uid: user_uid}).get(`files.${type}`)
      .remove({
          uid: file_uid
      }).write();
    if (await fs.pathExists(full_path)) {
      // remove json and file
      const json_path = path.join(usersFileFolder, user_uid, type, file_obj.id + '.info.json');
      const alternate_json_path = path.join(usersFileFolder, user_uid, type, file_obj.id + ext + '.info.json');
      let youtube_id = null;
      if (await fs.pathExists(json_path)) {
        youtube_id = await fs.readJSON(json_path).id;
        await fs.unlink(json_path);
      } else if (await fs.pathExists(alternate_json_path)) {
        youtube_id = await fs.readJSON(alternate_json_path).id;
        await fs.unlink(alternate_json_path);
      }

      await fs.unlink(full_path);

      // do archive stuff

      let useYoutubeDLArchive = config_api.getConfigItem('ytdl_use_youtubedl_archive');
      if (useYoutubeDLArchive) {
          const archive_path = path.join(usersFileFolder, user_uid, 'archives', `archive_${type}.txt`);

          // use subscriptions API to remove video from the archive file, and write it to the blacklist
          if (await fs.pathExists(archive_path)) {
              const line = youtube_id ? await subscriptions_api.removeIDFromArchive(archive_path, youtube_id) : null;
              if (blacklistMode && line) {
                let blacklistPath = path.join(usersFileFolder, user_uid, 'archives', `blacklist_${type}.txt`);
                // adds newline to the beginning of the line
                line = '\n' + line;
                await fs.appendFile(blacklistPath, line);
              }
          } else {
              logger.info(`Could not find archive file for ${type} files. Creating...`);
              await fs.ensureFile(archive_path);
          }
      }
    }
    success = true;
  } else {
    success = false;
    logger.warn(`User file ${file_uid} does not exist!`);
  }

  return success;
}

exports.changeSharingMode = function(user_uid, file_uid, type, is_playlist, enabled) {
  let success = false;
  const user_db_obj = users_db.get('users').find({uid: user_uid});
  if (user_db_obj.value()) {
    const file_db_obj = is_playlist ? user_db_obj.get(`playlists.${type}`).find({id: file_uid}) : user_db_obj.get(`files.${type}`).find({uid: file_uid});
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
    files: {
      audio: [],
      video: []
    },
    playlists: {
      audio: [],
      video: []
    },
    subscriptions: [],
    created: Date.now(),
    role: userid === 'admin' && auth_method === 'internal' ? 'admin' : 'user',
    permissions: [],
    permission_overrides: [],
    auth_method: auth_method
  };
  return new_user;
}
