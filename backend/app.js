require('./api/config/application');
var async = require('async');
const { uuid } = require('uuidv4');
var fs = require('fs-extra');
var auth_api = require('./authentication/auth');

var path = require('path');
var youtubedl = require('youtube-dl');
var ffmpeg = require('fluent-ffmpeg');
var compression = require('compression');
var https = require('https');
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
var md5 = require('md5');
const NodeID3 = require('node-id3')
const downloader = require('youtube-dl/lib/downloader')
const fetch = require('node-fetch');
var URL = require('url').URL;
const shortid = require('shortid')
const url_api = require('url');
var config_api = require('./config.js');
var subscriptions_api = require('./subscriptions')
const CONSTS = require('./consts')
const { spawn } = require('child_process')

const is_windows = process.platform === 'win32';

var app = express();

// database setup
const FileSync = require('lowdb/adapters/FileSync')


const adapter = new FileSync('./appdata/db.json');
const db = low(adapter)

const users_adapter = new FileSync('./appdata/users.json');
const users_db = low(users_adapter);

// Routes
const configRouter = require('./api/routes/configRouter');
const logRouter = require('./api/routes/logRouter');

// env var setup

const umask = process.env.YTDL_UMASK;
if (umask) process.umask(parseInt(umask));


const admin_token = '4241b401-7236-493e-92b5-b72696b9d853';

// logging setup
const { logger } = require('./api/services/logger_service');

// config setup
const {
  url_domain,
  options,
  backendPort,
  usingEncryption,
  audioFolderPath,
  videoFolderPath,
  useDefaultDownloadingAgent,
  customDownloadingAgent,
  subscriptionsCheckInterval,
  allowSubscriptions,
  loadConfigValues
} = require('./api/services/config_service');

// console format

config_api.initialize(logger);
auth_api.initialize(users_db, logger);
db_api.initialize(db, users_db, logger);
subscriptions_api.initialize(db, users_db, logger, db_api);

// var GithubContent = require('github-content');

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
        pin_md5: '',
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


var updaterStatus = null;
var archivePath = path.join(__dirname, 'appdata', 'archives');

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

// updates & starts youtubedl
startYoutubeDL();


const subscription_timeouts = {};

// don't overwrite config if it already happened.. NOT
// let alreadyWritten = db.get('configWriteFlag').value();
let writeConfigMode = process.env.write_ytdl_config;
var config = null;

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

async function checkMigrations() {
    return new Promise(async resolve => {
        // 3.5->3.6 migration
        const files_to_db_migration_complete = true; // migration phased out! previous code: db.get('files_to_db_migration_complete').value();

        if (!files_to_db_migration_complete) {
            logger.info('Beginning migration: 3.5->3.6+')
            runFilesToDBMigration().then(success => {
                if (success) { logger.info('3.5->3.6+ migration complete!'); }
                else { logger.error('Migration failed: 3.5->3.6+'); }
            });
        }

        resolve(true);
    });
}

async function runFilesToDBMigration() {
    return new Promise(async resolve => {
        try {
            let mp3s = getMp3s();
            let mp4s = getMp4s();

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
            resolve(true);
        } catch(err) {
            logger.error(err);
            resolve(false);
        }
    });
}

async function startServer() {
    if (process.env.USING_HEROKU && process.env.PORT) {
        // default to heroku port if using heroku
        backendPort = process.env.PORT || backendPort;

        // set config to port
        await setPortItemFromENV();
    }
    if (usingEncryption)
    {
        https.createServer(options, app).listen(backendPort, function() {
            logger.info(`YoutubeDL-Material ${CONSTS['CURRENT_VERSION']} started on port ${backendPort} - using SSL`);
        });
    }
    else
    {
        app.listen(backendPort,function(){
            logger.info(`YoutubeDL-Material ${CONSTS['CURRENT_VERSION']} started on PORT ${backendPort}`);
        });
    }
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
    return new Promise(resolve => {
        var child_process = require('child_process');
        child_process.execSync('npm install',{stdio:[0,1,2]});
        resolve(true);
    });

}

async function backupServerLite() {
    return new Promise(async resolve => {
        fs.ensureDirSync(path.join(__dirname, 'appdata', 'backups'));
        let output_path = path.join('appdata', 'backups', `backup-${Date.now()}.zip`);
        logger.info(`Backing up your non-video/audio files to ${output_path}. This may take up to a few seconds/minutes.`);
        let output = fs.createWriteStream(path.join(__dirname, output_path));
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

        await archive.finalize();

        // wait a tiny bit for the zip to reload in fs
        setTimeout(function() {
            resolve(true);
        }, 100);
    });
}

