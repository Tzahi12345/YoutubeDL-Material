const { uuid } = require('uuidv4');
var fs = require('fs-extra');
var { promisify } = require('util');
var auth_api = require('./authentication/auth');
var winston = require('winston');
var path = require('path');
var ffmpeg = require('fluent-ffmpeg');
var compression = require('compression');
var glob = require("glob")
var multer  = require('multer');
var express = require("express");
var bodyParser = require("body-parser");
var archiver = require('archiver');
var unzipper = require('unzipper');
var db_api = require('./db');
var utils = require('./utils')
var mergeFiles = require('merge-files');
const low = require('lowdb')
var ProgressBar = require('progress');
const NodeID3 = require('node-id3')
const fetch = require('node-fetch');
var URL = require('url').URL;
const url_api = require('url');
const CONSTS = require('./consts')
const read_last_lines = require('read-last-lines');
var ps = require('ps-node');

// needed if bin/details somehow gets deleted
if (!fs.existsSync(CONSTS.DETAILS_BIN_PATH)) fs.writeJSONSync(CONSTS.DETAILS_BIN_PATH, {"version":"2000.06.06","path":"node_modules\\youtube-dl\\bin\\youtube-dl.exe","exec":"youtube-dl.exe","downloader":"youtube-dl"})

var youtubedl = require('youtube-dl');

var config_api = require('./config.js');
var subscriptions_api = require('./subscriptions')
var categories_api = require('./categories');
var twitch_api = require('./twitch');

const is_windows = process.platform === 'win32';

var app = express();

// database setup
const FileSync = require('lowdb/adapters/FileSync');
const config = require('./config.js');

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

// console format
const defaultFormat = winston.format.printf(({ level, message, label, timestamp }) => {
    return `${timestamp} ${level.toUpperCase()}: ${message}`;
});
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.timestamp(), defaultFormat),
    defaultMeta: {},
    transports: [
      //
      // - Write to all logs with level `info` and below to `combined.log`
      // - Write all logs error (and below) to `error.log`.
      //
      new winston.transports.File({ filename: 'appdata/logs/error.log', level: 'error' }),
      new winston.transports.File({ filename: 'appdata/logs/combined.log' }),
      new winston.transports.Console({level: !debugMode ? 'info' : 'debug', name: 'console'})
    ]
});

config_api.initialize(logger);
db_api.initialize(db, users_db, logger);
auth_api.initialize(db_api, logger);
subscriptions_api.initialize(db_api, logger);
categories_api.initialize(db, users_db, logger, db_api);

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
var frontendUrl = null;
var backendUrl = null;
var backendPort = null;
var basePath = null;
var audioFolderPath = null;
var videoFolderPath = null;
var downloadOnlyMode = null;
var useDefaultDownloadingAgent = null;
var customDownloadingAgent = null;
var allowSubscriptions = null;
var archivePath = path.join(__dirname, 'appdata', 'archives');

// other needed values
var url_domain = null;
var updaterStatus = null;

var timestamp_server_start = Date.now();

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

var downloads = [];

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// use passport
app.use(auth_api.passport.initialize());

// actual functions

