const { uuid } = require('uuidv4');
const fs = require('fs-extra');
const { promisify } = require('util');
const auth_api = require('./authentication/auth');
const winston = require('winston');
const path = require('path');
const compression = require('compression');
const multer  = require('multer');
const express = require("express");
const bodyParser = require("body-parser");
const archiver = require('archiver');
const unzipper = require('unzipper');
const db_api = require('./db');
const utils = require('./utils')
const low = require('lowdb')
const fetch = require('node-fetch');
const URL = require('url').URL;
const CONSTS = require('./consts')
const read_last_lines = require('read-last-lines');
const ps = require('ps-node');

// needed if bin/details somehow gets deleted
if (!fs.existsSync(CONSTS.DETAILS_BIN_PATH)) fs.writeJSONSync(CONSTS.DETAILS_BIN_PATH, {"version":"2000.06.06","path":"node_modules\\youtube-dl\\bin\\youtube-dl.exe","exec":"youtube-dl.exe","downloader":"youtube-dl"})

const youtubedl = require('youtube-dl');

const logger = require('./logger');
const config_api = require('./config.js');
const downloader_api = require('./downloader');
const tasks_api = require('./tasks');
const subscriptions_api = require('./subscriptions');
const categories_api = require('./categories');
const twitch_api = require('./twitch');
const youtubedl_api = require('./youtube-dl');

var app = express();

// database setup
const FileSync = require('lowdb/adapters/FileSync');

const adapter = new FileSync('./appdata/db.json');
const db = low(adapter)

const users_adapter = new FileSync('./appdata/users.json');
const users_db = low(users_adapter);

// env var setup

const umask = process.env.YTDL_UMASK;
if (umask) process.umask(parseInt(umask));

// check if debug mode
let debugMode = process.env.YTDL_MODE === 'debug';

const admin_token = '4241b401-7236-493e-92b5-b72696b9d853';

// logging setup

config_api.initialize();
db_api.initialize(db, users_db);
auth_api.initialize(db_api);

// Set some defaults
db.defaults(
    {
        playlists: [],
        files: [],
        configWriteFlag: false,
        downloads: {},
        subscriptions: [],
        files_to_db_migration_complete: false
}).write();

users_db.defaults(
    {
        users: [],
        roles: {
            "admin": {
                "permissions": [
                    'filemanager',
                    'settings',
                    'subscriptions',
                    'sharing',
                    'advanced_download',
                    'downloads_manager'
                ]
            }, "user": {
                "permissions": [
                    'filemanager',
                    'subscriptions',
                    'sharing'
                ]
            }
        }
    }
).write();

// config values
let url = null;
let backendPort = null;
let useDefaultDownloadingAgent = null;
let customDownloadingAgent = null;
let allowSubscriptions = null;
let archivePath = path.join(__dirname, 'appdata', 'archives');

// other needed values
let url_domain = null;
let updaterStatus = null;

const concurrentStreams = {};

if (debugMode) logger.info('YTDL-Material in debug mode!');

// check if just updated
const just_updated = fs.existsSync('restart_update.json');
if (just_updated) {
    updaterStatus = {
        updating: false,
        details: 'Update complete! You are now on ' + CONSTS['CURRENT_VERSION']
    }
    fs.unlinkSync('restart_update.json');
}

if (fs.existsSync('restart_general.json')) fs.unlinkSync('restart_general.json');

// updates & starts youtubedl (commented out b/c of repo takedown)
// startYoutubeDL();

var validDownloadingAgents = [
    'aria2c',
    'avconv',
    'axel',
    'curl',
    'ffmpeg',
    'httpie',
    'wget'
];

const subscription_timeouts = {};

let version_info = null;
if (fs.existsSync('version.json')) {
    version_info = fs.readJSONSync('version.json');
    logger.verbose(`Version info: ${JSON.stringify(version_info, null, 2)}`);
} else {
    version_info = {'type': 'N/A', 'tag': 'N/A', 'commit': 'N/A', 'date': 'N/A'};
}

// don't overwrite config if it already happened.. NOT
// let alreadyWritten = db.get('configWriteFlag').value();
let writeConfigMode = process.env.write_ytdl_config;

// checks if config exists, if not, a config is auto generated
config_api.configExistsCheck();

if (writeConfigMode) {
    setAndLoadConfig();
} else {
    loadConfig();
}

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// use passport
app.use(auth_api.passport.initialize());

// actual functions

async function checkMigrations() {
    // 4.1->4.2 migration
    
    const simplified_db_migration_complete = db.get('simplified_db_migration_complete').value();
    if (!simplified_db_migration_complete) {
        logger.info('Beginning migration: 4.1->4.2+')
        let success = await simplifyDBFileStructure();
        success = success && await db_api.addMetadataPropertyToDB('view_count');
        success = success && await db_api.addMetadataPropertyToDB('description');
        success = success && await db_api.addMetadataPropertyToDB('height');
        success = success && await db_api.addMetadataPropertyToDB('abr');
        // sets migration to complete
        db.set('simplified_db_migration_complete', true).write();
        if (success) { logger.info('4.1->4.2+ migration complete!'); }
        else { logger.error('Migration failed: 4.1->4.2+'); }
    }

    const new_db_system_migration_complete = db.get('new_db_system_migration_complete').value();
    if (!new_db_system_migration_complete) {
        logger.info('Beginning migration: 4.2->4.3+')
        let success = await db_api.importJSONToDB(db.value(), users_db.value());

        // sets migration to complete
        db.set('new_db_system_migration_complete', true).write();
        if (success) { logger.info('4.2->4.3+ migration complete!'); }
        else { logger.error('Migration failed: 4.2->4.3+'); }
    }

    return true;
}

async function simplifyDBFileStructure() {
    // back up db files
    const old_db_file = fs.readJSONSync('./appdata/db.json');
    const old_users_db_file = fs.readJSONSync('./appdata/users.json');
    fs.writeJSONSync('appdata/db.old.json', old_db_file);
    fs.writeJSONSync('appdata/users.old.json', old_users_db_file);

    // simplify
    let users = users_db.get('users').value();
    for (let i = 0; i < users.length; i++) {
        const user = users[i];
        if (user['files']['video'] !== undefined && user['files']['audio'] !== undefined) {
            const user_files = user['files']['video'].concat(user['files']['audio']);
            const user_db_path = users_db.get('users').find({uid: user['uid']});
            user_db_path.assign({files: user_files}).write();
        }
        if (user['playlists']['video'] !== undefined && user['playlists']['audio'] !== undefined) {
            const user_playlists = user['playlists']['video'].concat(user['playlists']['audio']);
            const user_db_path = users_db.get('users').find({uid: user['uid']});
            user_db_path.assign({playlists: user_playlists}).write();
        }
    }

    if (db.get('files.video').value() !== undefined && db.get('files.audio').value() !== undefined) {
        const files = db.get('files.video').value().concat(db.get('files.audio').value());
        db.assign({files: files}).write();
    }

    if (db.get('playlists.video').value() !== undefined && db.get('playlists.audio').value() !== undefined) {
        const playlists = db.get('playlists.video').value().concat(db.get('playlists.audio').value());
        db.assign({playlists: playlists}).write();
    }
    

    return true;
}

async function startServer() {
    if (process.env.USING_HEROKU && process.env.PORT) {
        // default to heroku port if using heroku
        backendPort = process.env.PORT || backendPort;

        // set config to port
        await setPortItemFromENV();
    }

    app.listen(backendPort,function(){
        logger.info(`YoutubeDL-Material ${CONSTS['CURRENT_VERSION']} started on PORT ${backendPort}`);
    });
}