async function isNewVersionAvailable() {
    return new Promise(async resolve => {
        // gets tag of the latest version of youtubedl-material, compare to current version
        const latest_tag = await getLatestVersion();
        const current_tag = CONSTS['CURRENT_VERSION'];
        if (latest_tag > current_tag) {
            resolve(true);
        } else {
            resolve(false);
        }
    });
}

async function getLatestVersion() {
    return new Promise(resolve => {
        fetch('https://api.github.com/repos/tzahi12345/youtubedl-material/releases/latest', {method: 'Get'})
        .then(async res => res.json())
        .then(async (json) => {
            if (json['message']) {
                // means there's an error in getting latest version
                logger.error(`ERROR: Received the following message from GitHub's API:`);
                logger.error(json['message']);
                if (json['documentation_url']) logger.error(`Associated URL: ${json['documentation_url']}`)
            }
            resolve(json['tag_name']);
            return;
        });
    });
}

async function setPortItemFromENV() {
    return new Promise(resolve => {
        config_api.setConfigItem('ytdl_port', backendPort.toString());
        setTimeout(() => resolve(true), 100);
    });
}

async function setAndLoadConfig() {
    await setConfigFromEnv();
    await loadConfig();
}

async function setConfigFromEnv() {
    return new Promise(resolve => {
        let config_items = getEnvConfigItems();
        let success = config_api.setConfigItems(config_items);
        if (success) {
            logger.info('Config items set using ENV variables.');
            setTimeout(() => resolve(true), 100);
        } else {
            logger.error('ERROR: Failed to set config items using ENV variables.');
            resolve(false);
        }
    });
}

