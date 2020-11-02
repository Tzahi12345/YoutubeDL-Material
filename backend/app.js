const { uuid } = require('uuidv4');
var fs = require('fs-extra');
var { promisify } = require('util');
var auth_api = require('./authentication/auth');
var winston = require('winston');
var path = require('path');
var youtubedl = require('youtube-dl');
var ffmpeg = require('fluent-ffmpeg');
var compression = require('compression');
var glob = require("glob")
var multer  = require('multer');
var express = require("express");
var bodyParser = require("body-parser");
var archiver = require('archiver');
var unzipper = require('unzipper');
var db_api = require('./db')
var utils = require('./utils')
var mergeFiles = require('merge-files');
const low = require('lowdb')
var ProgressBar = require('progress');
const NodeID3 = require('node-id3')
const downloader = require('youtube-dl/lib/downloader')
const fetch = require('node-fetch');
var URL = require('url').URL;
const shortid = require('shortid')
const url_api = require('url');
var config_api = require('./config.js');
var subscriptions_api = require('./subscriptions')
var categories_api = require('./categories');
const CONSTS = require('./consts')
const { spawn } = require('child_process')
const read_last_lines = require('read-last-lines');
var ps = require('ps-node');

const is_windows = process.platform === 'win32';

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
auth_api.initialize(users_db, logger);
db_api.initialize(db, users_db, logger);
subscriptions_api.initialize(db, users_db, logger, db_api);
categories_api.initialize(db, users_db, logger, db_api);