async function checkMigrations() {
    // 3.5->3.6 migration
    const files_to_db_migration_complete = true; // migration phased out! previous code: db.get('files_to_db_migration_complete').value();

    if (!files_to_db_migration_complete) {
        logger.info('Beginning migration: 3.5->3.6+')
        const success = await runFilesToDBMigration()
        if (success) { logger.info('3.5->3.6+ migration complete!'); }
        else { logger.error('Migration failed: 3.5->3.6+'); }
    }

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

async function runFilesToDBMigration() {
    try {
        let mp3s = await getMp3s();
        let mp4s = await getMp4s();

        for (let i = 0; i < mp3s.length; i++) {
            let file_obj = mp3s[i];
            const file_already_in_db = db.get('files.audio').find({id: file_obj.id}).value();
            if (!file_already_in_db) {
                logger.verbose(`Migrating file ${file_obj.id}`);
                db_api.registerFileDB(file_obj.id + '.mp3', 'audio');
            }
        }

        for (let i = 0; i < mp4s.length; i++) {
            let file_obj = mp4s[i];
            const file_already_in_db = db.get('files.video').find({id: file_obj.id}).value();
            if (!file_already_in_db) {
                logger.verbose(`Migrating file ${file_obj.id}`);
                db_api.registerFileDB(file_obj.id + '.mp4', 'video');
            }
        }

        // sets migration to complete
        db.set('files_to_db_migration_complete', true).write();
        return true;
    } catch(err) {
        logger.error(err);
        return false;
    }
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

async function restartServer(is_update = false) {
    logger.info(`${is_update ? 'Update complete! ' : ''}Restarting server...`);

    // the following line restarts the server through nodemon
    fs.writeFileSync(`restart${is_update ? '_update' : '_general'}.json`, 'internal use only');
    process.exit(1);
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
        restartServer(true);
    }, err => {
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
            var type = entry.type; // 'Directory' or 'File'
            var size = entry.size;
            var is_dir = fileName.substring(fileName.length-1, fileName.length) === '/'
            if (!is_dir && fileName.includes('youtubedl-material/public/')) {
                // get public folder files
                var actualFileName = fileName.replace('youtubedl-material/public/', '');
                if (actualFileName.length !== 0 && actualFileName.substring(actualFileName.length-1, actualFileName.length) !== '/') {
                    fs.ensureDirSync(path.join(__dirname, 'public', path.dirname(actualFileName)));
                    entry.pipe(fs.createWriteStream(path.join(__dirname, 'public', actualFileName)));
                } else {
                    entry.autodrain();
                }
            } else if (!is_dir && !replace_ignore_list.includes(fileName)) {
                // get package.json
                var actualFileName = fileName.replace('youtubedl-material/', '');
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

// helper function to download file using fetch
async function fetchFile(url, path, file_label) {
    var len = null;
    const res = await fetch(url);

    len = parseInt(res.headers.get("Content-Length"), 10);

    var bar = new ProgressBar(`  Downloading ${file_label} [:bar] :percent :etas`, {
        complete: '=',
        incomplete: ' ',
        width: 20,
        total: len
    });
    const fileStream = fs.createWriteStream(path);
    await new Promise((resolve, reject) => {
        res.body.pipe(fileStream);
        res.body.on("error", (err) => {
          reject(err);
        });
        res.body.on('data', function (chunk) {
            bar.tick(chunk.length);
        });
        fileStream.on("finish", function() {
          resolve();
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
        await fetchFile(latest_zip_link, output_path, 'update ' + tag);
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

    try {
        await lookupAsync({
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

    await db_api.importUnregisteredFiles();

    // load in previous downloads
    downloads = await db_api.getRecords('downloads');

    // start the server here
    startServer();

    return true;
}

function loadConfigValues() {
    url = !debugMode ? config_api.getConfigItem('ytdl_url') : 'http://localhost:4200';
    backendPort = config_api.getConfigItem('ytdl_port');
    audioFolderPath = config_api.getConfigItem('ytdl_audio_folder_path');
    videoFolderPath = config_api.getConfigItem('ytdl_video_folder_path');
    downloadOnlyMode = config_api.getConfigItem('ytdl_download_only_mode');
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

function getVideoFormatID(name)
{
    var jsonPath = videoFolderPath+name+".info.json";
    if (fs.existsSync(jsonPath))
    {
        var obj = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        var format = obj.format.substring(0,3);
        return format;
    }
}

/**
 * @param {'audio' | 'video'} type
 * @param {string[]} fileNames
 */
async function getAudioOrVideoInfos(type, fileNames) {
    let result = await Promise.all(fileNames.map(async fileName => {
        let fileLocation = videoFolderPath+fileName;
        if (type === 'audio') {
            fileLocation += '.mp3.info.json';
        } else if (type === 'video') {
            fileLocation += '.info.json';
        }

        if (await fs.pathExists(fileLocation)) {
            let data = await fs.readFile(fileLocation);
            try {
                return JSON.parse(data);
            } catch (e) {
                let suffix;
                if (type === 'audio') {
                    suffix += '.mp3';
                } else if (type === 'video') {
                    suffix += '.mp4';
                }

                logger.error(`Could not find info for file ${fileName}${suffix}`);
            }
        }
        return null;
    }));

    return result.filter(data => data != null);
}

// downloads

async function downloadFileByURL_exec(url, type, options, sessionID = null) {
    return new Promise(async resolve => {
        var date = Date.now();

        // audio / video specific vars
        var is_audio = type === 'audio';
        var ext = is_audio ? '.mp3' : '.mp4';
        var fileFolderPath = type === 'audio' ? audioFolderPath : videoFolderPath;
        let category = null;

        // prepend with user if needed
        let multiUserMode = null;
        if (options.user) {
            let usersFileFolder = config_api.getConfigItem('ytdl_users_base_path');
            const user_path = path.join(usersFileFolder, options.user, type);
            fs.ensureDirSync(user_path);
            fileFolderPath = user_path + path.sep;
            multiUserMode = {
                user: options.user,
                file_path: fileFolderPath
            }
            options.customFileFolderPath = fileFolderPath;
        }

        options.downloading_method = 'exec';
        let downloadConfig = await generateArgs(url, type, options);

        // adds download to download helper
        const download_uid = uuid();
        const session = sessionID ? sessionID : 'undeclared';
        let session_downloads = downloads.find(potential_session_downloads => potential_session_downloads['session_id'] === session);
        if (!session_downloads) {
            session_downloads = {session_id: session};
            downloads.push(session_downloads);
        }
        session_downloads[download_uid] = {
            uid: download_uid,
            ui_uid: options.ui_uid,
            downloading: true,
            complete: false,
            url: url,
            type: type,
            percent_complete: 0,
            is_playlist: url.includes('playlist'),
            timestamp_start: Date.now(),
            filesize: null
        };
        const download = session_downloads[download_uid];
        updateDownloads();

        let download_checker = null;

        // get video info prior to download
        let info = await getVideoInfoByURL(url, downloadConfig, download);
        if (!info && url.includes('youtu')) {
            resolve(false);
            return;
        } else if (info) {
            // check if it fits into a category. If so, then get info again using new downloadConfig
            if (!Array.isArray(info) || config_api.getConfigItem('ytdl_allow_playlist_categorization')) category = await categories_api.categorize(info);

            // set custom output if the category has one and re-retrieve info so the download manager has the right file name
            if (category && category['custom_output']) {
                options.customOutput = category['custom_output'];
                options.noRelativePath = true;
                downloadConfig = await generateArgs(url, type, options);
                info = await getVideoInfoByURL(url, downloadConfig, download);
            }

            // store info in download for future use
            if (Array.isArray(info)) {
                download['fileNames'] = [];
                for (let info_obj of info) download['fileNames'].push(info_obj['_filename']);
            } else {
                download['_filename'] = info['_filename'];
            }
            download['filesize'] = utils.getExpectedFileSize(info);
            download_checker = setInterval(() => checkDownloadPercent(download), 1000);
        }

        // download file
        youtubedl.exec(url, downloadConfig, {maxBuffer: Infinity}, async function(err, output) {
            if (download_checker) clearInterval(download_checker); // stops the download checker from running as the download finished (or errored)

            download['downloading'] = false;
            download['timestamp_end'] = Date.now();
            var file_objs = [];
            let new_date = Date.now();
            let difference = (new_date - date)/1000;
            logger.debug(`${is_audio ? 'Audio' : 'Video'} download delay: ${difference} seconds.`);
            if (err) {
                logger.error(err.stderr);

                download['error'] = err.stderr;
                updateDownloads();
                resolve(false);
                return;
            } else if (output) {
                if (output.length === 0 || output[0].length === 0) {
                    download['error'] = 'No output. Check if video already exists in your archive.';
                    logger.warn(`No output received for video download, check if it exists in your archive.`)
                    updateDownloads();

                    resolve(false);
                    return;
                }
                var file_names = [];
                for (let i = 0; i < output.length; i++) {
                    let output_json = null;
                    try {
                        output_json = JSON.parse(output[i]);
                    } catch(e) {
                        output_json = null;
                    }

                    if (!output_json) {
                        continue;
                    }

                    // get filepath with no extension
                    const filepath_no_extension = utils.removeFileExtension(output_json['_filename']);

                    var full_file_path = filepath_no_extension + ext;
                    var file_name = filepath_no_extension.substring(fileFolderPath.length, filepath_no_extension.length);

                    if (type === 'video' && url.includes('twitch.tv/videos/') && url.split('twitch.tv/videos/').length > 1
                        && config.getConfigItem('ytdl_use_twitch_api') && config.getConfigItem('ytdl_twitch_auto_download_chat')) {
                            let vodId = url.split('twitch.tv/videos/')[1];
                            vodId = vodId.split('?')[0];
                            twitch_api.downloadTwitchChatByVODID(vodId, file_name, type, options.user);
                    }

                    // renames file if necessary due to bug
                    if (!fs.existsSync(output_json['_filename'] && fs.existsSync(output_json['_filename'] + '.webm'))) {
                        try {
                            fs.renameSync(output_json['_filename'] + '.webm', output_json['_filename']);
                            logger.info('Renamed ' + file_name + '.webm to ' + file_name);
                        } catch(e) {
                        }
                    }

                    if (type === 'audio') {
                        let tags = {
                            title: output_json['title'],
                            artist: output_json['artist'] ? output_json['artist'] : output_json['uploader']
                        }
                        let success = NodeID3.write(tags, utils.removeFileExtension(output_json['_filename']) + '.mp3');
                        if (!success) logger.error('Failed to apply ID3 tag to audio file ' + output_json['_filename']);
                    }

                    const file_path = options.noRelativePath ? path.basename(full_file_path) : full_file_path.substring(fileFolderPath.length, full_file_path.length);
                    const customPath = options.noRelativePath ? path.dirname(full_file_path).split(path.sep).pop() : null;

                    if (options.cropFileSettings) {
                        await cropFile(full_file_path, options.cropFileSettings.cropFileStart, options.cropFileSettings.cropFileEnd, ext);
                    }

                    // registers file in DB
                    const file_obj = await db_api.registerFileDB2(full_file_path, type, options.user, category, null, options.cropFileSettings);

                    // TODO: remove the following line
                    if (file_name) file_names.push(file_name);

                    file_objs.push(file_obj);
                }

                let is_playlist = file_names.length > 1;

                if (options.merged_string !== null && options.merged_string !== undefined) {
                    let current_merged_archive = fs.readFileSync(path.join(fileFolderPath, `merged_${type}.txt`), 'utf8');
                    let diff = current_merged_archive.replace(options.merged_string, '');
                    const archive_path = options.user ? path.join(fileFolderPath, 'archives', `archive_${type}.txt`) : path.join(archivePath, `archive_${type}.txt`);
                    fs.appendFileSync(archive_path, diff);
                }

                download['complete'] = true;
                download['fileNames'] = is_playlist ? file_names : [full_file_path]
                updateDownloads();

                let container = null;

                if (file_objs.length > 1) {
                    // create playlist
                    const playlist_name = file_objs.map(file_obj => file_obj.title).join(', ');
                    const duration = file_objs.reduce((a, b) => a + utils.durationStringToNumber(b.duration), 0);
                    container = await db_api.createPlaylist(playlist_name, file_objs.map(file_obj => file_obj.uid), type, options.user);
                } else if (file_objs.length === 1) {
                    container = file_objs[0];
                } else {
                    logger.error('Downloaded file failed to result in metadata object.');
                }

                resolve({
                    file_uids: file_objs.map(file_obj => file_obj.uid),
                    container: container
                });
            }
        });
    });
}

async function generateArgs(url, type, options) {
    var videopath = config_api.getConfigItem('ytdl_default_file_output') ? config_api.getConfigItem('ytdl_default_file_output') : '%(title)s';
    var globalArgs = config_api.getConfigItem('ytdl_custom_args');
    let useCookies = config_api.getConfigItem('ytdl_use_cookies');
    var is_audio = type === 'audio';

    var fileFolderPath = is_audio ? audioFolderPath : videoFolderPath;

    if (options.customFileFolderPath) fileFolderPath = options.customFileFolderPath;

    var customArgs = options.customArgs;
    var customOutput = options.customOutput;
    var customQualityConfiguration = options.customQualityConfiguration;

    // video-specific args
    var selectedHeight = options.selectedHeight;

    // audio-specific args
    var maxBitrate = options.maxBitrate;

    var youtubeUsername = options.youtubeUsername;
    var youtubePassword = options.youtubePassword;

    let downloadConfig = null;
    let qualityPath = (is_audio && !options.skip_audio_args) ? ['-f', 'bestaudio'] : ['-f', 'bestvideo+bestaudio', '--merge-output-format', 'mp4'];
    const is_youtube = url.includes('youtu');
    if (!is_audio && !is_youtube) {
        // tiktok videos fail when using the default format
        qualityPath = null;
    } else if (!is_audio && !is_youtube && (url.includes('reddit') || url.includes('pornhub'))) {
        qualityPath = ['-f', 'bestvideo+bestaudio']
    }

    if (customArgs) {
        downloadConfig = customArgs.split(',,');
    } else {
        if (customQualityConfiguration) {
            qualityPath = ['-f', customQualityConfiguration];
        } else if (selectedHeight && selectedHeight !== '' && !is_audio) {
            qualityPath = ['-f', `'(mp4)[height=${selectedHeight}'`];
        } else if (is_audio) {
            qualityPath = ['--audio-quality', maxBitrate ? maxBitrate : '0']
        }

        if (customOutput) {
            customOutput = options.noRelativePath ? customOutput : path.join(fileFolderPath, customOutput);
            downloadConfig = ['-o', `${customOutput}.%(ext)s`, '--write-info-json', '--print-json'];
        } else {
            downloadConfig = ['-o', path.join(fileFolderPath, videopath + (is_audio ? '.%(ext)s' : '.mp4')), '--write-info-json', '--print-json'];
        }

        if (qualityPath && options.downloading_method === 'exec') downloadConfig.push(...qualityPath);

        if (is_audio && !options.skip_audio_args) {
            downloadConfig.push('-x');
            downloadConfig.push('--audio-format', 'mp3');
        }

        if (youtubeUsername && youtubePassword) {
            downloadConfig.push('--username', youtubeUsername, '--password', youtubePassword);
        }

        if (useCookies) {
            if (await fs.pathExists(path.join(__dirname, 'appdata', 'cookies.txt'))) {
                downloadConfig.push('--cookies', path.join('appdata', 'cookies.txt'));
            } else {
                logger.warn('Cookies file could not be found. You can either upload one, or disable \'use cookies\' in the Advanced tab in the settings.');
            }
        }

        if (!useDefaultDownloadingAgent && customDownloadingAgent) {
            downloadConfig.splice(0, 0, '--external-downloader', customDownloadingAgent);
        }

        let useYoutubeDLArchive = config_api.getConfigItem('ytdl_use_youtubedl_archive');
        if (useYoutubeDLArchive) {
            const archive_folder = options.user ? path.join(fileFolderPath, 'archives') : archivePath;
            const archive_path = path.join(archive_folder, `archive_${type}.txt`);

            await fs.ensureDir(archive_folder);

            // create archive file if it doesn't exist
            if (!(await fs.pathExists(archive_path))) {
                await fs.close(await fs.open(archive_path, 'w'));
            }

            let blacklist_path = options.user ? path.join(fileFolderPath, 'archives', `blacklist_${type}.txt`) : path.join(archivePath, `blacklist_${type}.txt`);
            // create blacklist file if it doesn't exist
            if (!(await fs.pathExists(blacklist_path))) {
                await fs.close(await fs.open(blacklist_path, 'w'));
            }

            let merged_path = path.join(fileFolderPath, `merged_${type}.txt`);
            await fs.ensureFile(merged_path);
            // merges blacklist and regular archive
            let inputPathList = [archive_path, blacklist_path];
            let status = await mergeFiles(inputPathList, merged_path);

            options.merged_string = await fs.readFile(merged_path, "utf8");

            downloadConfig.push('--download-archive', merged_path);
        }

        if (config_api.getConfigItem('ytdl_include_thumbnail')) {
            downloadConfig.push('--write-thumbnail');
        }

        if (globalArgs && globalArgs !== '') {
            // adds global args
            if (downloadConfig.indexOf('-o') !== -1 && globalArgs.split(',,').indexOf('-o') !== -1) {
                // if global args has an output, replce the original output with that of global args
                const original_output_index = downloadConfig.indexOf('-o');
                downloadConfig.splice(original_output_index, 2);
            }
            downloadConfig = downloadConfig.concat(globalArgs.split(',,'));
        }

        const rate_limit = config_api.getConfigItem('ytdl_download_rate_limit');
        if (rate_limit && downloadConfig.indexOf('-r') === -1 && downloadConfig.indexOf('--limit-rate') === -1) {
            downloadConfig.push('-r', rate_limit);
        }
        
        const default_downloader = utils.getCurrentDownloader() || config_api.getConfigItem('ytdl_default_downloader');
        if (default_downloader === 'yt-dlp') {
            downloadConfig.push('--no-clean-infojson');
        }

    }

    // filter out incompatible args
    downloadConfig = filterArgs(downloadConfig, is_audio);

    logger.verbose(`youtube-dl args being used: ${downloadConfig.join(',')}`);
    return downloadConfig;
}

async function getVideoInfoByURL(url, args = [], download = null) {
    return new Promise(resolve => {
        // remove bad args
        const new_args = [...args];

        const archiveArgIndex = new_args.indexOf('--download-archive');
        if (archiveArgIndex !== -1) {
            new_args.splice(archiveArgIndex, 2);
        }

        // actually get info
        youtubedl.getInfo(url, new_args, (err, output) => {
            if (output) {
                resolve(output);
            } else {
                logger.error(`Error while retrieving info on video with URL ${url} with the following message: ${err}`);
                if (err.stderr) {
                    logger.error(`${err.stderr}`)
                }
                if (download) {
                    download['error'] = `Failed pre-check for video info: ${err}`;
                    updateDownloads();
                }
                resolve(null);
            }
        });
    });
}

function filterArgs(args, isAudio) {
    const video_only_args = ['--add-metadata', '--embed-subs', '--xattrs'];
    const audio_only_args = ['-x', '--extract-audio', '--embed-thumbnail'];
    const args_to_remove = isAudio ? video_only_args : audio_only_args;
    return args.filter(x => !args_to_remove.includes(x));
}

// currently only works for single urls
async function getUrlInfos(urls) {
    let startDate = Date.now();
    let result = [];
    return new Promise(resolve => {
        youtubedl.exec(urls.join(' '), ['--dump-json'], {maxBuffer: Infinity}, (err, output) => {
            let new_date = Date.now();
            let difference = (new_date - startDate)/1000;
            logger.debug(`URL info retrieval delay: ${difference} seconds.`);
            if (err) {
                logger.error(`Error during parsing: ${err}`);
                resolve(null);
            }
            let try_putput = null;
            try {
                try_putput = JSON.parse(output);
                result = try_putput;
            } catch(e) {
                // probably multiple urls
                logger.error('failed to parse for urls starting with ' + urls[0]);
                // logger.info(output);
            }
            resolve(result);
        });
    });
}

// ffmpeg helper functions

async function cropFile(file_path, start, end, ext) {
    return new Promise(resolve => {
        const temp_file_path = `${file_path}.cropped${ext}`;
        let base_ffmpeg_call = ffmpeg(file_path);
        if (start) {
            base_ffmpeg_call = base_ffmpeg_call.seekOutput(start);
        }
        if (end) {
            base_ffmpeg_call = base_ffmpeg_call.duration(end - start);
        }
        base_ffmpeg_call
            .on('end', () => {
                logger.verbose(`Cropping for '${file_path}' complete.`);
                fs.unlinkSync(file_path);
                fs.moveSync(temp_file_path, file_path);
                resolve(true);
            })
            .on('error', (err, test, test2) => {
                logger.error(`Failed to crop ${file_path}.`);
                logger.error(err);
                resolve(false);
            }).save(temp_file_path);
    });    
}

// download management functions

async function updateDownloads() {
    await db_api.removeAllRecords('downloads');
    if (downloads.length !== 0) await db_api.insertRecordsIntoTable('downloads', downloads);
}

function checkDownloadPercent(download) {
    /*
    This is more of an art than a science, we're just selecting files that start with the file name,
    thus capturing the parts being downloaded in files named like so: '<video title>.<format>.<ext>.part'.

    Any file that starts with <video title> will be counted as part of the "bytes downloaded", which will
    be divided by the "total expected bytes."
    */
    const file_id = download['file_id'];
    // assume it's a playlist for logic reasons
    const fileNames = Array.isArray(download['fileNames']) ? download['fileNames'] 
                                                        : [path.format(path.parse(utils.removeFileExtension(download['_filename'])))];
    const resulting_file_size = download['filesize'];

    if (!resulting_file_size) return;

    let sum_size = 0;
    glob(`{${fileNames.join(',')}, }*`, (err, files) => {
        files.forEach(file => {
            try {
                const file_stats = fs.statSync(file);
                if (file_stats && file_stats.size) {
                    sum_size += file_stats.size;
                }
            } catch (e) {

            }
        });
        download['percent_complete'] = (sum_size/resulting_file_size * 100).toFixed(2);
    });
}

// youtube-dl functions

async function startYoutubeDL() {
    // auto update youtube-dl
    await autoUpdateYoutubeDL();
}

// auto updates the underlying youtube-dl binary, not YoutubeDL-Material
async function autoUpdateYoutubeDL() {
    const download_sources = {
        'youtube-dl': {
            'tags_url': 'https://api.github.com/repos/ytdl-org/youtube-dl/tags',
            'func': downloadLatestYoutubeDLBinary
        },
        'youtube-dlc': {
            'tags_url': 'https://api.github.com/repos/blackjack4494/yt-dlc/tags',
            'func': downloadLatestYoutubeDLCBinary
        },
        'yt-dlp': {
            'tags_url': 'https://api.github.com/repos/yt-dlp/yt-dlp/tags',
            'func': downloadLatestYoutubeDLPBinary
        }
    }
    return new Promise(async resolve => {
        const default_downloader = config_api.getConfigItem('ytdl_default_downloader');
        const tags_url = download_sources[default_downloader]['tags_url'];
        // get current version
        let current_app_details_exists = fs.existsSync(CONSTS.DETAILS_BIN_PATH);
        if (!current_app_details_exists) {
            logger.warn(`Failed to get youtube-dl binary details at location '${CONSTS.DETAILS_BIN_PATH}'. Generating file...`);
            fs.writeJSONSync(CONSTS.DETAILS_BIN_PATH, {"version":"2020.00.00", "downloader": default_downloader});
        }
        let current_app_details = JSON.parse(fs.readFileSync(CONSTS.DETAILS_BIN_PATH));
        let current_version = current_app_details['version'];
        let current_downloader = current_app_details['downloader'];
        let stored_binary_path = current_app_details['path'];
        if (!stored_binary_path || typeof stored_binary_path !== 'string') {
            // logger.info(`INFO: Failed to get youtube-dl binary path at location: ${CONSTS.DETAILS_BIN_PATH}, attempting to guess actual path...`);
            const guessed_base_path = 'node_modules/youtube-dl/bin/';
            const guessed_file_path = guessed_base_path + 'youtube-dl' + (is_windows ? '.exe' : '');
            if (fs.existsSync(guessed_file_path)) {
                stored_binary_path = guessed_file_path;
                // logger.info('INFO: Guess successful! Update process continuing...')
            } else {
                logger.error(`Guess '${guessed_file_path}' is not correct. Cancelling update check. Verify that your youtube-dl binaries exist by running npm install.`);
                resolve(false);
                return;
            }
        }

        // got version, now let's check the latest version from the youtube-dl API


        fetch(tags_url, {method: 'Get'})
        .then(async res => res.json())
        .then(async (json) => {
            // check if the versions are different
            if (!json || !json[0]) {
                logger.error(`Failed to check ${default_downloader} version for an update.`)
                resolve(false);
                return false;
            }
            const latest_update_version = json[0]['name'];
            if (current_version !== latest_update_version || default_downloader !== current_downloader) {
                // versions different or different downloader is being used, download new update
                logger.info(`Found new update for ${default_downloader}. Updating binary...`);
                try {
                    await checkExistsWithTimeout(stored_binary_path, 10000);
                } catch(e) {
                    logger.error(`Failed to update ${default_downloader} - ${e}`);
                }
                
                await download_sources[default_downloader]['func'](latest_update_version);

                resolve(true);
            } else {
                resolve(false);
            }
        })
        .catch(err => {
            logger.error(`Failed to check ${default_downloader} version for an update.`)
            logger.error(err)
        });
    });
}

async function downloadLatestYoutubeDLBinary(new_version) {
    const file_ext = is_windows ? '.exe' : '';

    const download_url = `https://github.com/ytdl-org/youtube-dl/releases/latest/download/youtube-dl${file_ext}`;
    const output_path = `node_modules/youtube-dl/bin/youtube-dl${file_ext}`;

    await fetchFile(download_url, output_path, `youtube-dl ${new_version}`);

    updateDetailsJSON(new_version, 'youtube-dl');
}

async function downloadLatestYoutubeDLCBinary(new_version) {
    const file_ext = is_windows ? '.exe' : '';

    const download_url = `https://github.com/blackjack4494/yt-dlc/releases/latest/download/youtube-dlc${file_ext}`;
    const output_path = `node_modules/youtube-dl/bin/youtube-dl${file_ext}`;

    await fetchFile(download_url, output_path, `youtube-dlc ${new_version}`);

    updateDetailsJSON(new_version, 'youtube-dlc');
}

async function downloadLatestYoutubeDLPBinary(new_version) {
    const file_ext = is_windows ? '.exe' : '';

    const download_url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp${file_ext}`;
    const output_path = `node_modules/youtube-dl/bin/youtube-dl${file_ext}`;

    await fetchFile(download_url, output_path, `yt-dlp ${new_version}`);

    updateDetailsJSON(new_version, 'yt-dlp');
}

function updateDetailsJSON(new_version, downloader) {
    const details_json = fs.readJSONSync(CONSTS.DETAILS_BIN_PATH);
    if (new_version) details_json['version'] = new_version;
    details_json['downloader'] = downloader;
    fs.writeJSONSync(CONSTS.DETAILS_BIN_PATH, details_json);
}

async function checkExistsWithTimeout(filePath, timeout) {
    return new Promise(function (resolve, reject) {

        var timer = setTimeout(function () {
            if (watcher) watcher.close();
            reject(new Error('File did not exists and was not created during the timeout.'));
        }, timeout);

        fs.access(filePath, fs.constants.R_OK, function (err) {
            if (!err) {
                clearTimeout(timer);
                watcher.close();
                resolve();
            }
        });

        var dir = path.dirname(filePath);
        var basename = path.basename(filePath);
        var watcher = fs.watch(dir, function (eventType, filename) {
            if (eventType === 'rename' && filename === basename) {
                clearTimeout(timer);
                watcher.close();
                resolve();
            }
        });
    });
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

app.post('/api/restartServer', optionalJwt, (req, res) => {
    // delayed by a little bit so that the client gets a response
    setTimeout(() => {restartServer()}, 100);
    res.send({success: true});
});

app.post('/api/getDBInfo', optionalJwt, async (req, res) => {
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
    const type = req.body.type;
    var options = {
        customArgs: req.body.customArgs,
        customOutput: req.body.customOutput,
        selectedHeight: req.body.selectedHeight,
        customQualityConfiguration: req.body.customQualityConfiguration,
        youtubeUsername: req.body.youtubeUsername,
        youtubePassword: req.body.youtubePassword,
        ui_uid: req.body.ui_uid,
        user: req.isAuthenticated() ? req.user.uid : null,
        cropFileSettings: req.body.cropFileSettings
    }

    let result_obj = await downloadFileByURL_exec(url, type, options, req.query.sessionID);
    if (result_obj) {
        res.send(result_obj);
    } else {
        res.sendStatus(500);
    }
});

app.post('/api/killAllDownloads', optionalJwt, async function(req, res) {
    const result_obj = await killAllDownloads();
    res.send(result_obj);
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
    var uid = req.body.uid;
    var type = req.body.type;
    var uuid = req.body.uuid;

    var file = await db_api.getRecord('files', {uid: uid});

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
    const uuid = req.isAuthenticated() ? req.user.uid : null;

    files = await db_api.getRecords('files', {user_uid: uuid});
    playlists = await db_api.getRecords('playlists', {user_uid: uuid});

    const categories = await categories_api.getCategoriesAsPlaylists(files);
    if (categories) {
        playlists = playlists.concat(categories);
    }

    files = JSON.parse(JSON.stringify(files));

    res.send({
        files: files,
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
            // TODO: Implement. Main blocker right now is subscription videos are not stored in the DB, they are searched for every
            //          time they are requested from the subscription directory.
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

    // multi-user mode
    if (req.isAuthenticated()) {
        // if multi user mode, use this method instead
        success = auth_api.changeSharingMode(req.user.uid, uid, is_playlist, false);
        res.send({success: success});
        return;
    }

    // single-user mode
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
    let streamingOnly = req.body.streamingOnly;
    let audioOnly = req.body.audioOnly;
    let customArgs = req.body.customArgs;
    let customOutput = req.body.customFileOutput;
    let user_uid = req.isAuthenticated() ? req.user.uid : null;
    const new_sub = {
                        name: name,
                        url: url,
                        maxQuality: maxQuality,
                        id: uuid(),
                        streamingOnly: streamingOnly,
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

    let user_uid = req.isAuthenticated() ? req.user.uid : null;

    // get sub from db
    let subscription = null;
    if (subID) {
        subscription = await subscriptions_api.getSubscription(subID, user_uid)
    } else if (subName) {
        subscription = await subscriptions_api.getSubscriptionByName(subName, user_uid)
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
        if (!parsed_files) {
            parsed_files = [];
            let base_path = null;
            if (user_uid)
                base_path = path.join(config_api.getConfigItem('ytdl_users_base_path'), user_uid, 'subscriptions');
            else
                base_path = config_api.getConfigItem('ytdl_subscriptions_base_path');

            let appended_base_path = path.join(base_path, (subscription.isPlaylist ? 'playlists' : 'channels'), subscription.name, '/');
            let files;
            try {
                files = await utils.recFindByExt(appended_base_path, 'mp4');
            } catch(e) {
                files = null;
                logger.info('Failed to get folder for subscription: ' + subscription.name + ' at path ' + appended_base_path);
                res.sendStatus(500);
                return;
            }
            for (let i = 0; i < files.length; i++) {
                let file = files[i];
                var file_path = file.substring(appended_base_path.length, file.length);
                var stats = fs.statSync(file);

                var id = file_path.substring(0, file_path.length-4);
                var jsonobj = utils.getJSONMp4(id, appended_base_path);
                if (!jsonobj) continue;
                var title = jsonobj.title;

                var thumbnail = jsonobj.thumbnail;
                var duration = jsonobj.duration;
                var url = jsonobj.webpage_url;
                var uploader = jsonobj.uploader;
                var upload_date = jsonobj.upload_date;
                upload_date = `${upload_date.substring(0, 4)}-${upload_date.substring(4, 6)}-${upload_date.substring(6, 8)}`;
                var size = stats.size;

                var isaudio = false;
                var file_obj = new utils.File(id, title, thumbnail, isaudio, duration, url, uploader, size, file, upload_date, jsonobj.description, jsonobj.view_count, jsonobj.height, jsonobj.abr);
                parsed_files.push(file_obj);
            }
        } else {
            // loop through files for extra processing
            for (let i = 0; i < parsed_files.length; i++) {
                const file = parsed_files[i];
                // check if chat exists for twitch videos
                if (file && file['url'].includes('twitch.tv')) file['chat_exists'] = fs.existsSync(file['path'].substring(0, file['path'].length - 4) + '.twitch_chat.json');
            }
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

    const playlists = await db_api.getRecords('playlists', {user_uid: uuid});

    res.send({
        playlists: playlists
    });
});

app.post('/api/updatePlaylistFiles', optionalJwt, async (req, res) => {
    let playlistID = req.body.playlist_id;
    let uids = req.body.uids;

    let success = false;
    try {
        if (req.isAuthenticated()) {
            auth_api.updatePlaylistFiles(req.user.uid, playlistID, uids);
        } else {
            await db_api.updateRecord('playlists', {id: playlistID}, {uids: uids})
        }

        success = true;
    } catch(e) {
        logger.error(`Failed to find playlist with ID ${playlistID}`);
    }

    res.send({
        success: success
    })
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
        file_path_to_download = await utils.createContainerZipFile(playlist, playlist_files_to_download);
    } else if (sub_id && !uid) {
        zip_file_generated = true;
        const sub_files_to_download = [];
        const sub = subscriptions_api.getSubscription(sub_id, uuid);
        for (let i = 0; i < sub['videos'].length; i++) {
            const sub_file = sub['videos'][i];
            sub_files_to_download.push(sub_file);
        }

        // generate zip
        file_path_to_download = await utils.createContainerZipFile(sub, sub_files_to_download);
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
            logger.error("Failed to remove file", file);
          }
        }
    });
});

app.post('/api/downloadArchive', async (req, res) => {
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

app.get('/api/updaterStatus', async (req, res) => {
    let status = updaterStatus;

    if (status) {
        res.send(updaterStatus);
    } else {
        res.sendStatus(404);
    }

});

app.post('/api/updateServer', async (req, res) => {
    let tag = req.body.tag;

    updateServer(tag);

    res.send({
        success: true
    });

});

// API Key API calls

app.post('/api/generateNewAPIKey', function (req, res) {
    const new_api_key = uuid();
    config_api.setConfigItem('ytdl_api_key', new_api_key);
    res.send({new_api_key: new_api_key});
});

// Streaming API calls

app.get('/api/stream', optionalJwt, async (req, res) => {
    const type = req.query.type;
    const uuid = req.query.uuid ? req.query.uuid : (req.user ? req.user.uid : null);
    const sub_id = req.query.sub_id;
    const ext = type === 'audio' ? '.mp3' : '.mp4';
    const mimetype = type === 'audio' ? 'audio/mp3' : 'video/mp4';
    var head;
    let optionalParams = url_api.parse(req.url,true).query;
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
    const stat = fs.statSync(file_path)
    const fileSize = stat.size
    const range = req.headers.range
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

  app.get('/api/downloads', async (req, res) => {
    res.send({downloads: downloads});
  });

  app.post('/api/download', async (req, res) => {
    const session_id = req.body.session_id;
    const download_id = req.body.download_id;
    const session_downloads = downloads.find(potential_session_downloads => potential_session_downloads['session_id'] === session_id);
    let found_download = null;

    // find download
    if (session_downloads && Object.keys(session_downloads)) {
        found_download = Object.values(session_downloads).find(session_download => session_download['ui_uid'] === download_id);
    }

    if (found_download) {
        res.send({download: found_download});
    } else {
        res.send({download: null});
    }
  });

  app.post('/api/clearDownloads', async (req, res) => {
    let success = false;
    var delete_all = req.body.delete_all;
    if (!req.body.session_id) req.body.session_id = 'undeclared';
    var session_id = req.body.session_id;
    var download_id = req.body.download_id;
    if (delete_all) {
        // delete all downloads
        downloads = [];
        success = true;
    } else if (download_id) {
        // delete just 1 download
        const session_downloads = downloads.find(session => session['session_id'] === session_id);
        if (session_downloads && session_downloads[download_id]) {
            delete session_downloads[download_id];
            success = true;
        } else if (!session_downloads) {
            logger.error(`Session ${session_id} has no downloads.`)
        } else if (!session_downloads[download_id]) {
            logger.error(`Download '${download_id}' for session '${session_id}' could not be found`);
        }
    } else if (session_id) {
        // delete a session's downloads
        downloads = downloads.filter(session => session['session_id'] !== session_id);
    }
    updateDownloads();
    res.send({success: success, downloads: downloads});
  });

// logs management

app.post('/api/logs', async function(req, res) {
    let logs = null;
    let lines = req.body.lines;
    logs_path = path.join('appdata', 'logs', 'combined.log')
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

app.post('/api/clearAllLogs', async function(req, res) {
    logs_path = path.join('appdata', 'logs', 'combined.log');
    logs_err_path = path.join('appdata', 'logs', 'error.log');
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

  app.post('/api/getVideoInfos', async (req, res) => {
    let fileNames = req.body.fileNames;
    let urlMode = !!req.body.urlMode;
    let type = req.body.type;
    let result = null;
    if (!urlMode) {
        if (type === 'audio' || type === 'video') {
            result = await getAudioOrVideoInfos(type, fileNames);
        }
    } else {
        result = await getUrlInfos(fileNames);
    }
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
        res.send({success: true});
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