async function updateServer(tag) {
    // no tag provided means update to the latest version
    if (!tag) {
        const new_version_available = await isNewVersionAvailable();
        if (!new_version_available) {
            logger.error('ERROR: Failed to update - no update is available.');
            return false;
        }
    }

    return new Promise(async resolve => {
        // backup current dir
        updaterStatus = {
            updating: true,
            'details': 'Backing up key server files...'
        }
        let backup_succeeded = await backupServerLite();
        if (!backup_succeeded) {
            resolve(false);
            return false;
        }

        updaterStatus = {
            updating: true,
            'details': 'Downloading requested release...'
        }
        // grab new package.json and public folder
        await downloadReleaseFiles(tag);

        updaterStatus = {
            updating: true,
            'details': 'Installing new dependencies...'
        }
        // run npm install
        await installDependencies();

        updaterStatus = {
            updating: true,
            'details': 'Update complete! Restarting server...'
        }
        utils.restartServer(true);
    }, err => {
        logger.error(err);
        updaterStatus = {
            updating: false,
            error: true,
            'details': 'Update failed. Check error logs for more info.'
        }
    });
}

async function downloadReleaseFiles(tag) {
    tag = tag ? tag : await getLatestVersion();
    return new Promise(async resolve => {
        logger.info('Downloading new files...')

        // downloads the latest release zip file
        await downloadReleaseZip(tag);

        // deletes contents of public dir
        fs.removeSync(path.join(__dirname, 'public'));
        fs.mkdirSync(path.join(__dirname, 'public'));

        let replace_ignore_list = ['youtubedl-material/appdata/default.json',
                                    'youtubedl-material/appdata/db.json',
                                    'youtubedl-material/appdata/users.json',
                                    'youtubedl-material/appdata/*']
        logger.info(`Installing update ${tag}...`)

        // downloads new package.json and adds new public dir files from the downloaded zip
        fs.createReadStream(path.join(__dirname, `youtubedl-material-release-${tag}.zip`)).pipe(unzipper.Parse())
        .on('entry', function (entry) {
            var fileName = entry.path;
            var is_dir = fileName.substring(fileName.length-1, fileName.length) === '/'
            if (!is_dir && fileName.includes('youtubedl-material/public/')) {
                // get public folder files
                const actualFileName = fileName.replace('youtubedl-material/public/', '');
                if (actualFileName.length !== 0 && actualFileName.substring(actualFileName.length-1, actualFileName.length) !== '/') {
                    fs.ensureDirSync(path.join(__dirname, 'public', path.dirname(actualFileName)));
                    entry.pipe(fs.createWriteStream(path.join(__dirname, 'public', actualFileName)));
                } else {
                    entry.autodrain();
                }
            } else if (!is_dir && !replace_ignore_list.includes(fileName)) {
                // get package.json
                const actualFileName = fileName.replace('youtubedl-material/', '');
                logger.verbose('Downloading file ' + actualFileName);
                entry.pipe(fs.createWriteStream(path.join(__dirname, actualFileName)));
            } else {
                entry.autodrain();
            }
        })
        .on('close', function () {
            resolve(true);
        });
    });
}

async function downloadReleaseZip(tag) {
    return new Promise(async resolve => {
        // get name of zip file, which depends on the version
        const latest_release_link = `https://github.com/Tzahi12345/YoutubeDL-Material/releases/download/${tag}/`;
        const tag_without_v = tag.substring(1, tag.length);
        const zip_file_name = `youtubedl-material-${tag_without_v}.zip`
        const latest_zip_link = latest_release_link + zip_file_name;
        let output_path = path.join(__dirname, `youtubedl-material-release-${tag}.zip`);

        // download zip from release
        await utils.fetchFile(latest_zip_link, output_path, 'update ' + tag);
        resolve(true);
    });

}

async function installDependencies() {
    var child_process = require('child_process');
    var exec = promisify(child_process.exec);

    await exec('npm install',{stdio:[0,1,2]});
    return true;
}

async function backupServerLite() {
    await fs.ensureDir(path.join(__dirname, 'appdata', 'backups'));
    let output_path = path.join('appdata', 'backups', `backup-${Date.now()}.zip`);
    logger.info(`Backing up your non-video/audio files to ${output_path}. This may take up to a few seconds/minutes.`);
    let output = fs.createWriteStream(path.join(__dirname, output_path));

    await new Promise(resolve => {
        var archive = archiver('zip', {
            gzip: true,
            zlib: { level: 9 } // Sets the compression level.
        });

        archive.on('error', function(err) {
            logger.error(err);
            resolve(false);
        });

        // pipe archive data to the output file
        archive.pipe(output);

        // ignore certain directories (ones with video or audio files)
        const files_to_ignore = [path.join(config_api.getConfigItem('ytdl_subscriptions_base_path'), '**'),
                                path.join(config_api.getConfigItem('ytdl_audio_folder_path'), '**'),
                                path.join(config_api.getConfigItem('ytdl_video_folder_path'), '**'),
                                'appdata/backups/backup-*.zip'];

        archive.glob('**/*', {
            ignore: files_to_ignore
        });

        resolve(archive.finalize());
    });

    // wait a tiny bit for the zip to reload in fs
    await utils.wait(100);
    return true;
}

async function isNewVersionAvailable() {
    // gets tag of the latest version of youtubedl-material, compare to current version
    const latest_tag = await getLatestVersion();
    const current_tag = CONSTS['CURRENT_VERSION'];
    if (latest_tag > current_tag) {
        return true;
    } else {
        return false;
    }
}

async function getLatestVersion() {
    const res = await fetch('https://api.github.com/repos/tzahi12345/youtubedl-material/releases/latest', {method: 'Get'});
    const json = await res.json();

    if (json['message']) {
        // means there's an error in getting latest version
        logger.error(`ERROR: Received the following message from GitHub's API:`);
        logger.error(json['message']);
        if (json['documentation_url']) logger.error(`Associated URL: ${json['documentation_url']}`)
    }
    return json['tag_name'];
}

async function killAllDownloads() {
    const lookupAsync = promisify(ps.lookup);
    let resultList = null;

    try {
        resultList = await lookupAsync({
            command: 'youtube-dl'
        });
    } catch (err) {
        // failed to get list of processes
        logger.error('Failed to get a list of running youtube-dl processes.');
        logger.error(err);
        return {
            details: err,
            success: false
        };
    }

    // processes that contain the string 'youtube-dl' in the name will be looped
    resultList.forEach(function( process ){
        if (process) {
            ps.kill(process.pid, 'SIGKILL', function( err ) {
                if (err) {
                    // failed to kill, process may have ended on its own
                    logger.warn(`Failed to kill process with PID ${process.pid}`);
                    logger.warn(err);
                }
                else {
                    logger.verbose(`Process ${process.pid} has been killed!`);
                }
            });
        }
    });

    return {
        success: true
    };
}

async function setPortItemFromENV() {
    config_api.setConfigItem('ytdl_port', backendPort.toString());
    await utils.wait(100);
    return true;
}

async function setAndLoadConfig() {
    await setConfigFromEnv();
    await loadConfig();
}

async function setConfigFromEnv() {
    let config_items = getEnvConfigItems();
    let success = config_api.setConfigItems(config_items);
    if (success) {
        logger.info('Config items set using ENV variables.');
        await utils.wait(100);
        return true;
    } else {
        logger.error('ERROR: Failed to set config items using ENV variables.');
        return false;
    }
}

async function loadConfig() {
    loadConfigValues();

    // connect to DB
    await db_api.connectToDB();
    db_api.database_initialized = true;
    db_api.database_initialized_bs.next(true);

    // creates archive path if missing
    await fs.ensureDir(archivePath);

    // check migrations
    await checkMigrations();

    // now this is done here due to youtube-dl's repo takedown
    await startYoutubeDL();

    // get subscriptions
    if (allowSubscriptions) {
        // set downloading to false
        let subscriptions = await subscriptions_api.getAllSubscriptions();
        subscriptions_api.updateSubscriptionPropertyMultiple(subscriptions, {downloading: false});
        // runs initially, then runs every ${subscriptionCheckInterval} seconds
        const watchSubscriptionsInterval = function() {
            watchSubscriptions();
            const subscriptionsCheckInterval = config_api.getConfigItem('ytdl_subscriptions_check_interval');
            setTimeout(watchSubscriptionsInterval, subscriptionsCheckInterval*1000);
        }

        watchSubscriptionsInterval();
    }

    // start the server here
    startServer();

    return true;
}