// Set some defaults
db.defaults(
    {
        playlists: {
            audio: [],
            video: []
        },
        files: {
            audio: [],
            video: []
        },
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
var subscriptionsCheckInterval = null;
var archivePath = path.join(__dirname, 'appdata', 'archives');

// other needed values
var url_domain = null;
var updaterStatus = null;

var timestamp_server_start = Date.now();

if (debugMode) logger.info('YTDL-Material in debug mode!');

// check if just updated
const just_restarted = fs.existsSync('restart.json');
if (just_restarted) {
    updaterStatus = {
        updating: false,
        details: 'Update complete! You are now on ' + CONSTS['CURRENT_VERSION']
    }
    fs.unlinkSync('restart.json');
}

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

var downloads = {};

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// use passport
app.use(auth_api.passport.initialize());

// actual functions

/**
 * setTimeout, but its a promise.
 * @param {number} ms
 */
async function wait(ms) {
    await new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

async function checkMigrations() {
    // 3.5->3.6 migration
    const files_to_db_migration_complete = true; // migration phased out! previous code: db.get('files_to_db_migration_complete').value();

    if (!files_to_db_migration_complete) {
        logger.info('Beginning migration: 3.5->3.6+')
        const success = await runFilesToDBMigration()
        if (success) { logger.info('3.5->3.6+ migration complete!'); }
        else { logger.error('Migration failed: 3.5->3.6+'); }
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
                await db_api.registerFileDB(file_obj.id + '.mp3', 'audio');
            }
        }

        for (let i = 0; i < mp4s.length; i++) {
            let file_obj = mp4s[i];
            const file_already_in_db = db.get('files.video').find({id: file_obj.id}).value();
            if (!file_already_in_db) {
                logger.verbose(`Migrating file ${file_obj.id}`);
                await db_api.registerFileDB(file_obj.id + '.mp4', 'video');
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

async function restartServer() {
    const restartProcess = () => {
        spawn('node', ['app.js'], {
          detached: true,
          stdio: 'inherit'
        }).unref()
        process.exit()
    }
    logger.info('Update complete! Restarting server...');

    // the following line restarts the server through nodemon
    fs.writeFileSync('restart.json', 'internal use only');
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
        restartServer();
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
    await wait(100);
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
    await wait(100);
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
        await wait(100);
        return true;
    } else {
        logger.error('ERROR: Failed to set config items using ENV variables.');
        return false;
    }
}

async function loadConfig() {
    loadConfigValues();

    // creates archive path if missing
    await fs.ensureDir(archivePath);

    // now this is done here due to youtube-dl's repo takedown
    await startYoutubeDL();

    // get subscriptions
    if (allowSubscriptions) {
        // runs initially, then runs every ${subscriptionCheckInterval} seconds
        watchSubscriptions();
        setInterval(() => {
            watchSubscriptions();
        }, subscriptionsCheckInterval * 1000);
    }

    db_api.importUnregisteredFiles();

    // check migrations
    await checkMigrations();

    // load in previous downloads
    downloads = db.get('downloads').value();

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
    subscriptionsCheckInterval = config_api.getConfigItem('ytdl_subscriptions_check_interval');

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
    let interval_in_ms = subscriptionsCheckInterval * 1000;
    const subinterval_in_ms = interval_in_ms/subscriptions_amount;
    return subinterval_in_ms;
}

async function watchSubscriptions() {
    let subscriptions = null;

    const multiUserMode = config_api.getConfigItem('ytdl_multi_user_mode');
    if (multiUserMode) {
        subscriptions = [];
        let users = users_db.get('users').value();
        for (let i = 0; i < users.length; i++) {
            if (users[i]['subscriptions']) subscriptions = subscriptions.concat(users[i]['subscriptions']);
        }
    } else {
        subscriptions = subscriptions_api.getAllSubscriptions();
    }

    if (!subscriptions) return;

    let subscriptions_amount = subscriptions.length;
    let delay_interval = calculateSubcriptionRetrievalDelay(subscriptions_amount);

    let current_delay = 0;
    for (let i = 0; i < subscriptions.length; i++) {
        let sub = subscriptions[i];

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

async function getMp3s() {
    let mp3s = [];
    var files = await utils.recFindByExt(audioFolderPath, 'mp3'); // fs.readdirSync(audioFolderPath);
    for (let i = 0; i < files.length; i++) {
        let file = files[i];
        var file_path = file.substring(audioFolderPath.length, file.length);

        var stats = await fs.stat(file);

        var id = file_path.substring(0, file_path.length-4);
        var jsonobj = await utils.getJSONMp3(id, audioFolderPath);
        if (!jsonobj) continue;
        var title = jsonobj.title;
        var url = jsonobj.webpage_url;
        var uploader = jsonobj.uploader;
        var upload_date = jsonobj.upload_date;
        upload_date = upload_date ? `${upload_date.substring(0, 4)}-${upload_date.substring(4, 6)}-${upload_date.substring(6, 8)}` : null;

        var size = stats.size;

        var thumbnail = jsonobj.thumbnail;
        var duration = jsonobj.duration;
        var isaudio = true;
        var file_obj = new utils.File(id, title, thumbnail, isaudio, duration, url, uploader, size, file, upload_date);
        mp3s.push(file_obj);
    }
    return mp3s;
}

async function getMp4s(relative_path = true) {
    let mp4s = [];
    var files = await utils.recFindByExt(videoFolderPath, 'mp4');
    for (let i = 0; i < files.length; i++) {
        let file = files[i];
        var file_path = file.substring(videoFolderPath.length, file.length);

        var stats = fs.statSync(file);

        var id = file_path.substring(0, file_path.length-4);
        var jsonobj = await utils.getJSONMp4(id, videoFolderPath);
        if (!jsonobj) continue;
        var title = jsonobj.title;
        var url = jsonobj.webpage_url;
        var uploader = jsonobj.uploader;
        var upload_date = jsonobj.upload_date;
        upload_date = upload_date ? `${upload_date.substring(0, 4)}-${upload_date.substring(4, 6)}-${upload_date.substring(6, 8)}` : null;
        var thumbnail = jsonobj.thumbnail;
        var duration = jsonobj.duration;

        var size = stats.size;

        var isaudio = false;
        var file_obj = new utils.File(id, title, thumbnail, isaudio, duration, url, uploader, size, file, upload_date);
        mp4s.push(file_obj);
    }
    return mp4s;
}

function getThumbnailMp3(name)
{
    var obj = utils.getJSONMp3(name, audioFolderPath);
    var thumbnailLink = obj.thumbnail;
    return thumbnailLink;
}

function getThumbnailMp4(name)
{
    var obj = utils.getJSONMp4(name, videoFolderPath);
    var thumbnailLink = obj.thumbnail;
    return thumbnailLink;
}

function getFileSizeMp3(name)
{
    var jsonPath = audioFolderPath+name+".mp3.info.json";

    if (fs.existsSync(jsonPath))
        var obj = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    else
        var obj = 0;

    return obj.filesize;
}

function getFileSizeMp4(name)
{
    var jsonPath = videoFolderPath+name+".info.json";
    var filesize = 0;
    if (fs.existsSync(jsonPath))
    {
        var obj = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        var format = obj.format.substring(0,3);
        for (i = 0; i < obj.formats.length; i++)
        {
            if (obj.formats[i].format_id == format)
            {
                filesize = obj.formats[i].filesize;
            }
        }
    }

    return filesize;
}

function getAmountDownloadedMp3(name)
{
    var partPath = audioFolderPath+name+".mp3.part";
    if (fs.existsSync(partPath))
    {
        const stats = fs.statSync(partPath);
        const fileSizeInBytes = stats.size;
        return fileSizeInBytes;
    }
    else
        return 0;
}



function getAmountDownloadedMp4(name)
{
    var format = getVideoFormatID(name);
    var partPath = videoFolderPath+name+".f"+format+".mp4.part";
    if (fs.existsSync(partPath))
    {
        const stats = fs.statSync(partPath);
        const fileSizeInBytes = stats.size;
        return fileSizeInBytes;
    }
    else
        return 0;
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

async function createPlaylistZipFile(fileNames, type, outputName, fullPathProvided = null, user_uid = null) {
    let zipFolderPath = null;

    if (!fullPathProvided) {
        zipFolderPath = path.join(__dirname, (type === 'audio') ? audioFolderPath : videoFolderPath);
        if (user_uid) zipFolderPath = path.join(config_api.getConfigItem('ytdl_users_base_path'), user_uid, zipFolderPath);
    } else {
        zipFolderPath = path.join(__dirname, config_api.getConfigItem('ytdl_subscriptions_base_path'));
    }

    let ext = (type === 'audio') ? '.mp3' : '.mp4';

    let output = fs.createWriteStream(path.join(zipFolderPath, outputName + '.zip'));

    var archive = archiver('zip', {
        gzip: true,
        zlib: { level: 9 } // Sets the compression level.
    });

    archive.on('error', function(err) {
        logger.error(err);
        throw err;
    });

    // pipe archive data to the output file
    archive.pipe(output);

    for (let i = 0; i < fileNames.length; i++) {
        let fileName = fileNames[i];
        let fileNamePathRemoved = path.parse(fileName).base;
        let file_path = !fullPathProvided ? path.join(zipFolderPath, fileName + ext) : fileName;
        archive.file(file_path, {name: fileNamePathRemoved + ext})
    }

    await archive.finalize();

    // wait a tiny bit for the zip to reload in fs
    await wait(100);
    return path.join(zipFolderPath,outputName + '.zip');
}

async function deleteAudioFile(name, customPath = null, blacklistMode = false) {
    let filePath = customPath ? customPath : audioFolderPath;

    var jsonPath = path.join(filePath,name+'.mp3.info.json');
    var altJSONPath = path.join(filePath,name+'.info.json');
    var audioFilePath = path.join(filePath,name+'.mp3');
    var thumbnailPath = path.join(filePath,name+'.webp');
    var altThumbnailPath = path.join(filePath,name+'.jpg');

    jsonPath = path.join(__dirname, jsonPath);
    altJSONPath = path.join(__dirname, altJSONPath);
    audioFilePath = path.join(__dirname, audioFilePath);

    let jsonExists = await fs.pathExists(jsonPath);
    let thumbnailExists = await fs.pathExists(thumbnailPath);

    if (!jsonExists) {
        if (await fs.pathExists(altJSONPath)) {
            jsonExists = true;
            jsonPath = altJSONPath;
        }
    }

    if (!thumbnailExists) {
        if (await fs.pathExists(altThumbnailPath)) {
            thumbnailExists = true;
            thumbnailPath = altThumbnailPath;
        }
    }

    let audioFileExists = await fs.pathExists(audioFilePath);

    if (config_api.descriptors[name]) {
        try {
            for (let i = 0; i < config_api.descriptors[name].length; i++) {
                config_api.descriptors[name][i].destroy();
            }
        } catch(e) {

        }
    }

    let useYoutubeDLArchive = config_api.getConfigItem('ytdl_use_youtubedl_archive');
    if (useYoutubeDLArchive) {
        const archive_path = path.join(archivePath, 'archive_audio.txt');

        // get ID from JSON

        var jsonobj = await utils.getJSONMp3(name, filePath);
        let id = null;
        if (jsonobj) id = jsonobj.id;

        // use subscriptions API to remove video from the archive file, and write it to the blacklist
        if (await fs.pathExists(archive_path)) {
            const line = id ? await subscriptions_api.removeIDFromArchive(archive_path, id) : null;
            if (blacklistMode && line) await writeToBlacklist('audio', line);
        } else {
            logger.info('Could not find archive file for audio files. Creating...');
            await fs.close(await fs.open(archive_path, 'w'));
        }
    }

    if (jsonExists) await fs.unlink(jsonPath);
    if (thumbnailExists) await fs.unlink(thumbnailPath);
    if (audioFileExists) {
        await fs.unlink(audioFilePath);
        if (await fs.pathExists(jsonPath) || await fs.pathExists(audioFilePath)) {
            return false;
        } else {
            return true;
        }
    } else {
        // TODO: tell user that the file didn't exist
        return true;
    }
}

async function deleteVideoFile(name, customPath = null, blacklistMode = false) {
    let filePath = customPath ? customPath : videoFolderPath;
    var jsonPath = path.join(filePath,name+'.info.json');

    var altJSONPath = path.join(filePath,name+'.mp4.info.json');
    var videoFilePath = path.join(filePath,name+'.mp4');
    var thumbnailPath = path.join(filePath,name+'.webp');
    var altThumbnailPath = path.join(filePath,name+'.jpg');

    jsonPath = path.join(__dirname, jsonPath);
    videoFilePath = path.join(__dirname, videoFilePath);

    let jsonExists = await fs.pathExists(jsonPath);
    let videoFileExists = await fs.pathExists(videoFilePath);
    let thumbnailExists = await fs.pathExists(thumbnailPath);

    if (!jsonExists) {
        if (await fs.pathExists(altJSONPath)) {
            jsonExists = true;
            jsonPath = altJSONPath;
        }
    }

    if (!thumbnailExists) {
        if (await fs.pathExists(altThumbnailPath)) {
            thumbnailExists = true;
            thumbnailPath = altThumbnailPath;
        }
    }

    if (config_api.descriptors[name]) {
        try {
            for (let i = 0; i < config_api.descriptors[name].length; i++) {
                config_api.descriptors[name][i].destroy();
            }
        } catch(e) {

        }
    }

    let useYoutubeDLArchive = config_api.getConfigItem('ytdl_use_youtubedl_archive');
    if (useYoutubeDLArchive) {
        const archive_path = path.join(archivePath, 'archive_video.txt');

        // get ID from JSON

        var jsonobj = await utils.getJSONMp4(name, filePath);
        let id = null;
        if (jsonobj) id = jsonobj.id;

        // use subscriptions API to remove video from the archive file, and write it to the blacklist
        if (await fs.pathExists(archive_path)) {
            const line = id ? await subscriptions_api.removeIDFromArchive(archive_path, id) : null;
            if (blacklistMode && line) await writeToBlacklist('video', line);
        } else {
            logger.info('Could not find archive file for videos. Creating...');
            fs.closeSync(fs.openSync(archive_path, 'w'));
        }
    }

    if (jsonExists) await fs.unlink(jsonPath);
    if (thumbnailExists) await fs.unlink(thumbnailPath);
    if (videoFileExists) {
        await fs.unlink(videoFilePath);
        if (await fs.pathExists(jsonPath) || await fs.pathExists(videoFilePath)) {
            return false;
        } else {
            return true;
        }
    } else {
        // TODO: tell user that the file didn't exist
        return true;
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
        if (!downloads[session]) downloads[session] = {};
        downloads[session][download_uid] = {
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
        const download = downloads[session][download_uid];
        updateDownloads();

        // get video info prior to download
        let info = await getVideoInfoByURL(url, downloadConfig, download);
        if (!info) {
            resolve(false);
            return;
        } else {
            // check if it fits into a category. If so, then get info again using new downloadConfig
            category = await categories_api.categorize(info);

            // set custom output if the category has one and re-retrieve info so the download manager has the right file name
            if (category && category['custom_output']) {
                options.customOutput = category['custom_output'];
                options.noRelativePath = true;
                downloadConfig = await generateArgs(url, type, options);
                info = await getVideoInfoByURL(url, downloadConfig, download);
            }

            // store info in download for future use
            download['_filename'] = info['_filename'];
            download['filesize'] = utils.getExpectedFileSize(info);
        }

        const download_checker = setInterval(() => checkDownloadPercent(download), 1000);

        // download file
        youtubedl.exec(url, downloadConfig, {}, function(err, output) {
            clearInterval(download_checker); // stops the download checker from running as the download finished (or errored)

            download['downloading'] = false;
            download['timestamp_end'] = Date.now();
            var file_uid = null;
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
                    const filepath_no_extension = removeFileExtension(output_json['_filename']);

                    var full_file_path = filepath_no_extension + ext;
                    var file_name = filepath_no_extension.substring(fileFolderPath.length, filepath_no_extension.length);

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
                        let success = NodeID3.write(tags, output_json['_filename']);
                        if (!success) logger.error('Failed to apply ID3 tag to audio file ' + output_json['_filename']);
                    }

                    const file_path = options.noRelativePath ? path.basename(full_file_path) : full_file_path.substring(fileFolderPath.length, full_file_path.length);
                    const customPath = options.noRelativePath ? path.dirname(full_file_path).split(path.sep).pop() : null;

                    // registers file in DB
                    file_uid = db_api.registerFileDB(file_path, type, multiUserMode, null, customPath);

                    if (file_name) file_names.push(file_name);
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

                var videopathEncoded = encodeURIComponent(file_names[0]);

                resolve({
                    [(type === 'audio') ? 'audiopathEncoded' : 'videopathEncoded']: videopathEncoded,
                    file_names: is_playlist ? file_names : null,
                    uid: file_uid
                });
            }
        });
    });
}

async function downloadFileByURL_normal(url, type, options, sessionID = null) {
    return new Promise(async resolve => {
        var date = Date.now();
        var file_uid = null;
        const is_audio = type === 'audio';
        const ext = is_audio ? '.mp3' : '.mp4';
        var fileFolderPath = is_audio ? audioFolderPath : videoFolderPath;

        if (is_audio && url.includes('youtu')) { options.skip_audio_args = true; }

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

        options.downloading_method = 'normal';
        const downloadConfig = await generateArgs(url, type, options);

        // adds download to download helper
        const download_uid = uuid();
        const session = sessionID ? sessionID : 'undeclared';
        if (!downloads[session]) downloads[session] = {};
        downloads[session][download_uid] = {
            uid: download_uid,
            ui_uid: options.ui_uid,
            downloading: true,
            complete: false,
            url: url,
            type: type,
            percent_complete: 0,
            is_playlist: url.includes('playlist'),
            timestamp_start: Date.now()
        };
        const download = downloads[session][download_uid];
        updateDownloads();

        const video = youtubedl(url,
            // Optional arguments passed to youtube-dl.
            downloadConfig,
            // Additional options can be given for calling `child_process.execFile()`.
            { cwd: __dirname });

        let video_info = null;
        let file_size = 0;

        // Will be called when the download starts.
        video.on('info', function(info) {
            video_info = info;
            file_size = video_info.size;
            const json_path = removeFileExtension(video_info._filename) + '.info.json';
            fs.ensureFileSync(json_path);
            fs.writeJSONSync(json_path, video_info);
            video.pipe(fs.createWriteStream(video_info._filename, { flags: 'w' }))
        });
        // Will be called if download was already completed and there is nothing more to download.
        video.on('complete', function complete(info) {
            'use strict'
            logger.info('file ' + info._filename + ' already downloaded.')
        })

        let download_pos = 0;
        video.on('data', function data(chunk) {
            download_pos += chunk.length
            // `size` should not be 0 here.
            if (file_size) {
              let percent = (download_pos / file_size * 100).toFixed(2)
              download['percent_complete'] = percent;
            }
        });

        video.on('end', async function() {
            let new_date = Date.now();
            let difference = (new_date - date)/1000;
            logger.debug(`Video download delay: ${difference} seconds.`);
            download['timestamp_end'] = Date.now();
            download['fileNames'] = [removeFileExtension(video_info._filename) + ext];
            download['complete'] = true;
            updateDownloads();

            // audio-only cleanup
            if (is_audio) {
                // filename fix
                video_info['_filename'] = removeFileExtension(video_info['_filename']) + '.mp3';

                // ID3 tagging
                let tags = {
                    title: video_info['title'],
                    artist: video_info['artist'] ? video_info['artist'] : video_info['uploader']
                }
                let success = NodeID3.write(tags, video_info._filename);
                if (!success) logger.error('Failed to apply ID3 tag to audio file ' + video_info._filename);

                const possible_webm_path = removeFileExtension(video_info['_filename']) + '.webm';
                const possible_mp4_path = removeFileExtension(video_info['_filename']) + '.mp4';
                // check if audio file is webm
                if (fs.existsSync(possible_webm_path)) await convertFileToMp3(possible_webm_path, video_info['_filename']);
                else if (fs.existsSync(possible_mp4_path)) await convertFileToMp3(possible_mp4_path, video_info['_filename']);
            }

            // registers file in DB
            const base_file_name = video_info._filename.substring(fileFolderPath.length, video_info._filename.length);
            file_uid = db_api.registerFileDB(base_file_name, type, multiUserMode);

            if (options.merged_string !== null && options.merged_string !== undefined) {
                let current_merged_archive = fs.readFileSync(path.join(fileFolderPath, `merged_${type}.txt`), 'utf8');
                let diff = current_merged_archive.replace(options.merged_string, '');
                const archive_path = options.user ? path.join(fileFolderPath, 'archives', `archive_${type}.txt`) : path.join(archivePath, `archive_${type}.txt`);
                fs.appendFileSync(archive_path, diff);
            }

            videopathEncoded = encodeURIComponent(removeFileExtension(base_file_name));

            resolve({
                [is_audio ? 'audiopathEncoded' : 'videopathEncoded']: videopathEncoded,
                file_names: /*is_playlist ? file_names :*/ null, // playlist support is not ready
                uid: file_uid
            });
        });

        video.on('error', function error(err) {
            logger.error(err);

            download[error] = err;
            updateDownloads();

            resolve(false);
        });
    });

}

async function generateArgs(url, type, options) {
    var videopath = '%(title)s';
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
        } else if (maxBitrate && is_audio) {
            qualityPath = ['--audio-quality', maxBitrate]
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

    }
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
                if (download) {
                    download['error'] = `Failed pre-check for video info: ${err}`;
                    updateDownloads();
                }
                resolve(null);
            }
        });
    });
}

