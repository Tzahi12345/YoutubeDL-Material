const config_api = require('../config');
const CONSTS = require('../consts');
const logger = require('../logger');
const db_api = require('../db');

const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const bcrypt = require('bcryptjs');
const fs = require('fs-extra');
const path = require('path');

var LocalStrategy = require('passport-local').Strategy;
var LdapStrategy = require('passport-ldapauth');
var JwtStrategy = require('passport-jwt').Strategy,
    ExtractJwt = require('passport-jwt').ExtractJwt;

// other required vars
let SERVER_SECRET = null;
let JWT_EXPIRATION = null;
let opts = null;
let saltRounds = 10;

const SAFE_UID_PATTERN = /^[A-Za-z0-9._@-]+$/;

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

  // Sometimes this value is not properly typed: https://github.com/voc0der/YoutubeDL-Material/issues/813
  JWT_EXPIRATION = config_api.getConfigItem('ytdl_jwt_expiration');
  if (!(+JWT_EXPIRATION)) {
    logger.warn(`JWT expiration value improperly set to ${JWT_EXPIRATION}, auto setting to 1 day.`);
    JWT_EXPIRATION = 86400;
  } else {
    JWT_EXPIRATION = +JWT_EXPIRATION;
  }

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
        permissions: CONSTS.AVAILABLE_PERMISSIONS
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

exports.registerUser = async (userid, username, plaintextPassword) => {
  const hash = await bcrypt.hash(plaintextPassword, saltRounds);
  const new_user = generateUserObject(userid, username, hash);
  // check if user exists
  if (await db_api.getRecord('users', {uid: userid})) {
    // user id is taken!
    logger.error('Registration failed: UID is already taken!');
    return null;
  } else if (await db_api.getRecord('users', {name: username})) {
      // user name is taken!
      logger.error('Registration failed: User name is already taken!');
      return null;
  } else {
    // add to db
    await db_api.insertRecordIntoTable('users', new_user);
    logger.verbose(`New user created: ${new_user.name}`);
    return new_user;
  }
}

function parseClaimPath(claims, claimPath) {
  if (!claims || !claimPath || typeof claimPath !== 'string') return undefined;
  const pathParts = claimPath.split('.').filter(part => part !== '');
  if (pathParts.length === 0) return undefined;

  let currentValue = claims;
  for (const part of pathParts) {
    if (!currentValue || typeof currentValue !== 'object' || !(part in currentValue)) {
      return undefined;
    }
    currentValue = currentValue[part];
  }
  return currentValue;
}

function claimToArray(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(v => v.length > 0);
  if (typeof value === 'string' && value.includes(',')) {
    return value.split(',').map(v => v.trim()).filter(v => v.length > 0);
  }
  const normalized = String(value).trim();
  return normalized ? [normalized] : [];
}

function valueIncludes(expectedValue, sourceValue) {
  if (!expectedValue || expectedValue.length === 0) return false;
  const expected = String(expectedValue).trim().toLowerCase();
  if (!expected) return false;
  return claimToArray(sourceValue).some(entry => entry.toLowerCase() === expected);
}