function loadConfigValues() {
    url = !debugMode ? config_api.getConfigItem('ytdl_url') : 'http://localhost:4200';
    backendPort = config_api.getConfigItem('ytdl_port');
    useDefaultDownloadingAgent = config_api.getConfigItem('ytdl_use_default_downloading_agent');
    customDownloadingAgent = config_api.getConfigItem('ytdl_custom_downloading_agent');
    allowSubscriptions = config_api.getConfigItem('ytdl_allow_subscriptions');

    if (!useDefaultDownloadingAgent && validDownloadingAgents.indexOf(customDownloadingAgent) !== -1 ) {
        logger.info(`Using non-default downloading agent \'${customDownloadingAgent}\'`)
    } else {
        customDownloadingAgent = null;
    }

    // empty url defaults to default URL
    if (!url || url === '') url = 'http://example.com'
    url_domain = new URL(url);

    let logger_level = config_api.getConfigItem('ytdl_logger_level');
    const possible_levels = ['error', 'warn', 'info', 'verbose', 'debug'];
    if (!possible_levels.includes(logger_level)) {
        logger.error(`${logger_level} is not a valid logger level! Choose one of the following: ${possible_levels.join(', ')}.`)
        logger_level = 'info';
    }
    logger.level = logger_level;
    winston.loggers.get('console').level = logger_level;
    logger.transports[2].level = logger_level;
}

function calculateSubcriptionRetrievalDelay(subscriptions_amount) {
    // frequency is once every 5 mins by default
    const subscriptionsCheckInterval = config_api.getConfigItem('ytdl_subscriptions_check_interval');
    let interval_in_ms = subscriptionsCheckInterval * 1000;
    const subinterval_in_ms = interval_in_ms/subscriptions_amount;
    return subinterval_in_ms;
}

async function watchSubscriptions() {
    let subscriptions = await subscriptions_api.getAllSubscriptions();

    if (!subscriptions) return;

    const valid_subscriptions = subscriptions.filter(sub => !sub.paused);

    let subscriptions_amount = valid_subscriptions.length;
    let delay_interval = calculateSubcriptionRetrievalDelay(subscriptions_amount);

    let current_delay = 0;

    const multiUserMode = config_api.getConfigItem('ytdl_multi_user_mode');
    for (let i = 0; i < valid_subscriptions.length; i++) {
        let sub = valid_subscriptions[i];

        // don't check the sub if the last check for the same subscription has not completed
        if (subscription_timeouts[sub.id]) {
            logger.verbose(`Subscription: skipped checking ${sub.name} as the last check for ${sub.name} has not completed.`);
            continue;
        }

        if (!sub.name) {
            logger.verbose(`Subscription: skipped check for subscription with uid ${sub.id} as name has not been retrieved yet.`);
            continue;
        }

        logger.verbose('Watching ' + sub.name + ' with delay interval of ' + delay_interval);
        setTimeout(async () => {
            const multiUserModeChanged = config_api.getConfigItem('ytdl_multi_user_mode') !== multiUserMode;
            if (multiUserModeChanged) {
                logger.verbose(`Skipping subscription ${sub.name} due to multi-user mode change.`);
                return;
            }
            await subscriptions_api.getVideosForSub(sub, sub.user_uid);
            subscription_timeouts[sub.id] = false;
        }, current_delay);
        subscription_timeouts[sub.id] = true;
        current_delay += delay_interval;
        const subscriptionsCheckInterval = config_api.getConfigItem('ytdl_subscriptions_check_interval');
        if (current_delay >= subscriptionsCheckInterval * 1000) current_delay = 0;
    }
}

function getOrigin() {
    return url_domain.origin;
}

// gets a list of config items that are stored as an environment variable
function getEnvConfigItems() {
    let config_items = [];

    let config_item_keys = Object.keys(config_api.CONFIG_ITEMS);
    for (let i = 0; i < config_item_keys.length; i++) {
        let key = config_item_keys[i];
        if (process['env'][key]) {
            const config_item = generateEnvVarConfigItem(key);
            config_items.push(config_item);
        }
    }

    return config_items;
}

// gets value of a config item and stores it in an object
function generateEnvVarConfigItem(key) {
    return {key: key, value: process['env'][key]};
}

// currently only works for single urls
async function getUrlInfos(url) {
    let startDate = Date.now();
    let result = [];
    return new Promise(resolve => {
        youtubedl.exec(url, ['--dump-json'], {maxBuffer: Infinity}, (err, output) => {
            let new_date = Date.now();
            let difference = (new_date - startDate)/1000;
            logger.debug(`URL info retrieval delay: ${difference} seconds.`);
            if (err) {
                logger.error(`Error during retrieving formats for ${url}: ${err}`);
                resolve(null);
            }
            let try_putput = null;
            try {
                try_putput = JSON.parse(output);
                result = try_putput;
            } catch(e) {
                logger.error(`Failed to retrieve available formats for url: ${url}`);
            }
            resolve(result);
        });
    });
}

// youtube-dl functions

async function startYoutubeDL() {
    // auto update youtube-dl
    youtubedl_api.verifyBinaryExistsLinux();
    const update_available = await youtubedl_api.checkForYoutubeDLUpdate();
    if (update_available) await youtubedl_api.updateYoutubeDL(update_available);
}

app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    res.header("Access-Control-Allow-Origin", getOrigin());
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

app.use(function(req, res, next) {
    if (!req.path.includes('/api/')) {
        next();
    } else if (req.query.apiKey === admin_token) {
        next();
    } else if (req.query.apiKey && config_api.getConfigItem('ytdl_use_api_key') && req.query.apiKey === config_api.getConfigItem('ytdl_api_key')) {
        next();
    } else if (req.path.includes('/api/stream/') || req.path.includes('/api/thumbnail/')) {
        next();
    } else {
        logger.verbose(`Rejecting request - invalid API use for endpoint: ${req.path}. API key received: ${req.query.apiKey}`);
        req.socket.end();
    }
});

app.use(compression());

const optionalJwt = async function (req, res, next) {
    const multiUserMode = config_api.getConfigItem('ytdl_multi_user_mode');
    if (multiUserMode && ((req.body && req.body.uuid) || (req.query && req.query.uuid)) && (req.path.includes('/api/getFile') ||
                                                                                            req.path.includes('/api/stream') ||
                                                                                            req.path.includes('/api/getPlaylist') ||
                                                                                            req.path.includes('/api/downloadFileFromServer'))) {
        // check if shared video
        const using_body = req.body && req.body.uuid;
        const uuid = using_body ? req.body.uuid : req.query.uuid;
        const uid = using_body ? req.body.uid : req.query.uid;
        const playlist_id = using_body ? req.body.playlist_id : req.query.playlist_id;
        const file = !playlist_id ? auth_api.getUserVideo(uuid, uid, true) : await db_api.getPlaylist(playlist_id, uuid, true);
        if (file) {
            req.can_watch = true;
            return next();
        } else {
            res.sendStatus(401);
            return;
        }
    } else if (multiUserMode && !(req.path.includes('/api/auth/register') && !(req.path.includes('/api/config')) && !req.query.jwt)) { // registration should get passed through
        if (!req.query.jwt) {
            res.sendStatus(401);
            return;
        }
        return auth_api.passport.authenticate('jwt', { session: false })(req, res, next);
    }
    return next();
};