// currently only works for single urls
async function getUrlInfos(urls) {
    let startDate = Date.now();
    let result = [];
    return new Promise(resolve => {
        youtubedl.exec(urls.join(' '), ['--dump-json'], {}, (err, output) => {
            let new_date = Date.now();
            let difference = (new_date - startDate)/1000;
            logger.debug(`URL info retrieval delay: ${difference} seconds.`);
            if (err) {
                logger.error('Error during parsing:' + err);
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

async function convertFileToMp3(input_file, output_file) {
    logger.verbose(`Converting ${input_file} to ${output_file}...`);
    return new Promise(resolve => {
        ffmpeg(input_file).noVideo().toFormat('mp3')
        .on('end', () => {
            logger.verbose(`Conversion for '${output_file}' complete.`);
            fs.unlinkSync(input_file)
            resolve(true);
        })
        .on('error', (err) => {
            logger.error('Failed to convert audio file to the correct format.');
            logger.error(err);
            resolve(false);
        }).save(output_file);
    });
}

async function writeToBlacklist(type, line) {
    let blacklistPath = path.join(archivePath, (type === 'audio') ? 'blacklist_audio.txt' : 'blacklist_video.txt');
    // adds newline to the beginning of the line
    line = '\n' + line;
    await fs.appendFile(blacklistPath, line);
}

// download management functions

function updateDownloads() {
    db.assign({downloads: downloads}).write();
}

function checkDownloadPercent(download) {
    /*
    This is more of an art than a science, we're just selecting files that start with the file name,
    thus capturing the parts being downloaded in files named like so: '<video title>.<format>.<ext>.part'.

    Any file that starts with <video title> will be counted as part of the "bytes downloaded", which will
    be divided by the "total expected bytes."
    */
    const file_id = download['file_id'];
    const filename = path.format(path.parse(download['_filename'].substring(0, download['_filename'].length-4)));
    const resulting_file_size = download['filesize'];

    if (!resulting_file_size) return;

    glob(`${filename}*`, (err, files) => {
        let sum_size = 0;
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
        updateDownloads();
    });
}

// youtube-dl functions

async function startYoutubeDL() {
    // auto update youtube-dl
    await autoUpdateYoutubeDL();
}

// auto updates the underlying youtube-dl binary, not YoutubeDL-Material
async function autoUpdateYoutubeDL() {
    return new Promise(async resolve => {
        const default_downloader = config_api.getConfigItem('ytdl_default_downloader');
        const using_youtube_dlc = default_downloader === 'youtube-dlc';
        const youtube_dl_tags_url = 'https://api.github.com/repos/ytdl-org/youtube-dl/tags'
        const youtube_dlc_tags_url = 'https://api.github.com/repos/blackjack4494/yt-dlc/tags'
        // get current version
        let current_app_details_path = 'node_modules/youtube-dl/bin/details';
        let current_app_details_exists = fs.existsSync(current_app_details_path);
        if (!current_app_details_exists) {
            logger.error(`Failed to get youtube-dl binary details at location '${current_app_details_path}'. Cancelling update check.`);
            resolve(false);
            return;
        }
        let current_app_details = JSON.parse(fs.readFileSync(current_app_details_path));
        let current_version = current_app_details['version'];
        let stored_binary_path = current_app_details['path'];
        if (!stored_binary_path || typeof stored_binary_path !== 'string') {
            // logger.info(`INFO: Failed to get youtube-dl binary path at location: ${current_app_details_path}, attempting to guess actual path...`);
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
        let youtubedl_api_path = using_youtube_dlc ? youtube_dlc_tags_url : youtube_dl_tags_url;

        if (default_downloader === 'youtube-dl') {
            await downloadLatestYoutubeDLBinary('unknown', 'unknown');
            resolve(true);
            return;
        }

        fetch(youtubedl_api_path, {method: 'Get'})
        .then(async res => res.json())
        .then(async (json) => {
            // check if the versions are different
            if (!json || !json[0]) {
                logger.error(`Failed to check ${default_downloader} version for an update.`)
                resolve(false);
                return false;
            }
            const latest_update_version = json[0]['name'];
            if (current_version !== latest_update_version) {
                // versions different, download new update
                logger.info(`Found new update for ${default_downloader}. Updating binary...`);
                try {
                    await checkExistsWithTimeout(stored_binary_path, 10000);
                } catch(e) {
                    logger.error(`Failed to update ${default_downloader} - ${e}`);
                }
                if (using_youtube_dlc) await downloadLatestYoutubeDLCBinary(latest_update_version);
                else await downloadLatestYoutubeDLBinary(current_version, latest_update_version);

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

async function downloadLatestYoutubeDLBinary(current_version, new_version) {
    return new Promise(resolve => {
        let binary_path = 'node_modules/youtube-dl/bin';
        downloader(binary_path, function error(err, done) {
            if (err) {
                logger.error(err);
                resolve(false);
            }
            logger.info(`youtube-dl successfully updated!`);
            resolve(true);
        });
    });
}

async function downloadLatestYoutubeDLCBinary(new_version) {
    const file_ext = is_windows ? '.exe' : '';

    const download_url = `https://github.com/blackjack4494/yt-dlc/releases/latest/download/youtube-dlc${file_ext}`;
    const output_path = `node_modules/youtube-dl/bin/youtube-dl${file_ext}`;

    await fetchFile(download_url, output_path, `youtube-dlc ${new_version}`);

    const details_path = 'node_modules/youtube-dl/bin/details';
    const details_json = fs.readJSONSync('node_modules/youtube-dl/bin/details');
    details_json['version'] = new_version;

    fs.writeJSONSync(details_path, details_json);
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

function removeFileExtension(filename) {
    const filename_parts = filename.split('.');
    filename_parts.splice(filename_parts.length - 1)
    return filename_parts.join('.');
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
    } else if (req.path.includes('/api/stream/')) {
        next();
    } else {
        logger.verbose(`Rejecting request - invalid API use for endpoint: ${req.path}. API key received: ${req.query.apiKey}`);
        req.socket.end();
    }
});

app.use(compression());

const optionalJwt = function (req, res, next) {
    const multiUserMode = config_api.getConfigItem('ytdl_multi_user_mode');
    if (multiUserMode && ((req.body && req.body.uuid) || (req.query && req.query.uuid)) && (req.path.includes('/api/getFile') ||
                                                                                            req.path.includes('/api/stream') ||
                                                                                            req.path.includes('/api/downloadFile'))) {
        // check if shared video
        const using_body = req.body && req.body.uuid;
        const uuid = using_body ? req.body.uuid : req.query.uuid;
        const uid = using_body ? req.body.uid : req.query.uid;
        const type = using_body ? req.body.type : req.query.type;
        const playlist_id = using_body ? req.body.id : req.query.id;
        const file = !playlist_id ? auth_api.getUserVideo(uuid, uid, type, true, req.body) : auth_api.getUserPlaylist(uuid, playlist_id, null, false);
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

app.post('/api/tomp3', optionalJwt, async function(req, res) {
    var url = req.body.url;
    var options = {
        customArgs: req.body.customArgs,
        customOutput: req.body.customOutput,
        maxBitrate: req.body.maxBitrate,
        customQualityConfiguration: req.body.customQualityConfiguration,
        youtubeUsername: req.body.youtubeUsername,
        youtubePassword: req.body.youtubePassword,
        ui_uid: req.body.ui_uid,
        user: req.isAuthenticated() ? req.user.uid : null
    }

    const safeDownloadOverride = config_api.getConfigItem('ytdl_safe_download_override') || config_api.globalArgsRequiresSafeDownload();
    if (safeDownloadOverride) logger.verbose('Download is running with the safe download override.');
    const is_playlist = url.includes('playlist');

    let result_obj = null;
    if (true || safeDownloadOverride || is_playlist || options.customQualityConfiguration || options.customArgs || options.maxBitrate)
        result_obj = await downloadFileByURL_exec(url, 'audio', options, req.query.sessionID);
    else
        result_obj = await downloadFileByURL_normal(url, 'audio', options, req.query.sessionID);
    if (result_obj) {
        res.send(result_obj);
    } else {
        res.sendStatus(500);
    }
});

app.post('/api/tomp4', optionalJwt, async function(req, res) {
    req.setTimeout(0); // remove timeout in case of long videos
    var url = req.body.url;
    var options = {
        customArgs: req.body.customArgs,
        customOutput: req.body.customOutput,
        selectedHeight: req.body.selectedHeight,
        customQualityConfiguration: req.body.customQualityConfiguration,
        youtubeUsername: req.body.youtubeUsername,
        youtubePassword: req.body.youtubePassword,
        ui_uid: req.body.ui_uid,
        user: req.isAuthenticated() ? req.user.uid : null
    }

    const safeDownloadOverride = config_api.getConfigItem('ytdl_safe_download_override') || config_api.globalArgsRequiresSafeDownload();
    if (safeDownloadOverride) logger.verbose('Download is running with the safe download override.');
    const is_playlist = url.includes('playlist');

    let result_obj = null;
    if (true || safeDownloadOverride || is_playlist || options.customQualityConfiguration || options.customArgs || options.selectedHeight || !url.includes('youtu'))
        result_obj = await downloadFileByURL_exec(url, 'video', options, req.query.sessionID);
    else
        result_obj = await downloadFileByURL_normal(url, 'video', options, req.query.sessionID);
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

/**
 * add thumbnails if present
 * @param files - List of files with thumbnailPath property.
 */
async function addThumbnails(files) {
    await Promise.all(files.map(async file => {
        const thumbnailPath = file['thumbnailPath'];
        if (thumbnailPath && (await fs.pathExists(thumbnailPath))) {
            file['thumbnailBlob'] = await fs.readFile(thumbnailPath);
        }
    }));
}

// gets all download mp3s
app.get('/api/getMp3s', optionalJwt, async function(req, res) {
    var mp3s = db.get('files.audio').value(); // getMp3s();
    var playlists = db.get('playlists.audio').value();
    const is_authenticated = req.isAuthenticated();
    if (is_authenticated) {
        // get user audio files/playlists
        auth_api.passport.authenticate('jwt')
        mp3s = auth_api.getUserVideos(req.user.uid, 'audio');
        playlists = auth_api.getUserPlaylists(req.user.uid, 'audio');
    }

    mp3s = JSON.parse(JSON.stringify(mp3s));

    if (config_api.getConfigItem('ytdl_include_thumbnail')) {
        // add thumbnails if present
        await addThumbnails(mp3s);
    }


    res.send({
        mp3s: mp3s,
        playlists: playlists
    });
});

// gets all download mp4s
app.get('/api/getMp4s', optionalJwt, async function(req, res) {
    var mp4s = db.get('files.video').value(); // getMp4s();
    var playlists = db.get('playlists.video').value();

    const is_authenticated = req.isAuthenticated();
    if (is_authenticated) {
        // get user videos/playlists
        auth_api.passport.authenticate('jwt')
        mp4s = auth_api.getUserVideos(req.user.uid, 'video');
        playlists = auth_api.getUserPlaylists(req.user.uid, 'video');
    }

    mp4s = JSON.parse(JSON.stringify(mp4s));

    if (config_api.getConfigItem('ytdl_include_thumbnail')) {
        // add thumbnails if present
        await addThumbnails(mp4s);
    }

    res.send({
        mp4s: mp4s,
        playlists: playlists
    });
});

app.post('/api/getFile', optionalJwt, function (req, res) {
    var uid = req.body.uid;
    var type = req.body.type;
    var uuid = req.body.uuid;

    var file = null;

    if (req.isAuthenticated()) {
        file = auth_api.getUserVideo(req.user.uid, uid, type);
    } else if (uuid) {
        file = auth_api.getUserVideo(uuid, uid, type, true);
    } else {
        if (!type) {
            file = db.get('files.audio').find({uid: uid}).value();
            if (!file) {
                file = db.get('files.video').find({uid: uid}).value();
                if (file) type = 'video';
            } else {
                type = 'audio';
            }
        }

        if (!file && type) file = db.get(`files.${type}`).find({uid: uid}).value();
    }


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
    let files = [];
    let playlists = [];
    let subscription_files = [];

    let videos = null;
    let audios = null;
    let audio_playlists = null;
    let video_playlists = null;
    let subscriptions =  config_api.getConfigItem('ytdl_allow_subscriptions') ? (subscriptions_api.getAllSubscriptions(req.isAuthenticated() ? req.user.uid : null)) : [];

    // get basic info depending on multi-user mode being enabled
    if (req.isAuthenticated()) {
        videos = auth_api.getUserVideos(req.user.uid, 'video');
        audios = auth_api.getUserVideos(req.user.uid, 'audio');
        audio_playlists = auth_api.getUserPlaylists(req.user.uid, 'audio');
        video_playlists = auth_api.getUserPlaylists(req.user.uid, 'video');
    } else {
        videos = db.get('files.audio').value();
        audios = db.get('files.video').value();
        audio_playlists = db.get('playlists.audio').value();
        video_playlists = db.get('playlists.video').value();
    }

    files = videos.concat(audios);
    playlists = video_playlists.concat(audio_playlists);

    // loop through subscriptions and add videos
    for (let i = 0; i < subscriptions.length; i++) {
        sub = subscriptions[i];
        if (!sub.videos) continue;
        // add sub id for UI
        for (let j = 0; j < sub.videos.length; j++) {
            sub.videos[j].sub_id = sub.id;
        }

        files = files.concat(sub.videos);
    }

    files = JSON.parse(JSON.stringify(files));

    if (config_api.getConfigItem('ytdl_include_thumbnail')) {
        // add thumbnails if present
        await addThumbnails(files);
    }

    res.send({
        files: files,
        playlists: playlists
    });
});

// video sharing
app.post('/api/enableSharing', optionalJwt, function(req, res) {
    var type = req.body.type;
    var uid = req.body.uid;
    var is_playlist = req.body.is_playlist;
    let success = false;
    // multi-user mode
    if (req.isAuthenticated()) {
        // if multi user mode, use this method instead
        success = auth_api.changeSharingMode(req.user.uid, uid, type, is_playlist, true);
        res.send({success: success});
        return;
    }

    // single-user mode
    try {
        success = true;
        if (!is_playlist && type !== 'subscription') {
            db.get(`files.${type}`)
                .find({uid: uid})
                .assign({sharingEnabled: true})
                .write();
        } else if (is_playlist) {
            db.get(`playlists.${type}`)
                .find({id: uid})
                .assign({sharingEnabled: true})
                .write();
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

app.post('/api/disableSharing', optionalJwt, function(req, res) {
    var type = req.body.type;
    var uid = req.body.uid;
    var is_playlist = req.body.is_playlist;

    // multi-user mode
    if (req.isAuthenticated()) {
        // if multi user mode, use this method instead
        success = auth_api.changeSharingMode(req.user.uid, uid, type, is_playlist, false);
        res.send({success: success});
        return;
    }

    // single-user mode
    try {
        success = true;
        if (!is_playlist && type !== 'subscription') {
            db.get(`files.${type}`)
                .find({uid: uid})
                .assign({sharingEnabled: false})
                .write();
        } else if (is_playlist) {
                db.get(`playlists.${type}`)
                .find({id: uid})
                .assign({sharingEnabled: false})
                .write();
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

// categories

app.post('/api/getAllCategories', optionalJwt, async (req, res) => {
    const categories = db.get('categories').value();
    res.send({categories: categories});
});

app.post('/api/createCategory', optionalJwt, async (req, res) => {
    const name = req.body.name;
    const new_category = {
        name: name,
        uid: uuid(),
        rules: [],
        custom_putput: ''
    };

    db.get('categories').push(new_category).write();

    res.send({
        new_category: new_category,
        success: !!new_category
    });
});

app.post('/api/deleteCategory', optionalJwt, async (req, res) => {
    const category_uid = req.body.category_uid;

    db.get('categories').remove({uid: category_uid}).write();

    res.send({
        success: true
    });
});

app.post('/api/updateCategory', optionalJwt, async (req, res) => {
    const category = req.body.category;
    db.get('categories').find({uid: category.uid}).assign(category).write();
    res.send({success: true});
});

app.post('/api/updateCategories', optionalJwt, async (req, res) => {
    const categories = req.body.categories;
    db.get('categories').assign(categories).write();
    res.send({success: true});
});

// subscriptions

app.post('/api/subscribe', optionalJwt, async (req, res) => {
    let name = req.body.name;
    let url = req.body.url;
    let timerange = req.body.timerange;
    let streamingOnly = req.body.streamingOnly;
    let audioOnly = req.body.audioOnly;
    let customArgs = req.body.customArgs;
    let customOutput = req.body.customFileOutput;
    let user_uid = req.isAuthenticated() ? req.user.uid : null;
    const new_sub = {
                        name: name,
                        url: url,
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
        subscription = subscriptions_api.getSubscription(subID, user_uid)
    } else if (subName) {
        subscription = subscriptions_api.getSubscriptionByName(subName, user_uid)
    }

    if (!subscription) {
        // failed to get subscription from db, send 400 error
        res.sendStatus(400);
        return;
    }

    // get sub videos
    if (subscription.name && !subscription.streamingOnly) {
        var parsed_files = subscription.videos;
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
                var file_obj = new utils.File(id, title, thumbnail, isaudio, duration, url, uploader, size, file, upload_date);
                parsed_files.push(file_obj);
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
                parsed_files.push(new utils.File(video.title, video.title, video.thumbnail, false, video.duration, video.url, video.uploader, video.size, null, null, video.upload_date));
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

app.post('/api/getAllSubscriptions', optionalJwt, async (req, res) => {
    let user_uid = req.isAuthenticated() ? req.user.uid : null;

    // get subs from api
    let subscriptions = subscriptions_api.getAllSubscriptions(user_uid);

    res.send({
        subscriptions: subscriptions
    });
});

app.post('/api/createPlaylist', optionalJwt, async (req, res) => {
    let playlistName = req.body.playlistName;
    let fileNames = req.body.fileNames;
    let type = req.body.type;
    let thumbnailURL = req.body.thumbnailURL;
    let duration = req.body.duration;

    let new_playlist = {
        name: playlistName,
        fileNames: fileNames,
        id: shortid.generate(),
        thumbnailURL: thumbnailURL,
        type: type,
        registered: Date.now(),
        duration: duration
    };

    if (req.isAuthenticated()) {
        auth_api.addPlaylist(req.user.uid, new_playlist, type);
    } else {
        db.get(`playlists.${type}`)
            .push(new_playlist)
            .write();
    }


    res.send({
        new_playlist: new_playlist,
        success: !!new_playlist // always going to be true
    })
});

app.post('/api/getPlaylist', optionalJwt, async (req, res) => {
    let playlistID = req.body.playlistID;
    let type = req.body.type;
    let uuid = req.body.uuid;

    let playlist = null;

    if (req.isAuthenticated()) {
        playlist = auth_api.getUserPlaylist(uuid ? uuid : req.user.uid, playlistID, type);
        type = playlist.type;
    } else {
        if (!type) {
            playlist = db.get('playlists.audio').find({id: playlistID}).value();
            if (!playlist) {
                playlist = db.get('playlists.video').find({id: playlistID}).value();
                if (playlist) type = 'video';
            } else {
                type = 'audio';
            }
        }

        if (!playlist) playlist = db.get(`playlists.${type}`).find({id: playlistID}).value();
    }

    res.send({
        playlist: playlist,
        type: type,
        success: !!playlist
    });
});

app.post('/api/updatePlaylistFiles', optionalJwt, async (req, res) => {
    let playlistID = req.body.playlistID;
    let fileNames = req.body.fileNames;
    let type = req.body.type;

    let success = false;
    try {
        if (req.isAuthenticated()) {
            auth_api.updatePlaylistFiles(req.user.uid, playlistID, fileNames, type);
        } else {
            db.get(`playlists.${type}`)
                .find({id: playlistID})
                .assign({fileNames: fileNames})
                .write();
        }

        success = true;
    } catch(e) {
        logger.error(`Failed to find playlist with ID ${playlistID}`);
    }

    res.send({
        success: success
    })
});

app.post('/api/updatePlaylist', optionalJwt, async (req, res) => {
    let playlist = req.body.playlist;
    let success = db_api.updatePlaylist(playlist, req.user && req.user.uid);
    res.send({
        success: success
    });
});

app.post('/api/deletePlaylist', optionalJwt, async (req, res) => {
    let playlistID = req.body.playlistID;
    let type = req.body.type;

    let success = null;
    try {
        if (req.isAuthenticated()) {
            auth_api.removePlaylist(req.user.uid, playlistID, type);
        } else {
            // removes playlist from playlists
            db.get(`playlists.${type}`)
                .remove({id: playlistID})
                .write();
        }

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
    var uid = req.body.uid;
    var type = req.body.type;
    var blacklistMode = req.body.blacklistMode;

    if (req.isAuthenticated()) {
        let success = auth_api.deleteUserFile(req.user.uid, uid, type, blacklistMode);
        res.send(success);
        return;
    }

    var file_obj = db.get(`files.${type}`).find({uid: uid}).value();
    var name = file_obj.id;
    var fullpath = file_obj ? file_obj.path : null;
    var wasDeleted = false;
    if (await fs.pathExists(fullpath))
    {
        wasDeleted = type === 'audio' ? await deleteAudioFile(name, path.basename(fullpath), blacklistMode) : await deleteVideoFile(name, path.basename(fullpath), blacklistMode);
        db.get('files.video').remove({uid: uid}).write();
        // wasDeleted = true;
        res.send(wasDeleted);
    } else if (video_obj) {
        db.get('files.video').remove({uid: uid}).write();
        wasDeleted = true;
        res.send(wasDeleted);
    } else {
        wasDeleted = false;
        res.send(wasDeleted);
    }
});

app.post('/api/downloadFile', optionalJwt, async (req, res) => {
    let fileNames = req.body.fileNames;
    let zip_mode = req.body.zip_mode;
    let type = req.body.type;
    let outputName = req.body.outputName;
    let fullPathProvided = req.body.fullPathProvided;
    let subscriptionName = req.body.subscriptionName;
    let subscriptionPlaylist = req.body.subPlaylist;
    let file = null;
    if (!zip_mode) {
        fileNames = decodeURIComponent(fileNames);
        const is_audio = type === 'audio';
        const fileFolderPath = is_audio ? audioFolderPath : videoFolderPath;
        const ext = is_audio ? '.mp3' : '.mp4';

        let base_path = fileFolderPath;
        let usersFileFolder = null;
        const multiUserMode = config_api.getConfigItem('ytdl_multi_user_mode');
        if (multiUserMode && (req.body.uuid || req.user.uid)) {
            usersFileFolder = config_api.getConfigItem('ytdl_users_base_path');
            base_path = path.join(usersFileFolder, req.body.uuid ? req.body.uuid : req.user.uid, type);
        }
        if (!subscriptionName) {
            file = path.join(__dirname, base_path, fileNames + ext);
        } else {
            let basePath = null;
            if (usersFileFolder)
                basePath = path.join(usersFileFolder, req.user.uid, 'subscriptions');
            else
                basePath = config_api.getConfigItem('ytdl_subscriptions_base_path');

            file = path.join(__dirname, basePath, (subscriptionPlaylist === true || subscriptionPlaylist === 'true' ? 'playlists' : 'channels'), subscriptionName, fileNames + ext);
        }
    } else {
        for (let i = 0; i < fileNames.length; i++) {
            fileNames[i] = decodeURIComponent(fileNames[i]);
        }
        file = await createPlaylistZipFile(fileNames, type, outputName, fullPathProvided, req.body.uuid);
        if (!path.isAbsolute(file)) file = path.join(__dirname, file);
    }
    res.sendFile(file, function (err) {
        if (err) {
          logger.error(err);
        } else if (fullPathProvided) {
          try {
            fs.unlinkSync(file);
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

app.get('/api/stream/:id', optionalJwt, (req, res) => {
    const type = req.query.type;
    const ext = type === 'audio' ? '.mp3' : '.mp4';
    const mimetype = type === 'audio' ? 'audio/mp3' : 'video/mp4';
    var head;
    let optionalParams = url_api.parse(req.url,true).query;
    let id = decodeURIComponent(req.params.id);
    let file_path = req.query.file_path ? decodeURIComponent(req.query.file_path) : null;
    if (!file_path && (req.isAuthenticated() || req.can_watch)) {
        let usersFileFolder = config_api.getConfigItem('ytdl_users_base_path');
        if (optionalParams['subName']) {
            const isPlaylist = optionalParams['subPlaylist'];
            file_path = path.join(usersFileFolder, req.user.uid, 'subscriptions', (isPlaylist === 'true' ? 'playlists/' : 'channels/'),optionalParams['subName'], id + ext)
        } else {
            file_path = path.join(usersFileFolder, req.query.uuid ? req.query.uuid : req.user.uid, type, id + ext);
        }
    } else if (!file_path && optionalParams['subName']) {
        let basePath = config_api.getConfigItem('ytdl_subscriptions_base_path');
        const isPlaylist = optionalParams['subPlaylist'];
        basePath += (isPlaylist === 'true' ? 'playlists/' : 'channels/');
        file_path = basePath + optionalParams['subName'] + '/' + id + ext;
    }

    if (!file_path) {
        file_path = path.join(videoFolderPath, id + ext);
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
        if (config_api.descriptors[id]) config_api.descriptors[id].push(file);
        else                            config_api.descriptors[id] = [file];
        file.on('close', function() {
            let index = config_api.descriptors[id].indexOf(file);
            config_api.descriptors[id].splice(index, 1);
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

  // Downloads management

  app.get('/api/downloads', async (req, res) => {
    res.send({downloads: downloads});
  });

  app.post('/api/download', async (req, res) => {
    var session_id = req.body.session_id;
    var download_id = req.body.download_id;
    let found_download = null;

    // find download
    if (downloads[session_id] && Object.keys(downloads[session_id])) {
        let session_downloads = Object.values(downloads[session_id]);
        for (let i = 0; i < session_downloads.length; i++) {
            let session_download = session_downloads[i];
            if (session_download && session_download['ui_uid'] === download_id) {
                found_download = session_download;
                break;
            }
        }
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
        downloads = {};
        success = true;
    } else if (download_id) {
        // delete just 1 download
        if (downloads[session_id][download_id]) {
            delete downloads[session_id][download_id];
            success = true;
        } else if (!downloads[session_id]) {
            logger.error(`Session ${session_id} has no downloads.`)
        } else if (!downloads[session_id][download_id]) {
            logger.error(`Download '${download_id}' for session '${session_id}' could not be found`);
        }
    } else if (session_id) {
        // delete a session's downloads
        if (downloads[session_id]) {
            delete downloads[session_id];
            success = true;
        } else {
            logger.error(`Session ${session_id} has no downloads.`)
        }
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
    let exists = auth_api.adminExists();
    res.send({exists: exists});
});

// user management
app.post('/api/getUsers', optionalJwt, async (req, res) => {
    let users = users_db.get('users').value();
    res.send({users: users});
});
app.post('/api/getRoles', optionalJwt, async (req, res) => {
    let roles = users_db.get('roles').value();
    res.send({roles: roles});
});

app.post('/api/updateUser', optionalJwt, async (req, res) => {
    let change_obj = req.body.change_object;
    try {
        const user_db_obj = users_db.get('users').find({uid: change_obj.uid});
        if (change_obj.name) {
            user_db_obj.assign({name: change_obj.name}).write();
        }
        if (change_obj.role) {
            user_db_obj.assign({role: change_obj.role}).write();
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
        let usersFileFolder = config_api.getConfigItem('ytdl_users_base_path');
        const user_folder = path.join(__dirname, usersFileFolder, uid);
        const user_db_obj = users_db.get('users').find({uid: uid});
        if (user_db_obj.value()) {
            // user exists, let's delete
            await fs.remove(user_folder);
            users_db.get('users').remove({uid: uid}).write();
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

    const success = auth_api.changeUserPermissions(user_uid, permission, new_value);

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

    const success = auth_api.changeRolePermissions(role, permission, new_value);

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