function claimValueToString(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

exports.sanitizeUserUID = (rawUID) => {
  const input = claimValueToString(rawUID);
  if (!input) return null;
  if (input === '.' || input === '..') return null;
  if (!SAFE_UID_PATTERN.test(input)) return null;
  return input;
}

function getOIDCIdentityFromClaims(claims, usernameClaim) {
  const fallbackClaims = [usernameClaim, 'preferred_username', 'username', 'email', 'sub'];
  for (const claimName of fallbackClaims) {
    if (!claimName) continue;
    const claimValue = parseClaimPath(claims, claimName);
    const parsed = claimValueToString(claimValue);
    if (parsed) return parsed;
  }
  return null;
}

exports.createJWTForUser = function(user_uid) {
  const payload = {
      exp: Math.floor(Date.now() / 1000) + JWT_EXPIRATION,
      user: user_uid
  };
  return jwt.sign(payload, SERVER_SECRET);
}

exports.getAuthResponseObject = async function(user) {
  const token = exports.createJWTForUser(user.uid);
  return {
    user: user,
    token: token,
    permissions: await exports.userPermissions(user.uid),
    available_permissions: CONSTS.AVAILABLE_PERMISSIONS
  };
}

exports.upsertOIDCUser = async (claims, options = {}) => {
  const username_claim = options.username_claim || 'preferred_username';
  const display_name_claim = options.display_name_claim || username_claim;
  const groups_claim = options.groups_claim || 'groups';
  const admin_claim = options.admin_claim || 'groups';
  const admin_value = options.admin_value || 'admin';
  const auto_register = options.auto_register !== false;

  const oidc_subject = claimValueToString(parseClaimPath(claims, 'sub'));
  const login_name = getOIDCIdentityFromClaims(claims, username_claim);
  const display_name = claimValueToString(parseClaimPath(claims, display_name_claim)) || login_name;
  const uid_to_use = exports.sanitizeUserUID(login_name);

  if (!uid_to_use || !display_name) {
    logger.error('OIDC login rejected: Could not derive a valid uid/name from OIDC claims.');
    return null;
  }

  const groups = claimToArray(parseClaimPath(claims, groups_claim));
  const admin_claim_value = parseClaimPath(claims, admin_claim);
  const role = valueIncludes(admin_value, admin_claim_value) ? 'admin' : 'user';

  let user_obj = null;
  if (oidc_subject) {
    user_obj = await db_api.getRecord('users', {oidc_subject: oidc_subject});
  }
  if (!user_obj) {
    user_obj = await db_api.getRecord('users', {uid: uid_to_use});
  }
  if (!user_obj) {
    user_obj = await db_api.getRecord('users', {name: display_name});
  }

  if (!user_obj) {
    if (!auto_register) {
      logger.error(`OIDC login rejected: user '${uid_to_use}' does not exist and auto registration is disabled.`);
      return null;
    }
    user_obj = generateUserObject(uid_to_use, display_name, null, 'oidc');
    user_obj.role = role;
    user_obj.oidc_subject = oidc_subject || null;
    user_obj.oidc_groups = groups;
    const inserted = await db_api.insertRecordIntoTable('users', user_obj);
    if (!inserted) {
      logger.error(`OIDC login failed: could not create user '${uid_to_use}'.`);
      return null;
    }
    return await db_api.getRecord('users', {uid: uid_to_use});
  }

  if (oidc_subject && user_obj.oidc_subject && user_obj.oidc_subject !== oidc_subject) {
    logger.error(`OIDC login rejected: existing user '${user_obj.uid}' is mapped to a different subject.`);
    return null;
  }

  const updated_user_values = {
    name: display_name,
    role: role,
    auth_method: 'oidc',
    oidc_groups: groups
  };
  if (oidc_subject) updated_user_values['oidc_subject'] = oidc_subject;

  const updated = await db_api.updateRecord('users', {uid: user_obj.uid}, updated_user_values);
  if (!updated) {
    logger.error(`OIDC login failed: could not update user '${user_obj.uid}'.`);
    return null;
  }
  return await db_api.getRecord('users', {uid: user_obj.uid});
}

exports.deleteUser = async (uid) => {
  let success = false;
  let usersFileFolder = config_api.getConfigItem('ytdl_users_base_path');
  const usersBaseFolder = path.join(__dirname, usersFileFolder);
  const user_folder = path.join(usersBaseFolder, uid);
  const relativeUserFolder = path.relative(usersBaseFolder, user_folder);
  if (relativeUserFolder.startsWith('..') || path.isAbsolute(relativeUserFolder)) {
      logger.error(`Refusing to delete user folder with unsafe uid path: ${uid}`);
      return false;
  }
  const user_db_obj = await db_api.getRecord('users', {uid: uid});
  if (user_db_obj) {
      // user exists, let's delete
      await fs.remove(user_folder);
      await db_api.removeRecord('users', {uid: uid});
      success = true;
  } else {
      logger.error(`Could not find user with uid ${uid}`);
  }
  return success;
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
  // even if we're using LDAP, we still want users to be able to login using internal credentials
  const user = await db_api.getRecord('users', {name: username});
  if (!user) {
    if (config_api.getConfigItem('ytdl_auth_method') === 'internal') logger.error(`User ${username} not found`);
    return false;
  }
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
  req.token = exports.createJWTForUser(req.user.uid);
  next();
}

exports.returnAuthResponse = async function(req, res) {
  const auth_response = await exports.getAuthResponseObject(req.user);
  auth_response.token = req.token;
  res.status(200).json(auth_response);
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
  const filter_obj = {uid: file_uid};
  if (config_api.getConfigItem('ytdl_multi_user_mode') && user_uid !== null && user_uid !== undefined) {
    filter_obj['user_uid'] = user_uid;
  }
  let file = await db_api.getRecord('files', filter_obj);

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
  const filter_obj = {id: playlistID};
  if (config_api.getConfigItem('ytdl_multi_user_mode') && user_uid !== null && user_uid !== undefined) {
    filter_obj['user_uid'] = user_uid;
  }
  let playlist = await db_api.getRecord('playlists', filter_obj);

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
  const role_has_permission = await exports.roleHasPermissions(role, permission);
  if (role_has_permission) {
    return true;
  } else {
    logger.verbose(`User ${user_uid} failed to get permission ${permission}`);
    return false;
  }
}

exports.roleHasPermissions = async function(role, permission) {
  const role_obj = await db_api.getRecord('roles', {key: role})
  if (!role) {
    logger.error(`Role ${role} does not exist!`);
  }
  const role_permissions = role_obj['permissions'];
  if (role_permissions && role_permissions.includes(permission)) return true;
  else return false;
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

  for (let i = 0; i < CONSTS.AVAILABLE_PERMISSIONS.length; i++) {
    let permission = CONSTS.AVAILABLE_PERMISSIONS[i];

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