app.get('/api/config', function(req, res) {
    let config_file = config_api.getConfigFile();
    res.send({
        config_file: config_file,
        success: !!config_file
    });
});

app.post('/api/setConfig', optionalJwt, function(req, res) {
    let new_config_file = req.body.new_config_file;
    if (new_config_file && new_config_file['YoutubeDLMaterial']) {
        let success = config_api.setConfigFile(new_config_file);
        loadConfigValues(); // reloads config values that exist as variables
        res.send({
            success: success
        });
    } else {
        logger.error('Tried to save invalid config file!')
        res.sendStatus(400);
    }
});

app.get('/api/versionInfo', (req, res) => {
    res.send({version_info: version_info});
});

app.post('/api/restartServer', optionalJwt, (req, res) => {
    // delayed by a little bit so that the client gets a response
    setTimeout(() => {utils.restartServer()}, 100);
    res.send({success: true});
});

app.get('/api/getDBInfo', optionalJwt, async (req, res) => {
    const db_info = await db_api.getDBStats();
    res.send({db_info: db_info});
});

app.post('/api/transferDB', optionalJwt, async (req, res) => {
    const local_to_remote = req.body.local_to_remote;
    let success = null;
    let error = '';
    if (local_to_remote === config_api.getConfigItem('ytdl_use_local_db')) {
        success = await db_api.transferDB(local_to_remote);
        if (!success) error = 'Unknown error';
        else config_api.setConfigItem('ytdl_use_local_db', !local_to_remote);
    } else {
        success = false;
        error = `Failed to transfer DB as it cannot transition into its current status: ${local_to_remote ? 'MongoDB' : 'Local DB'}`;
        logger.error(error);
    }

    res.send({success: success, error: error});
});

app.post('/api/testConnectionString', optionalJwt, async (req, res) => {
    const connection_string = req.body.connection_string;
    let success = null;
    let error = '';
    success = await db_api.connectToDB(0, true, connection_string);
    if (!success) error = 'Connection string failed.';

    res.send({success: success, error: error});
});

app.post('/api/downloadFile', optionalJwt, async function(req, res) {
    req.setTimeout(0); // remove timeout in case of long videos
    const url = req.body.url;
    const type = req.body.type ? req.body.type : 'video';
    const user_uid = req.isAuthenticated() ? req.user.uid : null;
    const options = {
        customArgs: req.body.customArgs,
        additionalArgs: req.body.additionalArgs,
        customOutput: req.body.customOutput,
        selectedHeight: req.body.selectedHeight,
        customQualityConfiguration: req.body.customQualityConfiguration,
        youtubeUsername: req.body.youtubeUsername,
        youtubePassword: req.body.youtubePassword,
        ui_uid: req.body.ui_uid,
        cropFileSettings: req.body.cropFileSettings
    };

    const download = await downloader_api.createDownload(url, type, options, user_uid);

    if (download) {
        res.send({download: download});
    } else {
        res.sendStatus(500);
    }
});

app.post('/api/killAllDownloads', optionalJwt, async function(req, res) {
    const result_obj = await killAllDownloads();
    res.send(result_obj);
});

app.post('/api/generateArgs', optionalJwt, async function(req, res) {
    const url = req.body.url;
    const type = req.body.type;
    const user_uid = req.isAuthenticated() ? req.user.uid : null;
    const options = {
        customArgs: req.body.customArgs,
        additionalArgs: req.body.additionalArgs,
        customOutput: req.body.customOutput,
        selectedHeight: req.body.selectedHeight,
        customQualityConfiguration: req.body.customQualityConfiguration,
        youtubeUsername: req.body.youtubeUsername,
        youtubePassword: req.body.youtubePassword,
        ui_uid: req.body.ui_uid,
        cropFileSettings: req.body.cropFileSettings
    };

    const args = await downloader_api.generateArgs(url, type, options, user_uid, true);
    res.send({args: args});
});

// gets all download mp3s
app.get('/api/getMp3s', optionalJwt, async function(req, res) {
    // TODO: simplify
    let mp3s = await db_api.getRecords('files', {isAudio: true});
    let playlists = await db_api.getRecords('playlists');
    const is_authenticated = req.isAuthenticated();
    if (is_authenticated) {
        // get user audio files/playlists
        auth_api.passport.authenticate('jwt')
        mp3s = await db_api.getRecords('files', {user_uid: req.user.uid, isAudio: true});
        playlists = await db_api.getRecords('playlists', {user_uid: req.user.uid}); // TODO: remove?
    }

    mp3s = JSON.parse(JSON.stringify(mp3s));

    res.send({
        mp3s: mp3s,
        playlists: playlists
    });
});

// gets all download mp4s
app.get('/api/getMp4s', optionalJwt, async function(req, res) {
    let mp4s = await db_api.getRecords('files', {isAudio: false});
    let playlists = await db_api.getRecords('playlists');

    const is_authenticated = req.isAuthenticated();
    if (is_authenticated) {
        // get user videos/playlists
        auth_api.passport.authenticate('jwt')
        mp4s = await db_api.getRecords('files', {user_uid: req.user.uid, isAudio: false});
        playlists = await db_api.getRecords('playlists', {user_uid: req.user.uid}); // TODO: remove?
    }

    mp4s = JSON.parse(JSON.stringify(mp4s));

    res.send({
        mp4s: mp4s,
        playlists: playlists
    });
});

app.post('/api/getFile', optionalJwt, async function (req, res) {
    const uid = req.body.uid;
    const uuid = req.body.uuid;

    let file = await db_api.getRecord('files', {uid: uid});

    if (uuid && !file['sharingEnabled']) file = null;

    // check if chat exists for twitch videos
    if (file && file['url'].includes('twitch.tv')) file['chat_exists'] = fs.existsSync(file['path'].substring(0, file['path'].length - 4) + '.twitch_chat.json');

    if (file) {
        res.send({
            success: true,
            file: file
        });
    } else {
        res.send({
            success: false
        });
    }
});

app.post('/api/getAllFiles', optionalJwt, async function (req, res) {
    // these are returned
    let files = null;
    let playlists = null;
    let sort = req.body.sort;
    let range = req.body.range;
    let text_search = req.body.text_search;
    let file_type_filter = req.body.file_type_filter;
    const uuid = req.isAuthenticated() ? req.user.uid : null;

    const filter_obj = {user_uid: uuid};
    const regex = true;
    if (text_search) {
        if (regex) {
            filter_obj['title'] = {$regex: `.*${text_search}.*`, $options: 'i'};
        } else {
            filter_obj['$text'] = { $search: utils.createEdgeNGrams(text_search) };
        }
    }

    if (file_type_filter === 'audio_only') filter_obj['isAudio'] = true;
    else if (file_type_filter === 'video_only') filter_obj['isAudio'] = false;
    
    files = await db_api.getRecords('files', filter_obj, false, sort, range, text_search);
    let file_count = await db_api.getRecords('files', filter_obj, true);
    playlists = await db_api.getRecords('playlists', {user_uid: uuid});

    const categories = await categories_api.getCategoriesAsPlaylists(files);
    if (categories) {
        playlists = playlists.concat(categories);
    }

    files = JSON.parse(JSON.stringify(files));

    res.send({
        files: files,
        file_count: file_count,
        playlists: playlists
    });
});

app.post('/api/checkConcurrentStream', async (req, res) => {
    const uid = req.body.uid;

    const DEAD_SERVER_THRESHOLD = 10;

    if (concurrentStreams[uid] && Date.now()/1000 - concurrentStreams[uid]['unix_timestamp'] > DEAD_SERVER_THRESHOLD) {
        logger.verbose( `Killing dead stream on ${uid}`);
        delete concurrentStreams[uid];
    }

    res.send({stream: concurrentStreams[uid]})
});