async function loadConfig() {
    return new Promise(async resolve => {
        loadConfigValues();

        // creates archive path if missing
        if (!fs.existsSync(archivePath)){
            fs.mkdirSync(archivePath);
        }

        // get subscriptions
        if (allowSubscriptions) {
            // runs initially, then runs every ${subscriptionCheckInterval} seconds
            watchSubscriptions();
            setInterval(() => {
                watchSubscriptions();
            }, subscriptionsCheckInterval * 1000);
        }

        // check migrations
        await checkMigrations();

        // load in previous downloads
        downloads = db.get('downloads').value();

        // start the server here
        startServer();

        resolve(true);
    });

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

function getMp3s() {
    let mp3s = [];
    var files = recFindByExt(audioFolderPath, 'mp3'); // fs.readdirSync(audioFolderPath);
    for (let i = 0; i < files.length; i++) {
        let file = files[i];
        var file_path = file.substring(audioFolderPath.length, file.length);

        var stats = fs.statSync(file);

        var id = file_path.substring(0, file_path.length-4);
        var jsonobj = utils.getJSONMp3(id, audioFolderPath);
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

function getMp4s(relative_path = true) {
    let mp4s = [];
    var files = recFindByExt(videoFolderPath, 'mp4');
    for (let i = 0; i < files.length; i++) {
        let file = files[i];
        var file_path = file.substring(videoFolderPath.length, file.length);

        var stats = fs.statSync(file);

        var id = file_path.substring(0, file_path.length-4);
        var jsonobj = utils.getJSONMp4(id, videoFolderPath);
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

async function createPlaylistZipFile(fileNames, type, outputName, fullPathProvided = null) {
    return new Promise(async resolve => {
        let zipFolderPath = null;

        if (!fullPathProvided) {
            zipFolderPath = path.join(__dirname, (type === 'audio') ? audioFolderPath : videoFolderPath);
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
            let file_path = !fullPathProvided ? zipFolderPath + fileName + ext : fileName;
            archive.file(file_path, {name: fileNamePathRemoved + ext})
        }

        await archive.finalize();

        // wait a tiny bit for the zip to reload in fs
        setTimeout(function() {
            resolve(path.join(zipFolderPath,outputName + '.zip'));
        }, 100);

    });


}

async function deleteAudioFile(name, blacklistMode = false) {
    return new Promise(resolve => {
        // TODO: split descriptors into audio and video descriptors, as deleting an audio file will close all video file streams
        var jsonPath = path.join(audioFolderPath,name+'.mp3.info.json');
        var altJSONPath = path.join(audioFolderPath,name+'.info.json');
        var audioFilePath = path.join(audioFolderPath,name+'.mp3');
        var thumbnailPath = path.join(filePath,name+'.webp');
        var altThumbnailPath = path.join(filePath,name+'.jpg');
        jsonPath = path.join(__dirname, jsonPath);
        altJSONPath = path.join(__dirname, altJSONPath);
        audioFilePath = path.join(__dirname, audioFilePath);

        let jsonExists = fs.existsSync(jsonPath);
        let thumbnailExists = fs.existsSync(thumbnailPath);

        if (!jsonExists) {
            if (fs.existsSync(altJSONPath)) {
                jsonExists = true;
                jsonPath = altJSONPath;
            }
        }

        if (!thumbnailExists) {
            if (fs.existsSync(altThumbnailPath)) {
                thumbnailExists = true;
                thumbnailPath = altThumbnailPath;
            }
        }

        let audioFileExists = fs.existsSync(audioFilePath);

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

            var jsonobj = utils.getJSONMp3(name, audioFolderPath);
            let id = null;
            if (jsonobj) id = jsonobj.id;

            // use subscriptions API to remove video from the archive file, and write it to the blacklist
            if (fs.existsSync(archive_path)) {
                const line = id ? subscriptions_api.removeIDFromArchive(archive_path, id) : null;
                if (blacklistMode && line) writeToBlacklist('audio', line);
            } else {
                logger.info('Could not find archive file for audio files. Creating...');
                fs.closeSync(fs.openSync(archive_path, 'w'));
            }
        }

        if (jsonExists) fs.unlinkSync(jsonPath);
        if (thumbnailExists) fs.unlinkSync(thumbnailPath);
        if (audioFileExists) {
            fs.unlink(audioFilePath, function(err) {
                if (fs.existsSync(jsonPath) || fs.existsSync(audioFilePath)) {
                    resolve(false);
                } else {
                    resolve(true);
                }
            });
        } else {
            // TODO: tell user that the file didn't exist
            resolve(true);
        }

    });
}

async function deleteVideoFile(name, customPath = null, blacklistMode = false) {
    return new Promise(resolve => {
        let filePath = customPath ? customPath : videoFolderPath;
        var jsonPath = path.join(filePath,name+'.info.json');
        var altJSONPath = path.join(filePath,name+'.mp4.info.json');
        var videoFilePath = path.join(filePath,name+'.mp4');
        var thumbnailPath = path.join(filePath,name+'.webp');
        var altThumbnailPath = path.join(filePath,name+'.jpg');
        jsonPath = path.join(__dirname, jsonPath);
        videoFilePath = path.join(__dirname, videoFilePath);

        let jsonExists = fs.existsSync(jsonPath);
        let videoFileExists = fs.existsSync(videoFilePath);
        let thumbnailExists = fs.existsSync(thumbnailPath);

        if (!jsonExists) {
            if (fs.existsSync(altJSONPath)) {
                jsonExists = true;
                jsonPath = altJSONPath;
            }
        }

        if (!thumbnailExists) {
            if (fs.existsSync(altThumbnailPath)) {
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

            var jsonobj = utils.getJSONMp4(name, videoFolderPath);
            let id = null;
            if (jsonobj) id = jsonobj.id;

            // use subscriptions API to remove video from the archive file, and write it to the blacklist
            if (fs.existsSync(archive_path)) {
                const line = id ? subscriptions_api.removeIDFromArchive(archive_path, id) : null;
                if (blacklistMode && line) writeToBlacklist('video', line);
            } else {
                logger.info('Could not find archive file for videos. Creating...');
                fs.closeSync(fs.openSync(archive_path, 'w'));
            }
        }

        if (jsonExists) fs.unlinkSync(jsonPath);
        if (thumbnailExists) fs.unlinkSync(thumbnailPath);
        if (videoFileExists) {
            fs.unlink(videoFilePath, function(err) {
                if (fs.existsSync(jsonPath) || fs.existsSync(videoFilePath)) {
                    resolve(false);
                } else {
                    resolve(true);
                }
            });
        } else {
            // TODO: tell user that the file didn't exist
            resolve(true);
        }

    });
}

function recFindByExt(base,ext,files,result)
{
    files = files || fs.readdirSync(base)
    result = result || []

    files.forEach(
        function (file) {
            var newbase = path.join(base,file)
            if ( fs.statSync(newbase).isDirectory() )
            {
                result = recFindByExt(newbase,ext,fs.readdirSync(newbase),result)
            }
            else
            {
                if ( file.substr(-1*(ext.length+1)) == '.' + ext )
                {
                    result.push(newbase)
                }
            }
        }
    )
    return result
}
/*
function registerFileDB(file_path, type, multiUserMode = null) {
    const file_id = file_path.substring(0, file_path.length-4);
    const file_object = generateFileObject(file_id, type, multiUserMode && multiUserMode.file_path);
    if (!file_object) {
        logger.error(`Could not find associated JSON file for ${type} file ${file_id}`);
        return false;
    }

    // add additional info
    file_object['uid'] = uuid();
    file_object['registered'] = Date.now();
    path_object = path.parse(file_object['path']);
    file_object['path'] = path.format(path_object);

    if (multiUserMode) {
        auth_api.registerUserFile(multiUserMode.user, file_object, type);
    } else if (type === 'audio' || type === 'video') {
        // remove existing video if overwriting
        db.get(`files.${type}`)
        .remove({
            path: file_object['path']
        }).write();

        db.get(`files.${type}`)
            .push(file_object)
            .write();
    } else if (type == 'subscription') {

    }

    return file_object['uid'];
}

function generateFileObject(id, type, customPath = null) {
    var jsonobj = (type === 'audio') ? utils.getJSONMp3(id, customPath, true) : utils.getJSONMp4(id, customPath, true);
    if (!jsonobj) {
        return null;
    }
    const ext = (type === 'audio') ? '.mp3' : '.mp4'
    const file_path = getTrueFileName(jsonobj['_filename'], type); // path.join(type === 'audio' ? audioFolderPath : videoFolderPath, id + ext);
    // console.
    var stats = fs.statSync(path.join(__dirname, file_path));

    var title = jsonobj.title;
    var url = jsonobj.webpage_url;
    var uploader = jsonobj.uploader;
    var upload_date = jsonobj.upload_date;
    upload_date = upload_date ? `${upload_date.substring(0, 4)}-${upload_date.substring(4, 6)}-${upload_date.substring(6, 8)}` : 'N/A';

    var size = stats.size;

    var thumbnail = jsonobj.thumbnail;
    var duration = jsonobj.duration;
    var isaudio = type === 'audio';
    var file_obj = new utils.File(id, title, thumbnail, isaudio, duration, url, uploader, size, file_path, upload_date);
    return file_obj;
}
*/
// replaces .webm with appropriate extension
function getTrueFileName(unfixed_path, type) {
    let fixed_path = unfixed_path;

    const new_ext = (type === 'audio' ? 'mp3' : 'mp4');
    let unfixed_parts = unfixed_path.split('.');
    const old_ext = unfixed_parts[unfixed_parts.length-1];


    if (old_ext !== new_ext) {
        unfixed_parts[unfixed_parts.length-1] = new_ext;
        fixed_path = unfixed_parts.join('.');
    }
    return fixed_path;
}

function getAudioInfos(fileNames) {
    let result = [];
    for (let i = 0; i < fileNames.length; i++) {
        let fileName = fileNames[i];
        let fileLocation = audioFolderPath+fileName+'.mp3.info.json';
        if (fs.existsSync(fileLocation)) {
            let data = fs.readFileSync(fileLocation);
            try {
                result.push(JSON.parse(data));
            } catch(e) {
                logger.error(`Could not find info for file ${fileName}.mp3`);
            }
        }
    }
    return result;
}

function getVideoInfos(fileNames) {
    let result = [];
    for (let i = 0; i < fileNames.length; i++) {
        let fileName = fileNames[i];
        let fileLocation = videoFolderPath+fileName+'.info.json';
        if (fs.existsSync(fileLocation)) {
            let data = fs.readFileSync(fileLocation);
            try {
                result.push(JSON.parse(data));
            } catch(e) {
                logger.error(`Could not find info for file ${fileName}.mp4`);
            }
        }
    }
    return result;
}

// downloads

async function downloadFileByURL_exec(url, type, options, sessionID = null) {
    return new Promise(async resolve => {
        var date = Date.now();

        // audio / video specific vars
        var is_audio = type === 'audio';
        var ext = is_audio ? '.mp3' : '.mp4';
        var fileFolderPath = type === 'audio' ? audioFolderPath : videoFolderPath;

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

        youtubedl.exec(url, downloadConfig, {}, function(err, output) {
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
                throw err;
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
                    var modified_file_name = output_json ? output_json['title'] : null;
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

                    // registers file in DB
                    file_uid = db_api.registerFileDB(full_file_path.substring(fileFolderPath.length, full_file_path.length), type, multiUserMode);

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
    return new Promise(async resolve => {
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
        let qualityPath = (is_audio && !options.skip_audio_args) ? '-f bestaudio' :'-f best[ext=mp4]';
        const is_youtube = url.includes('youtu');
        if (!is_audio && !is_youtube) {
            // tiktok videos fail when using the default format
            qualityPath = null;
        } else if (!is_audio && !is_youtube && (url.includes('reddit') || url.includes('pornhub'))) {
            qualityPath = '-f bestvideo+bestaudio'
        }

        if (customArgs) {
            downloadConfig = customArgs.split(',,');
        } else {
            if (customQualityConfiguration) {
                qualityPath = `-f ${customQualityConfiguration}`;
            } else if (selectedHeight && selectedHeight !== '' && !is_audio) {
                qualityPath = `-f '(mp4)[height=${selectedHeight}]'`;
            } else if (maxBitrate && is_audio) {
                qualityPath = `--audio-quality ${maxBitrate}`
            }

            if (customOutput) {
                downloadConfig = ['-o', path.join(fileFolderPath, customOutput) + ".%(ext)s", '--write-info-json', '--print-json'];
            } else {
                downloadConfig = ['-o', path.join(fileFolderPath, videopath + (is_audio ? '.%(ext)s' : '.mp4')), '--write-info-json', '--print-json'];
            }

            if (qualityPath) downloadConfig.push(qualityPath);

            if (is_audio && !options.skip_audio_args) {
                downloadConfig.push('-x');
                downloadConfig.push('--audio-format', 'mp3');
            }

            if (youtubeUsername && youtubePassword) {
                downloadConfig.push('--username', youtubeUsername, '--password', youtubePassword);
            }

            if (useCookies) {
                if (fs.existsSync(path.join(__dirname, 'appdata', 'cookies.txt'))) {
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

                fs.ensureDirSync(archive_folder);

                // create archive file if it doesn't exist
                if (!fs.existsSync(archive_path)) {
                    fs.closeSync(fs.openSync(archive_path, 'w'));
                }

                let blacklist_path = options.user ? path.join(fileFolderPath, 'archives', `blacklist_${type}.txt`) : path.join(archivePath, `blacklist_${type}.txt`);
                // create blacklist file if it doesn't exist
                if (!fs.existsSync(blacklist_path)) {
                    fs.closeSync(fs.openSync(blacklist_path, 'w'));
                }

                let merged_path = path.join(fileFolderPath, `merged_${type}.txt`);
                fs.ensureFileSync(merged_path);
                // merges blacklist and regular archive
                let inputPathList = [archive_path, blacklist_path];
                let status = await mergeFiles(inputPathList, merged_path);

                options.merged_string = fs.readFileSync(merged_path, "utf8");

                downloadConfig.push('--download-archive', merged_path);
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
        // downloadConfig.map((arg) => `"${arg}"`);
        resolve(downloadConfig);
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

function writeToBlacklist(type, line) {
    let blacklistPath = path.join(archivePath, (type === 'audio') ? 'blacklist_audio.txt' : 'blacklist_video.txt');
    // adds newline to the beginning of the line
    line = '\n' + line;
    fs.appendFileSync(blacklistPath, line);
}

// download management functions

function updateDownloads() {
    db.assign({downloads: downloads}).write();
}

/*
function checkDownloads() {
    for (let [session_id, session_downloads] of Object.entries(downloads)) {
        for (let [download_uid, download_obj] of Object.entries(session_downloads)) {
            if (download_obj && !download_obj['complete'] && !download_obj['error']
                             && download_obj.timestamp_start > timestamp_server_start) {
                // download is still running (presumably)
                download_obj.percent_complete = getDownloadPercent(download_obj);
            }
        }
    }
}
*/

function getDownloadPercent(download_obj) {
    if (!download_obj.final_size) {
        if (fs.existsSync(download_obj.expected_json_path)) {
            const file_json = JSON.parse(fs.readFileSync(download_obj.expected_json_path, 'utf8'));
            let calculated_filesize = null;
            if (file_json['format_id']) {
                calculated_filesize = 0;
                const formats_used = file_json['format_id'].split('+');
                for (let i = 0; i < file_json['formats'].length; i++) {
                    if (formats_used.includes(file_json['formats'][i]['format_id'])) {
                        calculated_filesize += file_json['formats'][i]['filesize'];
                    }
                }
            }
            download_obj.final_size = calculated_filesize;
        } else {
            console.log('could not find json file');
        }
    }
    if (fs.existsSync(download_obj.expected_path)) {
        const stats = fs.statSync(download_obj.expected_path);
        const size = stats.size;
        return (size / download_obj.final_size)*100;
    } else {
        console.log('could not find file');
        return 0;
    }
}

// youtube-dl functions

async function startYoutubeDL() {
    // auto update youtube-dl
    if (!debugMode) await autoUpdateYoutubeDL();
}

// auto updates the underlying youtube-dl binary, not YoutubeDL-Material
async function autoUpdateYoutubeDL() {
    return new Promise(resolve => {
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
        let youtubedl_api_path = 'https://api.github.com/repos/ytdl-org/youtube-dl/tags';
        fetch(youtubedl_api_path, {method: 'Get'})
        .then(async res => res.json())
        .then(async (json) => {
            // check if the versions are different
            if (!json || !json[0]) {
                resolve(false);
                return false;
            }
            const latest_update_version = json[0]['name'];
            if (current_version !== latest_update_version) {
                let binary_path = 'node_modules/youtube-dl/bin';
                // versions different, download new update
                logger.info('Found new update for youtube-dl. Updating binary...');
                try {
                    await checkExistsWithTimeout(stored_binary_path, 10000);
                } catch(e) {
                    logger.error(`Failed to update youtube-dl - ${e}`);
                }
                downloader(binary_path, function error(err, done) {
                    if (err) {
                        logger.error(err);
                        resolve(false);
                    }
                    logger.info(`Binary successfully updated: ${current_version} -> ${latest_update_version}`);
                    resolve(true);
                });
            }
        })
        .catch(err => {
            logger.error('Failed to check youtube-dl version for an update.')
            logger.error(err)
        });
    });
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

// https://stackoverflow.com/a/32197381/8088021
const deleteFolderRecursive = function(folder_to_delete) {
    if (fs.existsSync(folder_to_delete)) {
      fs.readdirSync(folder_to_delete).forEach((file, index) => {
        const curPath = path.join(folder_to_delete, file);
        if (fs.lstatSync(curPath).isDirectory()) { // recurse
          deleteFolderRecursive(curPath);
        } else { // delete file
          fs.unlinkSync(curPath);
        }
      });
      fs.rmdirSync(folder_to_delete);
    }
};

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
    } else if (req.path.includes('/api/video/') || req.path.includes('/api/audio/')) {
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
                                                                                            req.path.includes('/api/audio') ||
                                                                                            req.path.includes('/api/video') ||
                                                                                            req.path.includes('/api/downloadFile'))) {
        // check if shared video
        const using_body = req.body && req.body.uuid;
        const uuid = using_body ? req.body.uuid : req.query.uuid;
        const uid = using_body ? req.body.uid : req.query.uid;
        const type = using_body ? req.body.type : req.query.type;
        const is_shared = !req.query.id ? auth_api.getUserVideo(uuid, uid, type, true) : auth_api.getUserPlaylist(uuid, req.query.id, null, true);
        if (is_shared) {
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

app.use('/api/config', configRouter);
app.use('/api/logs', logRouter);

app.get('/api/using-encryption', function(req, res) {
    res.send(usingEncryption);
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
    if (safeDownloadOverride || is_playlist || options.customQualityConfiguration || options.customArgs || options.maxBitrate)
        result_obj = await downloadFileByURL_exec(url, 'audio', options, req.query.sessionID);
    else
        result_obj = await downloadFileByURL_normal(url, 'audio', options, req.query.sessionID);
    if (result_obj) {
        res.send(result_obj);
    } else {
        res.sendStatus(500);
    }

    res.end("yes");
});

app.post('/api/tomp4', optionalJwt, async function(req, res) {
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
    if (safeDownloadOverride || is_playlist || options.customQualityConfiguration || options.customArgs || options.selectedHeight || !url.includes('youtu'))
        result_obj = await downloadFileByURL_exec(url, 'video', options, req.query.sessionID);
    else
        result_obj = await downloadFileByURL_normal(url, 'video', options, req.query.sessionID);
    if (result_obj) {
        res.send(result_obj);
    } else {
        res.sendStatus(500);
    }

    res.end("yes");
});

// gets the status of the mp3 file that's being downloaded
app.post('/api/fileStatusMp3', function(req, res) {
    var name = decodeURIComponent(req.body.name + "");
    var exists = "";
    var fullpath = audioFolderPath + name + ".mp3";
    if (fs.existsSync(fullpath)) {
    	exists = [basePath + audioFolderPath + name, getFileSizeMp3(name)];
    }
    else
    {
        var percent = 0;
        var size = getFileSizeMp3(name);
        var downloaded = getAmountDownloadedMp3(name);
        if (size > 0)
            percent = downloaded/size;
        exists = ["failed", getFileSizeMp3(name), percent];
    }
    //logger.info(exists + " " + name);
    res.send(exists);
    res.end("yes");
});

// gets the status of the mp4 file that's being downloaded
app.post('/api/fileStatusMp4', function(req, res) {
    var name = decodeURIComponent(req.body.name);
    var exists = "";
    var fullpath = videoFolderPath + name + ".mp4";
    if (fs.existsSync(fullpath)) {
    	exists = [basePath + videoFolderPath + name, getFileSizeMp4(name)];
    } else {
        var percent = 0;
        var size = getFileSizeMp4(name);
        var downloaded = getAmountDownloadedMp4(name);
        if (size > 0)
            percent = downloaded/size;
        exists = ["failed", getFileSizeMp4(name), percent];
    }
    //logger.info(exists + " " + name);
    res.send(exists);
    res.end("yes");
});

// gets all download mp3s
app.get('/api/getMp3s', optionalJwt, function(req, res) {
    var mp3s = db.get('files.audio').value(); // getMp3s();
    var playlists = db.get('playlists.audio').value();
    const is_authenticated = req.isAuthenticated();
    if (is_authenticated) {
        // get user audio files/playlists
        auth_api.passport.authenticate('jwt')
        mp3s = auth_api.getUserVideos(req.user.uid, 'audio');
        playlists = auth_api.getUserPlaylists(req.user.uid, 'audio');
    }

    res.send({
        mp3s: mp3s,
        playlists: playlists
    });
});

// gets all download mp4s
app.get('/api/getMp4s', optionalJwt, function(req, res) {
    var mp4s = db.get('files.video').value(); // getMp4s();
    var playlists = db.get('playlists.video').value();

    const is_authenticated = req.isAuthenticated();
    if (is_authenticated) {
        // get user videos/playlists
        auth_api.passport.authenticate('jwt')
        mp4s = auth_api.getUserVideos(req.user.uid, 'video');
        playlists = auth_api.getUserPlaylists(req.user.uid, 'video');
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
    let user_uid = req.isAuthenticated() ? req.user.uid : null;

    // get sub from db
    let subscription = subscriptions_api.getSubscription(subID, user_uid);

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
                files = recFindByExt(appended_base_path, 'mp4');
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

    let new_playlist = {
        'name': playlistName,
        fileNames: fileNames,
        id: shortid.generate(),
        thumbnailURL: thumbnailURL,
        type: type
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

// deletes mp3 file
app.post('/api/deleteMp3', optionalJwt, async (req, res) => {
    // var name = req.body.name;
    var uid = req.body.uid;
    var blacklistMode = req.body.blacklistMode;

    if (req.isAuthenticated()) {
        let success = auth_api.deleteUserFile(req.user.uid, uid, 'audio', blacklistMode);
        res.send(success);
        return;
    }

    var audio_obj = db.get('files.audio').find({uid: uid}).value();
    var name = audio_obj.id;
    var fullpath = audioFolderPath + name + ".mp3";
    var wasDeleted = false;
    if (fs.existsSync(fullpath))
    {
        deleteAudioFile(name, blacklistMode);
        db.get('files.audio').remove({uid: uid}).write();
        wasDeleted = true;
        res.send(wasDeleted);
        res.end("yes");
    } else if (audio_obj) {
        db.get('files.audio').remove({uid: uid}).write();
        wasDeleted = true;
        res.send(wasDeleted);
    } else {
        wasDeleted = false;
        res.send(wasDeleted);
    }
});

// deletes mp4 file
app.post('/api/deleteMp4', optionalJwt, async (req, res) => {
    var uid = req.body.uid;
    var blacklistMode = req.body.blacklistMode;

    if (req.isAuthenticated()) {
        let success = auth_api.deleteUserFile(req.user.uid, uid, 'video', blacklistMode);
        res.send(success);
        return;
    }

    var video_obj = db.get('files.video').find({uid: uid}).value();
    var name = video_obj.id;
    var fullpath = videoFolderPath + name + ".mp4";
    var wasDeleted = false;
    if (fs.existsSync(fullpath))
    {
        wasDeleted = await deleteVideoFile(name, null, blacklistMode);
        db.get('files.video').remove({uid: uid}).write();
        // wasDeleted = true;
        res.send(wasDeleted);
        res.end("yes");
    } else if (video_obj) {
        db.get('files.video').remove({uid: uid}).write();
        wasDeleted = true;
        res.send(wasDeleted);
    } else {
        wasDeleted = false;
        res.send(wasDeleted);
        res.end("yes");
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
        if (req.isAuthenticated()) {
            usersFileFolder = config_api.getConfigItem('ytdl_users_base_path');
            base_path = path.join(usersFileFolder, req.user.uid, type);
        }
        if (!subscriptionName) {
            file = path.join(__dirname, base_path, fileNames + ext);
        } else {
            let basePath = null;
            if (usersFileFolder)
                basePath = path.join(usersFileFolder, req.user.uid, 'subscriptions');
            else
                basePath = config_api.getConfigItem('ytdl_subscriptions_base_path');

            file = path.join(__dirname, basePath, (subscriptionPlaylist === 'true' ? 'playlists' : 'channels'), subscriptionName, fileNames + ext);
        }
    } else {
        for (let i = 0; i < fileNames.length; i++) {
            fileNames[i] = decodeURIComponent(fileNames[i]);
        }
        file = await createPlaylistZipFile(fileNames, type, outputName, fullPathProvided);
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

app.post('/api/deleteFile', async (req, res) => {
    let fileName = req.body.fileName;
    let type = req.body.type;
    if (type === 'audio') {
        deleteAudioFile(fileName);
    } else if (type === 'video') {
        deleteVideoFile(fileName);
    }
    res.send({});
});

app.post('/api/downloadArchive', async (req, res) => {
    let sub = req.body.sub;
    let archive_dir = sub.archive;

    let full_archive_path = path.join(archive_dir, 'archive.txt');

    if (fs.existsSync(full_archive_path)) {
        res.sendFile(full_archive_path);
    } else {
        res.sendStatus(404);
    }

});

var upload_multer = multer({ dest: __dirname + '/appdata/' });
app.post('/api/uploadCookies', upload_multer.single('cookies'), async (req, res) => {
    const new_path = path.join(__dirname, 'appdata', 'cookies.txt');

    if (fs.existsSync(req.file.path)) {
        fs.renameSync(req.file.path, new_path);
    } else {
        res.sendStatus(500);
        return;
    }

    if (fs.existsSync(new_path)) {
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

// Pin API calls

app.post('/api/isPinSet', async (req, res) => {
    let stored_pin = db.get('pin_md5').value();
    let is_set = false;
    if (!stored_pin || stored_pin.length === 0) {
    } else {
        is_set = true;
    }

    res.send({
        is_set: is_set
    });
});

app.post('/api/setPin', async (req, res) => {
    let unhashed_pin = req.body.pin;
    let hashed_pin = md5(unhashed_pin);

    db.set('pin_md5', hashed_pin).write();

    res.send({
        success: true
    });
});

app.post('/api/checkPin', async (req, res) => {
    let input_pin = req.body.input_pin;
    let input_pin_md5 = md5(input_pin);

    let stored_pin = db.get('pin_md5').value();

    let successful = false;

    if (input_pin_md5 === stored_pin) {
        successful = true;
    }

    res.send({
        success: successful
    });
});

// API Key API calls

app.post('/api/generateNewAPIKey', function (req, res) {
    const new_api_key = uuid();
    config_api.setConfigItem('ytdl_api_key', new_api_key);
    res.send({new_api_key: new_api_key});
});

// Streaming API calls

app.get('/api/video/:id', optionalJwt, function(req , res){
    var head;
    let optionalParams = url_api.parse(req.url,true).query;
    let id = decodeURIComponent(req.params.id);
    let file_path = videoFolderPath + id + '.mp4';
    if (req.isAuthenticated() || req.can_watch) {
        let usersFileFolder = config_api.getConfigItem('ytdl_users_base_path');
        if (optionalParams['subName']) {
            const isPlaylist = optionalParams['subPlaylist'];
            file_path = path.join(usersFileFolder, req.user.uid, 'subscriptions', (isPlaylist === 'true' ? 'playlists/' : 'channels/'),optionalParams['subName'], id + '.mp4')
        } else {
            file_path = path.join(usersFileFolder, req.query.uuid ? req.query.uuid : req.user.uid, 'video', id + '.mp4');
        }
    } else if (optionalParams['subName']) {
        let basePath = config_api.getConfigItem('ytdl_subscriptions_base_path');
        const isPlaylist = optionalParams['subPlaylist'];
        basePath += (isPlaylist === 'true' ? 'playlists/' : 'channels/');
        file_path = basePath + optionalParams['subName'] + '/' + id + '.mp4';
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
        'Content-Type': 'video/mp4',
        }
        res.writeHead(206, head);
        file.pipe(res);
    } else {
        head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
        }
        res.writeHead(200, head)
        fs.createReadStream(file_path).pipe(res)
    }
});

app.get('/api/audio/:id', optionalJwt, function(req , res){
    var head;
    let id = decodeURIComponent(req.params.id);
    let file_path = "audio/" + id + '.mp3';
    let usersFileFolder = config_api.getConfigItem('ytdl_users_base_path');
    let optionalParams = url_api.parse(req.url,true).query;
    if (req.isAuthenticated()) {
        if (optionalParams['subName']) {
            const isPlaylist = optionalParams['subPlaylist'];
            file_path = path.join(usersFileFolder, req.user.uid, 'subscriptions', (isPlaylist === 'true' ? 'playlists/' : 'channels/'),optionalParams['subName'], id + '.mp3')
        } else {
            let usersFileFolder = config_api.getConfigItem('ytdl_users_base_path');
            file_path = path.join(usersFileFolder, req.user.uid, 'audio', id + '.mp3');
        }
    } else if (optionalParams['subName']) {
        let basePath = config_api.getConfigItem('ytdl_subscriptions_base_path');
        const isPlaylist = optionalParams['subPlaylist'];
        basePath += (isPlaylist === 'true' ? 'playlists/' : 'channels/');
        file_path = basePath + optionalParams['subName'] + '/' + id + '.mp3';
    }
    file_path = file_path.replace(/\"/g, '\'');
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
    const file = fs.createReadStream(file_path, {start, end});
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
      'Content-Type': 'audio/mp3',
    }
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    head = {
      'Content-Length': fileSize,
      'Content-Type': 'audio/mp3',
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

  app.post('/api/getVideoInfos', async (req, res) => {
    let fileNames = req.body.fileNames;
    let urlMode = !!req.body.urlMode;
    let type = req.body.type;
    let result = null;
    if (!urlMode) {
        if (type === 'audio') {
            result = getAudioInfos(fileNames)
        } else if (type === 'video') {
            result = getVideoInfos(fileNames);
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
        , auth_api.passport.authenticate('local', {})
        , auth_api.passport.authorize('local')
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
            deleteFolderRecursive(user_folder);
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
