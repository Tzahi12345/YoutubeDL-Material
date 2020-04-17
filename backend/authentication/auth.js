const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync');
const adapter = new FileSync('./appdata/users.json');
const db = low(adapter);
db.defaults(
    { 
        users: []
    }
).write();

var LocalStrategy = require('passport-local').Strategy;
var JwtStrategy = require('passport-jwt').Strategy,
    ExtractJwt = require('passport-jwt').ExtractJwt;
var opts = {}
opts.jwtFromRequest = ExtractJwt.fromUrlQueryParameter('jwt');
opts.secretOrKey = 'secret';
opts.issuer = 'example.com';
opts.audience = 'example.com';

/*************************
 * Authentication module
 ************************/
var bcrypt = require('bcrypt');
const saltRounds = 10;

var jwt = require('jsonwebtoken');
const JWT_EXPIRATION = (60 * 60); // one hour

const { uuid } = require('uuidv4');
const SERVER_SECRET = uuid();

exports.passport = require('passport');
var BasicStrategy = require('passport-http').BasicStrategy;

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
  
  bcrypt.hash(plaintextPassword, saltRounds)
    .then(function(hash) {
      // check if user exists
      if (db.get('users').find({uid: userid}).value()) {
        // user id is taken!
        res.status(409).send('UID is already taken!');
      } else if (db.get('users').find({name: username}).value()) {
          // user name is taken!
          res.status(409).send('User name is already taken!');
      } else {
        // add to db
        db.get('users').push({
            name: username,
            uid: userid,
            passhash: hash
        }).write();
      }
    })
    .then(function(result) {
      res.send('registered');
    })
    .catch(function(err) {
      if( err.code == 'ER_DUP_ENTRY' ) {
        res.status(409).send('UserId already taken');
      } else {
        console.log('failed TO register User');

        // res.writeHead(500, {'Content-Type':'text/plain'});
        res.end(err);
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
exports.passport.use(new JwtStrategy(opts, function(jwt_payload, done) {
    const user = db.get('users').find({uid: jwt_payload.sub}).value();
    if (user) {
        return done(null, user);
    } else {
        return done(null, false);
        // or you could create a new account
    }
}));

exports.passport.use(new LocalStrategy({
    usernameField: 'userid',
    passwordField: 'password'},
    function(username, password, done) {
        const user = db.get('users').find({name: username}).value();
        if (!user) { return done(null, false); }
        if (user) {
            return done(null, bcrypt.compareSync(password, user.passhash) ? user : false);
        }
    }
));

/*passport.use(new BasicStrategy(
  function(userid, plainTextPassword, done) {
    const user = db.get('users').find({name: userid}).value();
    if (user) {
          var hashedPwd = user.passhash;
          return bcrypt.compare(plainTextPassword, hashedPwd);
    } else {
          return false;
    }
  }
));
*/

/*************************************************************
 * This is a wrapper for auth.passport.authenticate().
 * We use this to change WWW-Authenticate header so
 * the browser doesn't pop-up challenge dialog box by default.
 * Browser's will pop-up up dialog when status is 401 and 
 * "WWW-Authenticate:Basic..."
 *************************************************************/
/*
exports.authenticateViaPassport = function(req, res, next) {
  exports.passport.authenticate('basic',{session:false}, 
    function(err, user, info) {
      if(!user){
        res.set('WWW-Authenticate', 'x'+info); // change to xBasic
        res.status(401).send('Invalid Authentication');
      } else {
        req.user = user;
        next();
      }
    }
  )(req, res, next);
};
*/

/**********************************
 * Generating/Signing a JWT token
 * And attaches the user info into
 * the payload to be sent on every
 * request.
 *********************************/
exports.generateJWT = function(req, res, next) {
  var payload = {
      exp: Math.floor(Date.now() / 1000) + JWT_EXPIRATION
    , user: req.user,
//    , role: role
  };
  req.token = jwt.sign(payload, SERVER_SECRET);
  next();  
}

exports.returnAuthResponse = function(req, res) {
  res.status(200).json({
    user: req.user,
    token: req.token
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

// video stuff

exports.getUserVideos(type) {
    
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