app.post('/api/updateConcurrentStream', optionalJwt, async (req, res) => {
    const uid = req.body.uid;
    const playback_timestamp = req.body.playback_timestamp;
    const unix_timestamp = req.body.unix_timestamp;
    const playing = req.body.playing;

    concurrentStreams[uid] = {
        playback_timestamp: playback_timestamp,
        unix_timestamp: unix_timestamp,
        playing: playing
    }

    res.send({stream: concurrentStreams[uid]})
});

app.post('/api/getFullTwitchChat', optionalJwt, async (req, res) => {
    var id = req.body.id;
    var type = req.body.type;
    var uuid = req.body.uuid;
    var sub = req.body.sub;
    var user_uid = null;

    if (req.isAuthenticated()) user_uid = req.user.uid;

    const chat_file = await twitch_api.getTwitchChatByFileID(id, type, user_uid, uuid, sub);

    res.send({
        chat: chat_file
    });
});

app.post('/api/downloadTwitchChatByVODID', optionalJwt, async (req, res) => {
    var id = req.body.id;
    var type = req.body.type;
    var vodId = req.body.vodId;
    var uuid = req.body.uuid;
    var sub = req.body.sub;
    var user_uid = null;

    if (req.isAuthenticated()) user_uid = req.user.uid;

    // check if file already exists. if so, send that instead
    const file_exists_check = await twitch_api.getTwitchChatByFileID(id, type, user_uid, uuid, sub);
    if (file_exists_check) {
        res.send({chat: file_exists_check});
        return;
    }

    const full_chat = await twitch_api.downloadTwitchChatByVODID(vodId, id, type, user_uid, sub);

    res.send({
        chat: full_chat
    });
});

// video sharing
app.post('/api/enableSharing', optionalJwt, async (req, res) => {
    var uid = req.body.uid;
    var is_playlist = req.body.is_playlist;
    let success = false;
    // multi-user mode
    if (req.isAuthenticated()) {
        // if multi user mode, use this method instead
        success = auth_api.changeSharingMode(req.user.uid, uid, is_playlist, true);
        res.send({success: success});
        return;
    }

    // single-user mode
    try {
        success = true;
        if (!is_playlist) {
            await db_api.updateRecord('files', {uid: uid}, {sharingEnabled: true})
        } else if (is_playlist) {
            await db_api.updateRecord(`playlists`, {id: uid}, {sharingEnabled: true});
        } else if (false) {
            // TODO: Implement.
        } else {
            // error
            success = false;
        }

    } catch(err) {
        logger.error(err);
        success = false;
    }

    res.send({
        success: success
    });
});

app.post('/api/disableSharing', optionalJwt, async function(req, res) {
    var type = req.body.type;
    var uid = req.body.uid;
    var is_playlist = req.body.is_playlist;
    let success = null;

    try {
        success = true;
        if (!is_playlist && type !== 'subscription') {
            await db_api.updateRecord('files', {uid: uid}, {sharingEnabled: false})
        } else if (is_playlist) {
            await db_api.updateRecord(`playlists`, {id: uid}, {sharingEnabled: false});
        } else if (type === 'subscription') {
            // TODO: Implement. Main blocker right now is subscription videos are not stored in the DB, they are searched for every
            //          time they are requested from the subscription directory.
        } else {
            // error
            success = false;
        }

    } catch(err) {
        success = false;
    }

    res.send({
        success: success
    });
});

app.post('/api/incrementViewCount', optionalJwt, async (req, res) => {
    let file_uid = req.body.file_uid;
    let sub_id = req.body.sub_id;
    let uuid = req.body.uuid;

    if (!uuid && req.isAuthenticated()) {
        uuid = req.user.uid;
    }

    const file_obj = await db_api.getVideo(file_uid, uuid, sub_id);

    const current_view_count = file_obj && file_obj['local_view_count'] ? file_obj['local_view_count'] : 0;
    const new_view_count = current_view_count + 1;

    await db_api.setVideoProperty(file_uid, {local_view_count: new_view_count}, uuid, sub_id);

    res.send({
        success: true
    });
});

// categories

app.post('/api/getAllCategories', optionalJwt, async (req, res) => {
    const categories = await db_api.getRecords('categories');
    res.send({categories: categories});
});

app.post('/api/createCategory', optionalJwt, async (req, res) => {
    const name = req.body.name;
    const new_category = {
        name: name,
        uid: uuid(),
        rules: [],
        custom_output: ''
    };

    await db_api.insertRecordIntoTable('categories', new_category);

    res.send({
        new_category: new_category,
        success: !!new_category
    });
});

app.post('/api/deleteCategory', optionalJwt, async (req, res) => {
    const category_uid = req.body.category_uid;

    await db_api.removeRecord('categories', {uid: category_uid});

    res.send({
        success: true
    });
});

app.post('/api/updateCategory', optionalJwt, async (req, res) => {
    const category = req.body.category;
    await db_api.updateRecord('categories', {uid: category.uid}, category)
    res.send({success: true});
});

app.post('/api/updateCategories', optionalJwt, async (req, res) => {
    const categories = req.body.categories;
    await db_api.removeAllRecords('categories');
    await db_api.insertRecordsIntoTable('categories', categories);
    res.send({success: true});
});

// subscriptions

app.post('/api/subscribe', optionalJwt, async (req, res) => {
    let name = req.body.name;
    let url = req.body.url;
    let maxQuality = req.body.maxQuality;
    let timerange = req.body.timerange;
    let audioOnly = req.body.audioOnly;
    let customArgs = req.body.customArgs;
    let customOutput = req.body.customFileOutput;
    let user_uid = req.isAuthenticated() ? req.user.uid : null;
    const new_sub = {
                        name: name,
                        url: url,
                        maxQuality: maxQuality,
                        id: uuid(),
                        user_uid: user_uid,
                        type: audioOnly ? 'audio' : 'video'
                    };

    // adds timerange if it exists, otherwise all videos will be downloaded
    if (timerange) {
        new_sub.timerange = timerange;
    }

    if (customArgs && customArgs !== '') {
        new_sub.custom_args = customArgs;
    }

    if (customOutput && customOutput !== '') {
        new_sub.custom_output = customOutput;
    }

    const result_obj = await subscriptions_api.subscribe(new_sub, user_uid);

    if (result_obj.success) {
        res.send({
            new_sub: new_sub
        });
    } else {
        res.send({
            new_sub: null,
            error: result_obj.error
        })
    }
});

app.post('/api/unsubscribe', optionalJwt, async (req, res) => {
    let deleteMode = req.body.deleteMode
    let sub = req.body.sub;
    let user_uid = req.isAuthenticated() ? req.user.uid : null;

    let result_obj = subscriptions_api.unsubscribe(sub, deleteMode, user_uid);
    if (result_obj.success) {
        res.send({
            success: result_obj.success
        });
    } else {
        res.send({
            success: false,
            error: result_obj.error
        });
    }
});

app.post('/api/deleteSubscriptionFile', optionalJwt, async (req, res) => {
    let deleteForever = req.body.deleteForever;
    let file = req.body.file;
    let file_uid = req.body.file_uid;
    let sub = req.body.sub;
    let user_uid = req.isAuthenticated() ? req.user.uid : null;

    let success = await subscriptions_api.deleteSubscriptionFile(sub, file, deleteForever, file_uid, user_uid);

    if (success) {
        res.send({
            success: success
        });
    } else {
        res.sendStatus(500);
    }

});

app.post('/api/getSubscription', optionalJwt, async (req, res) => {
    let subID = req.body.id;
    let subName = req.body.name; // if included, subID is optional

    // get sub from db
    let subscription = null;
    if (subID) {
        subscription = await subscriptions_api.getSubscription(subID)
    } else if (subName) {
        subscription = await subscriptions_api.getSubscriptionByName(subName)
    }

    if (!subscription) {
        // failed to get subscription from db, send 400 error
        res.sendStatus(400);
        return;
    }

    subscription = JSON.parse(JSON.stringify(subscription));

    // get sub videos
    if (subscription.name && !subscription.streamingOnly) {
        var parsed_files = await db_api.getRecords('files', {sub_id: subscription.id}); // subscription.videos;
        subscription['videos'] = parsed_files;
        // loop through files for extra processing
        for (let i = 0; i < parsed_files.length; i++) {
            const file = parsed_files[i];
            // check if chat exists for twitch videos
            if (file && file['url'].includes('twitch.tv')) file['chat_exists'] = fs.existsSync(file['path'].substring(0, file['path'].length - 4) + '.twitch_chat.json');
        }

        res.send({
            subscription: subscription,
            files: parsed_files
        });
    } else if (subscription.name && subscription.streamingOnly) {
        // return list of videos
        let parsed_files = [];
        if (subscription.videos) {
            for (let i = 0; i < subscription.videos.length; i++) {
                const video = subscription.videos[i];
                parsed_files.push(new utils.File(video.title, video.title, video.thumbnail, false, video.duration, video.url, video.uploader, video.size, null, null, video.upload_date, video.view_count, video.height, video.abr));
            }
        }
        res.send({
            subscription: subscription,
            files: parsed_files
        });
    } else {
        res.sendStatus(500);
    }
});

app.post('/api/downloadVideosForSubscription', optionalJwt, async (req, res) => {
    let subID = req.body.subID;
    let user_uid = req.isAuthenticated() ? req.user.uid : null;

    let sub = subscriptions_api.getSubscription(subID, user_uid);
    subscriptions_api.getVideosForSub(sub, user_uid);
    res.send({
        success: true
    });
});

app.post('/api/updateSubscription', optionalJwt, async (req, res) => {
    let updated_sub = req.body.subscription;
    let user_uid = req.isAuthenticated() ? req.user.uid : null;

    let success = subscriptions_api.updateSubscription(updated_sub, user_uid);
    res.send({
        success: success
    });
});

app.post('/api/getSubscriptions', optionalJwt, async (req, res) => {
    let user_uid = req.isAuthenticated() ? req.user.uid : null;

    // get subs from api
    let subscriptions = await subscriptions_api.getSubscriptions(user_uid);

    res.send({
        subscriptions: subscriptions
    });
});

app.post('/api/createPlaylist', optionalJwt, async (req, res) => {
    let playlistName = req.body.playlistName;
    let uids = req.body.uids;
    let type = req.body.type;

    const new_playlist = await db_api.createPlaylist(playlistName, uids, type, req.isAuthenticated() ? req.user.uid : null);

    res.send({
        new_playlist: new_playlist,
        success: !!new_playlist // always going to be true
    })
});

app.post('/api/getPlaylist', optionalJwt, async (req, res) => {
    let playlist_id = req.body.playlist_id;
    let uuid = req.body.uuid ? req.body.uuid : (req.user && req.user.uid ? req.user.uid : null);
    let include_file_metadata = req.body.include_file_metadata;

    const playlist = await db_api.getPlaylist(playlist_id, uuid);
    const file_objs = [];

    if (playlist && include_file_metadata) {
        for (let i = 0; i < playlist['uids'].length; i++) {
            const uid = playlist['uids'][i];
            const file_obj = await db_api.getVideo(uid, uuid);
            if (file_obj) file_objs.push(file_obj);
            // TODO: remove file from playlist if could not be found
        }
    }

    res.send({
        playlist: playlist,
        file_objs: file_objs,
        type: playlist && playlist.type,
        success: !!playlist
    });
});

app.post('/api/getPlaylists', optionalJwt, async (req, res) => {
    const uuid = req.isAuthenticated() ? req.user.uid : null;
    const include_categories = req.body.include_categories;

    let playlists = await db_api.getRecords('playlists', {user_uid: uuid});
    if (include_categories) {
        const categories = await categories_api.getCategoriesAsPlaylists(files);
        if (categories) {
            playlists = playlists.concat(categories);
        }
    }

    res.send({
        playlists: playlists
    });
});

app.post('/api/addFileToPlaylist', optionalJwt, async (req, res) => {
    let playlist_id = req.body.playlist_id;
    let file_uid = req.body.file_uid;
    
    const playlist = await db_api.getRecord('playlists', {id: playlist_id});

    playlist.uids.push(file_uid);

    let success = await db_api.updatePlaylist(playlist);
    res.send({
        success: success
    });
});

app.post('/api/updatePlaylist', optionalJwt, async (req, res) => {
    let playlist = req.body.playlist;
    let success = await db_api.updatePlaylist(playlist, req.user && req.user.uid);
    res.send({
        success: success
    });
});

app.post('/api/deletePlaylist', optionalJwt, async (req, res) => {
    let playlistID = req.body.playlist_id;

    let success = null;
    try {
        // removes playlist from playlists
        await db_api.removeRecord('playlists', {id: playlistID})

        success = true;
    } catch(e) {
        success = false;
    }

    res.send({
        success: success
    })
});

// deletes non-subscription files
app.post('/api/deleteFile', optionalJwt, async (req, res) => {
    const uid = req.body.uid;
    const blacklistMode = req.body.blacklistMode;
    const uuid = req.isAuthenticated() ? req.user.uid : null;

    let wasDeleted = false;
    wasDeleted = await db_api.deleteFile(uid, uuid, blacklistMode);
    res.send(wasDeleted);
});

app.post('/api/deleteAllFiles', optionalJwt, async (req, res) => {
    const blacklistMode = false;
    const uuid = req.isAuthenticated() ? req.user.uid : null;

    let files = null;
    let text_search = req.body.text_search;
    let file_type_filter = req.body.file_type_filter;

    const filter_obj = {user_uid: uuid};
    const regex = true;
    if (text_search) {
        if (regex) {
            filter_obj['title'] = {$regex: `.*${text_search}.*`, $options: 'i'};
        } else {
            filter_obj['$text'] = { $search: utils.createEdgeNGrams(text_search) };
        }
    }

    if (file_type_filter === 'audio_only') filter_obj['isAudio'] = true;
    else if (file_type_filter === 'video_only') filter_obj['isAudio'] = false;
    
    files = await db_api.getRecords('files', filter_obj);

    let file_count = await db_api.getRecords('files', filter_obj, true);
    let delete_count = 0;

    for (let i = 0; i < files.length; i++) {    
        let wasDeleted = false;
        wasDeleted = await db_api.deleteFile(files[i].uid, uuid, blacklistMode);
        if (wasDeleted) {
            delete_count++;
        }
    }

    res.send({
        file_count: file_count,
        delete_count: delete_count
    });
});

app.post('/api/downloadFileFromServer', optionalJwt, async (req, res) => {
    let uid = req.body.uid;
    let uuid = req.body.uuid;
    let playlist_id = req.body.playlist_id;
    let sub_id = req.body.sub_id;

    let file_path_to_download = null;

    if (!uuid && req.user) uuid = req.user.uid;

    let zip_file_generated = false;
    if (playlist_id) {
        zip_file_generated = true;
        const playlist_files_to_download = [];
        const playlist = await db_api.getPlaylist(playlist_id, uuid);
        for (let i = 0; i < playlist['uids'].length; i++) {
            const playlist_file_uid = playlist['uids'][i];
            const file_obj = await db_api.getVideo(playlist_file_uid, uuid);
            playlist_files_to_download.push(file_obj);
        }

        // generate zip
        file_path_to_download = await utils.createContainerZipFile(playlist['name'], playlist_files_to_download);
    } else if (sub_id && !uid) {
        zip_file_generated = true;
        const sub = await db_api.getRecord('subscriptions', {id: sub_id});
        const sub_files_to_download = await db_api.getRecords('files', {sub_id: sub_id});

        // generate zip
        file_path_to_download = await utils.createContainerZipFile(sub['name'], sub_files_to_download);
    } else {
        const file_obj = await db_api.getVideo(uid, uuid, sub_id)
        file_path_to_download = file_obj.path;
    }
    if (!path.isAbsolute(file_path_to_download)) file_path_to_download = path.join(__dirname, file_path_to_download);
    res.sendFile(file_path_to_download, function (err) {
        if (err) {
          logger.error(err);
        } else if (zip_file_generated) {
          try {
            // delete generated zip file
            fs.unlinkSync(file_path_to_download);
          } catch(e) {
            logger.error(`Failed to remove file after sending to client: ${file_path_to_download}`);
          }
        }
    });
});

app.post('/api/downloadArchive', optionalJwt, async (req, res) => {
    let sub = req.body.sub;
    let archive_dir = sub.archive;

    let full_archive_path = path.join(archive_dir, 'archive.txt');

    if (await fs.pathExists(full_archive_path)) {
        res.sendFile(full_archive_path);
    } else {
        res.sendStatus(404);
    }

});

var upload_multer = multer({ dest: __dirname + '/appdata/' });
app.post('/api/uploadCookies', upload_multer.single('cookies'), async (req, res) => {
    const new_path = path.join(__dirname, 'appdata', 'cookies.txt');

    if (await fs.pathExists(req.file.path)) {
        await fs.rename(req.file.path, new_path);
    } else {
        res.sendStatus(500);
        return;
    }

    if (await fs.pathExists(new_path)) {
        res.send({success: true});
    } else {
        res.sendStatus(500);
    }

});

// Updater API calls

app.get('/api/updaterStatus', optionalJwt, async (req, res) => {
    let status = updaterStatus;

    if (status) {
        res.send(updaterStatus);
    } else {
        res.sendStatus(404);
    }

});

app.post('/api/updateServer', optionalJwt, async (req, res) => {
    let tag = req.body.tag;

    updateServer(tag);

    res.send({
        success: true
    });

});

// API Key API calls

app.post('/api/generateNewAPIKey', optionalJwt, function (req, res) {
    const new_api_key = uuid();
    config_api.setConfigItem('ytdl_api_key', new_api_key);
    res.send({new_api_key: new_api_key});
});

// Streaming API calls

app.get('/api/stream', optionalJwt, async (req, res) => {
    const type = req.query.type;
    const uuid = req.query.uuid ? req.query.uuid : (req.user ? req.user.uid : null);
    const sub_id = req.query.sub_id;
    const mimetype = type === 'audio' ? 'audio/mp3' : 'video/mp4';
    var head;
    let uid = decodeURIComponent(req.query.uid);

    let file_path = null;
    let file_obj = null;

    const multiUserMode = config_api.getConfigItem('ytdl_multi_user_mode');
    if (!multiUserMode || req.isAuthenticated() || req.can_watch) {
        file_obj = await db_api.getVideo(uid, uuid, sub_id);
        if (file_obj) file_path = file_obj['path'];
        else file_path = null;
    }
    if (!fs.existsSync(file_path)) {
        logger.error(`File ${file_path} could not be found! UID: ${uid}, ID: ${file_obj.id}`);
    }
    const stat = fs.statSync(file_path);
    const fileSize = stat.size;
    const range = req.headers.range;
    if (range) {
        const parts = range.replace(/bytes=/, "").split("-")
        const start = parseInt(parts[0], 10)
        const end = parts[1]
        ? parseInt(parts[1], 10)
        : fileSize-1
        const chunksize = (end-start)+1
        const file = fs.createReadStream(file_path, {start, end})
        if (config_api.descriptors[uid]) config_api.descriptors[uid].push(file);
        else                            config_api.descriptors[uid] = [file];
        file.on('close', function() {
            let index = config_api.descriptors[uid].indexOf(file);
            config_api.descriptors[uid].splice(index, 1);
            logger.debug('Successfully closed stream and removed file reference.');
        });
        head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': mimetype,
        }
        res.writeHead(206, head);
        file.pipe(res);
    } else {
        head = {
        'Content-Length': fileSize,
        'Content-Type': mimetype,
        }
        res.writeHead(200, head)
        fs.createReadStream(file_path).pipe(res)
    }
});

app.get('/api/thumbnail/:path', optionalJwt, async (req, res) => {
    let file_path = decodeURIComponent(req.params.path);
    if (fs.existsSync(file_path)) path.isAbsolute(file_path) ? res.sendFile(file_path) : res.sendFile(path.join(__dirname, file_path));
    else res.sendStatus(404);
});

// Downloads management

app.post('/api/downloads', optionalJwt, async (req, res) => {
    const user_uid = req.isAuthenticated() ? req.user.uid : null;
    const uids = req.body.uids;
    let downloads = await db_api.getRecords('download_queue', {user_uid: user_uid});

    if (uids) downloads = downloads.filter(download => uids.includes(download['uid']));

    res.send({downloads: downloads});
});

app.post('/api/download', optionalJwt, async (req, res) => {
    const download_uid = req.body.download_uid;

    const download = await db_api.getRecord('download_queue', {uid: download_uid});

    if (download) {
        res.send({download: download});
    } else {
        res.send({download: null});
    }
});

app.post('/api/clearFinishedDownloads', optionalJwt, async (req, res) => {
    const user_uid = req.isAuthenticated() ? req.user.uid : null;
    const success = db_api.removeAllRecords('download_queue', {finished: true, user_uid: user_uid});
    res.send({success: success});
});

app.post('/api/clearDownload', optionalJwt, async (req, res) => {
    const download_uid = req.body.download_uid;
    const success = await downloader_api.clearDownload(download_uid);
    res.send({success: success});
});

app.post('/api/pauseDownload', optionalJwt, async (req, res) => {
    const download_uid = req.body.download_uid;
    const success = await downloader_api.pauseDownload(download_uid);
    res.send({success: success});
});

app.post('/api/pauseAllDownloads', optionalJwt, async (req, res) => {
    const user_uid = req.isAuthenticated() ? req.user.uid : null;
    let success = true;
    const all_running_downloads = await db_api.getRecords('download_queue', {paused: false, finished: false, user_uid: user_uid});
    for (let i = 0; i < all_running_downloads.length; i++) {
        success &= await downloader_api.pauseDownload(all_running_downloads[i]['uid']);
    }
    res.send({success: success});
});

app.post('/api/resumeDownload', optionalJwt, async (req, res) => {
    const download_uid = req.body.download_uid;
    const success = await downloader_api.resumeDownload(download_uid);
    res.send({success: success});
});

app.post('/api/resumeAllDownloads', optionalJwt, async (req, res) => {
    const user_uid = req.isAuthenticated() ? req.user.uid : null;
    let success = true;
    const all_paused_downloads = await db_api.getRecords('download_queue', {paused: true, user_uid: user_uid, error: null});
    for (let i = 0; i < all_paused_downloads.length; i++) {
        success &= await downloader_api.resumeDownload(all_paused_downloads[i]['uid']);
    }
    res.send({success: success});
});

app.post('/api/restartDownload', optionalJwt, async (req, res) => {
    const download_uid = req.body.download_uid;
    const success = await downloader_api.restartDownload(download_uid);
    res.send({success: success});
});

app.post('/api/cancelDownload', optionalJwt, async (req, res) => {
    const download_uid = req.body.download_uid;
    const success = await downloader_api.cancelDownload(download_uid);
    res.send({success: success});
});

// tasks

app.post('/api/getTasks', optionalJwt, async (req, res) => {
    const tasks = await db_api.getRecords('tasks');
    for (let task of tasks) {
        if (task['schedule']) task['next_invocation'] = tasks_api.TASKS[task['key']]['job'].nextInvocation().getTime();
    }
    res.send({tasks: tasks});
});

app.post('/api/resetTasks', optionalJwt, async (req, res) => {
    const tasks_keys = Object.keys(tasks_api.TASKS);
    for (let i = 0; i < tasks_keys.length; i++) {
        const task_key = tasks_keys[i];
        tasks_api.TASKS[task_key]['job'] = null;
    }
    await db_api.removeAllRecords('tasks');
    await tasks_api.setupTasks();
    res.send({success: true});
});

app.post('/api/getTask', optionalJwt, async (req, res) => {
    const task_key = req.body.task_key;
    const task = await db_api.getRecord('tasks', {key: task_key});
    if (task['schedule']) task['next_invocation'] = tasks_api.TASKS[task_key]['job'].nextInvocation().getTime();
    res.send({task: task});
});

app.post('/api/runTask', optionalJwt, async (req, res) => {
    const task_key = req.body.task_key;
    const task = await db_api.getRecord('tasks', {key: task_key});

    let success = true;
    if (task['running'] || task['confirming']) success = false;
    else await tasks_api.executeRun(task_key);

    res.send({success: success});
});

app.post('/api/confirmTask', optionalJwt, async (req, res) => {
    const task_key = req.body.task_key;
    const task = await db_api.getRecord('tasks', {key: task_key});

    let success = true;
    if (task['running'] || task['confirming'] || !task['data']) success = false;
    else await tasks_api.executeConfirm(task_key);

    res.send({success: success});
});

app.post('/api/updateTaskSchedule', optionalJwt, async (req, res) => {
    const task_key = req.body.task_key;
    const new_schedule = req.body.new_schedule;
  
    await tasks_api.updateTaskSchedule(task_key, new_schedule);

    res.send({success: true});
});

app.post('/api/updateTaskData', optionalJwt, async (req, res) => {
    const task_key = req.body.task_key;
    const new_data = req.body.new_data;
  
    const success = await db_api.updateRecord('tasks', {key: task_key}, {data: new_data});

    res.send({success: success});
});

app.post('/api/getDBBackups', optionalJwt, async (req, res) => {
    const backup_dir = path.join('appdata', 'db_backup');
    fs.ensureDirSync(backup_dir);
    const db_backups = [];

    const candidate_backups = await utils.recFindByExt(backup_dir, 'bak', null, [], false);
    for (let i = 0; i < candidate_backups.length; i++) {
        const candidate_backup = candidate_backups[i];

        // must have specific format
        if (candidate_backup.split('.').length - 1 !== 4) continue;

        const candidate_backup_path = candidate_backup;
        const stats = fs.statSync(candidate_backup_path);

        db_backups.push({ name: path.basename(candidate_backup), timestamp: parseInt(candidate_backup.split('.')[2]), size: stats.size, source: candidate_backup.includes('local') ? 'local' : 'remote' });
    }

    db_backups.sort((a,b) => b.timestamp - a.timestamp);

    res.send({db_backups: db_backups});
});

app.post('/api/restoreDBBackup', optionalJwt, async (req, res) => {
    const file_name = req.body.file_name;

    const success = await db_api.restoreDB(file_name);

    res.send({success: success});
});

// logs management

app.post('/api/logs', optionalJwt, async function(req, res) {
    let logs = null;
    let lines = req.body.lines;
    const logs_path = path.join('appdata', 'logs', 'combined.log')
    if (await fs.pathExists(logs_path)) {
        if (lines) logs = await read_last_lines.read(logs_path, lines);
        else       logs = await fs.readFile(logs_path, 'utf8');
    }
    else
        logger.error(`Failed to find logs file at the expected location: ${logs_path}`)

    res.send({
        logs: logs,
        success: !!logs
    });
});

app.post('/api/clearAllLogs', optionalJwt, async function(req, res) {
    const logs_path = path.join('appdata', 'logs', 'combined.log');
    const logs_err_path = path.join('appdata', 'logs', 'error.log');
    let success = false;
    try {
        await Promise.all([
            fs.writeFile(logs_path, ''),
            fs.writeFile(logs_err_path, '')
        ])
        success = true;
    } catch(e) {
        logger.error(e);
    }

    res.send({
        success: success
    });
});

  app.post('/api/getFileFormats', optionalJwt, async (req, res) => {
    let url = req.body.url;
    let result = await getUrlInfos(url);
    res.send({
        result: result,
        success: !!result
    })
});

// user authentication

app.post('/api/auth/register'
        , optionalJwt
        , auth_api.registerUser);
app.post('/api/auth/login'
        , auth_api.passport.authenticate(['local', 'ldapauth'], {})
        , auth_api.generateJWT
        , auth_api.returnAuthResponse
);
app.post('/api/auth/jwtAuth'
        , auth_api.passport.authenticate('jwt', { session: false })
        , auth_api.passport.authorize('jwt')
        , auth_api.generateJWT
        , auth_api.returnAuthResponse
);
app.post('/api/auth/changePassword', optionalJwt, async (req, res) => {
    let user_uid = req.body.user_uid;
    let password = req.body.new_password;
    let success = await auth_api.changeUserPassword(user_uid, password);
    res.send({success: success});
});
app.post('/api/auth/adminExists', async (req, res) => {
    let exists = await auth_api.adminExists();
    res.send({exists: exists});
});

// user management
app.post('/api/getUsers', optionalJwt, async (req, res) => {
    let users = await db_api.getRecords('users');
    res.send({users: users});
});
app.post('/api/getRoles', optionalJwt, async (req, res) => {
    let roles = await db_api.getRecords('roles');
    res.send({roles: roles});
});

app.post('/api/updateUser', optionalJwt, async (req, res) => {
    let change_obj = req.body.change_object;
    try {
        if (change_obj.name) {
            await db_api.updateRecord('users', {uid: change_obj.uid}, {name: change_obj.name});
        }
        if (change_obj.role) {
            await db_api.updateRecord('users', {uid: change_obj.uid}, {role: change_obj.role});
        }
        res.send({success: true});
    } catch (err) {
        logger.error(err);
        res.send({success: false});
    }
});

app.post('/api/deleteUser', optionalJwt, async (req, res) => {
    let uid = req.body.uid;
    try {
        let success = false;
        let usersFileFolder = config_api.getConfigItem('ytdl_users_base_path');
        const user_folder = path.join(__dirname, usersFileFolder, uid);
        const user_db_obj = await db_api.getRecord('users', {uid: uid});
        if (user_db_obj) {
            // user exists, let's delete
            await fs.remove(user_folder);
            await db_api.removeRecord('users', {uid: uid});
            success = true;
        } else {
            logger.error(`Could not find user with uid ${uid}`);
        }
        res.send({success: success});
    } catch (err) {
        logger.error(err);
        res.send({success: false});
    }
});

app.post('/api/changeUserPermissions', optionalJwt, async (req, res) => {
    const user_uid = req.body.user_uid;
    const permission = req.body.permission;
    const new_value = req.body.new_value;

    if (!permission || !new_value) {
        res.sendStatus(400);
        return;
    }

    const success = await auth_api.changeUserPermissions(user_uid, permission, new_value);

    res.send({success: success});
});

app.post('/api/changeRolePermissions', optionalJwt, async (req, res) => {
    const role = req.body.role;
    const permission = req.body.permission;
    const new_value = req.body.new_value;

    if (!permission || !new_value) {
        res.sendStatus(400);
        return;
    }

    const success = await auth_api.changeRolePermissions(role, permission, new_value);

    res.send({success: success});
});

app.use(function(req, res, next) {
    //if the request is not html then move along
    var accept = req.accepts('html', 'json', 'xml');
    if (accept !== 'html') {
        return next();
    }

    // if the request has a '.' assume that it's for a file, move along
    var ext = path.extname(req.path);
    if (ext !== '') {
        return next();
    }

    let index_path = path.join(__dirname, 'public', 'index.html');

    fs.createReadStream(index_path).pipe(res);

});

let public_dir = path.join(__dirname, 'public');

app.use(express.static(public_dir));
