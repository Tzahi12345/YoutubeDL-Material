var async = require('async');
const { uuid } = require('uuidv4');
var fs = require('fs-extra');
var winston = require('winston');
var path = require('path');
var youtubedl = require('youtube-dl');
var compression = require('compression');
var https = require('https');
var express = require("express");
var bodyParser = require("body-parser");
var archiver = require('archiver');
var unzipper = require('unzipper');
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

var app = express();

// database setup
const FileSync = require('lowdb/adapters/FileSync')
const adapter = new FileSync('./appdata/db.json');
const db = low(adapter)

// check if debug mode
let debugMode = process.env.YTDL_MODE === 'debug';

// logging setup

// console format
const defaultFormat = winston.format.printf(({ level, message, label, timestamp }) => {
    return `${timestamp} ${level.toUpperCase()}: ${message}`;
});
const logger = winston.createLogger({
    level: !debugMode ? 'info' : 'debug',
    format: winston.format.combine(winston.format.timestamp(), defaultFormat),
    defaultMeta: {},
    transports: [
      //
      // - Write to all logs with level `info` and below to `combined.log` 
      // - Write all logs error (and below) to `error.log`.
      //
      new winston.transports.File({ filename: 'appdata/logs/error.log', level: 'error' }),
      new winston.transports.File({ filename: 'appdata/logs/combined.log' }),
      new winston.transports.Console({level: 'info'})
    ]
});

config_api.setLogger(logger);
subscriptions_api.setLogger(logger);

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
        subscriptions: [],
        pin_md5: '',
        files_to_db_migration_complete: false
}).write();

// config values
var frontendUrl = null;
var backendUrl = null;
var backendPort = null;
var usingEncryption = null;
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
var options = null; // encryption options
var url_domain = null;
var updaterStatus = null;

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

var validDownloadingAgents = [
    'aria2c',
    'avconv',
    'axel',
    'curl',
    'ffmpeg',
    'httpie',
    'wget'
]

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

var descriptors = {};

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// objects

function File(id, title, thumbnailURL, isAudio, duration, url, uploader, size, path, upload_date) {
    this.id = id;
    this.title = title;
    this.thumbnailURL = thumbnailURL;
    this.isAudio = isAudio;
    this.duration = duration;
    this.url = url;
    this.uploader = uploader;
    this.size = size;
    this.path = path;
    this.upload_date = upload_date;
}

// actual functions

async function checkMigrations() {
    return new Promise(async resolve => {
        // 3.5->3.6 migration
        const files_to_db_migration_complete = db.get('files_to_db_migration_complete').value();

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
                    registerFileDB(file_obj.id + '.mp3', 'audio');
                }
            }

            for (let i = 0; i < mp4s.length; i++) {
                let file_obj = mp4s[i];
                const file_already_in_db = db.get('files.video').find({id: file_obj.id}).value();
                if (!file_already_in_db) {
                    logger.verbose(`Migrating file ${file_obj.id}`);
                    registerFileDB(file_obj.id + '.mp4', 'video');
                }
            }

            // sets migration to complete
            db.set('files_to_db_migration_complete', true).write();
            resolve(true);
        } catch(err) {
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
        // await downloadReleaseFiles(tag);

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
                                    'youtubedl-material/appdata/db.json']
        logger.info(`Installing update ${tag}...`)

        // downloads new package.json and adds new public dir files from the downloaded zip
        fs.createReadStream(path.join(__dirname, `youtubedl-material-latest-release-${tag}.zip`)).pipe(unzipper.Parse())
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
                if (debugMode) logger.verbose('Downloading file ' + actualFileName);
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
        let output_path = `backup-${Date.now()}.zip`;
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
                                'backup-*.zip'];

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
        url = !debugMode ? config_api.getConfigItem('ytdl_url') : 'http://localhost:4200';
        backendPort = config_api.getConfigItem('ytdl_port');
        usingEncryption = config_api.getConfigItem('ytdl_use_encryption');
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

        if (usingEncryption)
        {
            var certFilePath = path.resolve(config_api.getConfigItem('ytdl_cert_file_path'));
            var keyFilePath = path.resolve(config_api.getConfigItem('ytdl_key_file_path'));

            var certKeyFile = fs.readFileSync(keyFilePath);
            var certFile = fs.readFileSync(certFilePath);

            options = {
                key: certKeyFile,
                cert: certFile
            };
        }

        url_domain = new URL(url);

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

        // start the server here
        startServer();

        resolve(true);
    });
    
}

function calculateSubcriptionRetrievalDelay(amount) {
    // frequency is 5 mins
    let frequency_in_ms = subscriptionsCheckInterval * 1000;
    let minimum_frequency = 60 * 1000;
    const first_frequency = frequency_in_ms/amount;
    return (first_frequency < minimum_frequency) ? minimum_frequency : first_frequency;
}

function watchSubscriptions() { 
    let subscriptions = subscriptions_api.getAllSubscriptions();

    if (!subscriptions) return;

    let subscriptions_amount = subscriptions.length;
    let delay_interval = calculateSubcriptionRetrievalDelay(subscriptions_amount);

    let current_delay = 0;
    for (let i = 0; i < subscriptions.length; i++) {
        let sub = subscriptions[i];
        logger.debug('watching ' + sub.name + ' with delay interval of ' + delay_interval);
        setTimeout(() => {
            subscriptions_api.getVideosForSub(sub);
        }, current_delay);
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
        var jsonobj = getJSONMp3(id);
        if (!jsonobj) continue;
        var title = jsonobj.title;
        var url = jsonobj.webpage_url;
        var uploader = jsonobj.uploader;
        var upload_date = jsonobj.upload_date;
        upload_date = `${upload_date.substring(0, 4)}-${upload_date.substring(4, 6)}-${upload_date.substring(6, 8)}`;

        var size = stats.size;

        var thumbnail = jsonobj.thumbnail;
        var duration = jsonobj.duration;
        var isaudio = true;
        var file_obj = new File(id, title, thumbnail, isaudio, duration, url, uploader, size, file, upload_date);
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
        var jsonobj = getJSONMp4(id);
        if (!jsonobj) continue;
        var title = jsonobj.title;
        var url = jsonobj.webpage_url;
        var uploader = jsonobj.uploader;
        var upload_date = jsonobj.upload_date;
        upload_date = `${upload_date.substring(0, 4)}-${upload_date.substring(4, 6)}-${upload_date.substring(6, 8)}`;
        var thumbnail = jsonobj.thumbnail;
        var duration = jsonobj.duration;

        var size = stats.size;

        var isaudio = false;
        var file_obj = new File(id, title, thumbnail, isaudio, duration, url, uploader, size, file, upload_date);
        mp4s.push(file_obj);
    }
    return mp4s;
}

function getThumbnailMp3(name)
{
    var obj = getJSONMp3(name);
    var thumbnailLink = obj.thumbnail;
    return thumbnailLink;
}

function getThumbnailMp4(name)
{
    var obj = getJSONMp4(name);
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

function getJSONMp3(name)
{
    var jsonPath = audioFolderPath+name+".info.json";
    var alternateJsonPath = audioFolderPath+name+".mp3.info.json";
    if (fs.existsSync(jsonPath))
        var obj = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    else if (fs.existsSync(alternateJsonPath))
        var obj = JSON.parse(fs.readFileSync(alternateJsonPath, 'utf8'));
    else
        var obj = 0;
    
    return obj;
}

function getJSONMp4(name, customPath = null)
{
    let jsonPath = null;
    if (!customPath) {
        jsonPath = videoFolderPath+name+".info.json";
    } else {
        jsonPath = customPath + name + ".info.json";
    }
    if (fs.existsSync(jsonPath))
    {
        var obj = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        return obj;
    }
    else return 0;
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
        jsonPath = path.join(__dirname, jsonPath);
        altJSONPath = path.join(__dirname, altJSONPath);
        audioFilePath = path.join(__dirname, audioFilePath);

        let jsonExists = fs.existsSync(jsonPath);

        if (!jsonExists) {
            if (fs.existsSync(altJSONPath)) {
                jsonExists = true;
                jsonPath = altJSONPath;
            }
        }

        let audioFileExists = fs.existsSync(audioFilePath);

        if (descriptors[name]) {
            try {
                for (let i = 0; i < descriptors[name].length; i++) {
                    descriptors[name][i].destroy();
                }
            } catch(e) {

            }
        } 

        let useYoutubeDLArchive = config_api.getConfigItem('ytdl_use_youtubedl_archive');
        if (useYoutubeDLArchive) {
            const archive_path = path.join(archivePath, 'archive_audio.txt');

            // get ID from JSON

            var jsonobj = getJSONMp3(name);
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
        var videoFilePath = path.join(filePath,name+'.mp4');
        jsonPath = path.join(__dirname, jsonPath);
        videoFilePath = path.join(__dirname, videoFilePath);

        jsonExists = fs.existsSync(jsonPath);
        videoFileExists = fs.existsSync(videoFilePath);

        if (descriptors[name]) {
            try {
                for (let i = 0; i < descriptors[name].length; i++) {
                    descriptors[name][i].destroy();
                }
            } catch(e) {

            }
        } 

        let useYoutubeDLArchive = config_api.getConfigItem('ytdl_use_youtubedl_archive');
        if (useYoutubeDLArchive) {
            const archive_path = path.join(archivePath, 'archive_video.txt');

            // get ID from JSON

            var jsonobj = getJSONMp4(name);
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

function registerFileDB(full_file_path, type) {
    const file_id = full_file_path.substring(0, full_file_path.length-4);
    const file_object = generateFileObject(file_id, type);
    if (!file_object) {
        logger.error(`Could not find associated JSON file for ${type} file ${file_id}`);
        return false;
    }

    file_object['uid'] = uuid();
    path_object = path.parse(file_object['path']);
    file_object['path'] = path.format(path_object);
    db.get(`files.${type}`)
      .push(file_object)
      .write();
    return file_object['uid'];
}

function generateFileObject(id, type) {
    var jsonobj = (type === 'audio') ? getJSONMp3(id) : getJSONMp4(id);
    if (!jsonobj) {
        return null;
    }
    const ext = (type === 'audio') ? '.mp3' : '.mp4'
    const file_path = getTrueFileName(jsonobj['_filename'], type); // path.join(type === 'audio' ? audioFolderPath : videoFolderPath, id + ext);
    var stats = fs.statSync(path.join(__dirname, file_path));

    var title = jsonobj.title;
    var url = jsonobj.webpage_url;
    var uploader = jsonobj.uploader;
    var upload_date = jsonobj.upload_date;
    upload_date = `${upload_date.substring(0, 4)}-${upload_date.substring(4, 6)}-${upload_date.substring(6, 8)}`;

    var size = stats.size;

    var thumbnail = jsonobj.thumbnail;
    var duration = jsonobj.duration;
    var isaudio = type === 'audio';
    var file_obj = new File(id, title, thumbnail, isaudio, duration, url, uploader, size, file_path, upload_date);
    return file_obj;
}

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

// currently only works for single urls
async function getUrlInfos(urls) {
    let startDate = Date.now();
    let result = [];
    return new Promise(resolve => {
        youtubedl.exec(urls.join(' '), ['--dump-json'], {}, (err, output) => {
            if (debugMode) {
                let new_date = Date.now();
                let difference = (new_date - startDate)/1000;
                logger.info(`URL info retrieval delay: ${difference} seconds.`);
            }
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

function writeToBlacklist(type, line) {
    let blacklistPath = path.join(archivePath, (type === 'audio') ? 'blacklist_audio.txt' : 'blacklist_video.txt');
    // adds newline to the beginning of the line
    line = '\n' + line;
    fs.appendFileSync(blacklistPath, line);
}

async function startYoutubeDL() {
    // auto update youtube-dl
    await autoUpdateYoutubeDL();
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
            const guessed_file_path = guessed_base_path + 'youtube-dl' + (process.platform === 'win32' ? '.exe' : '');
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
                    'use strict'
                    if (err) {
                        resolve(false);
                        throw err;
                    }
                    logger.info(`Binary successfully updated: ${current_version} -> ${latest_update_version}`);
                    resolve(true);
                });
            }
        
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
    res.header("Access-Control-Allow-Origin", getOrigin());
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

app.use(compression());

app.get('/api/config', function(req, res) {
    let config_file = config_api.getConfigFile();
    res.send({
        config_file: config_file,
        success: !!config_file
    });
});

app.post('/api/setConfig', function(req, res) {
    let new_config_file = req.body.new_config_file;
    if (new_config_file && new_config_file['YoutubeDLMaterial']) {
        let success = config_api.setConfigFile(new_config_file);
        res.send({
            success: success
        });
    } else {
        logger.error('Tried to save invalid config file!')
        res.sendStatus(400);
    }
    
});

app.get('/api/using-encryption', function(req, res) {
    res.send(usingEncryption);
});

app.post('/api/tomp3', async function(req, res) {
    var url = req.body.url;
    var date = Date.now();
    var audiopath = '%(title)s';

    var customQualityConfiguration = req.body.customQualityConfiguration;
    var maxBitrate = req.body.maxBitrate;
    var globalArgs = config_api.getConfigItem('ytdl_custom_args');
    var customArgs = req.body.customArgs;
    var customOutput = req.body.customOutput;
    var youtubeUsername = req.body.youtubeUsername;
    var youtubePassword = req.body.youtubePassword;

    let downloadConfig = null;
    let qualityPath = '-f bestaudio';

    let merged_path = null;
    let merged_string = null;

    if (customArgs) {
        downloadConfig = customArgs.split(' ');
    } else {
        if (customQualityConfiguration) {
            qualityPath = `-f ${customQualityConfiguration}`;
        } else if (maxBitrate) {
            if (!maxBitrate || maxBitrate === '') maxBitrate = '0'; 
            qualityPath = `--audio-quality ${maxBitrate}`
        }

        if (customOutput) {
            downloadConfig = ['-x', '--audio-format', 'mp3', '-o', audioFolderPath + customOutput + '.%(ext)s', '--write-info-json', '--print-json'];
        } else {
            downloadConfig = ['-x', '--audio-format', 'mp3', '-o', audioFolderPath + audiopath + ".%(ext)s", '--write-info-json', '--print-json'];
        }

        if (youtubeUsername && youtubePassword) {
            downloadConfig.push('--username', youtubeUsername, '--password', youtubePassword);
        }
    
        if (qualityPath !== '') {
            downloadConfig.splice(3, 0, qualityPath);
        }
    
        if (!useDefaultDownloadingAgent && customDownloadingAgent) {
            downloadConfig.splice(0, 0, '--external-downloader', customDownloadingAgent);
        }

        let useYoutubeDLArchive = config_api.getConfigItem('ytdl_use_youtubedl_archive');
        if (useYoutubeDLArchive) {
            const archive_path = path.join(archivePath, 'archive_audio.txt');
            // create archive file if it doesn't exist
            if (!fs.existsSync(archive_path)) {
                fs.closeSync(fs.openSync(archive_path, 'w'));
            }

            let blacklist_path = path.join(archivePath, 'blacklist_audio.txt');
            // create blacklist file if it doesn't exist
            if (!fs.existsSync(blacklist_path)) {
                fs.closeSync(fs.openSync(blacklist_path, 'w'));
            }

            // creates merged folder
            merged_path = audioFolderPath + `merged_${uuid()}.txt`;
            // merges blacklist and regular archive
            let inputPathList = [archive_path, blacklist_path];
            let status = await mergeFiles(inputPathList, merged_path);

            merged_string = fs.readFileSync(merged_path, "utf8");

            downloadConfig.push('--download-archive', merged_path);
        }

        if (globalArgs && globalArgs !== '') {
            // adds global args
            downloadConfig = downloadConfig.concat(globalArgs.split(' '));
        }
    }

    youtubedl.exec(url, downloadConfig, {}, function(err, output) {
        var uid = null;
        let new_date = Date.now();
        let difference = (new_date - date)/1000;
        logger.debug(`Audio download delay: ${difference} seconds.`);
        if (err) {
            audiopath = "-1";
            logger.error(err.stderr);
            res.sendStatus(500);
            throw err;
        } else if (output) {  
            var file_names = [];
            if (output.length === 0 || output[0].length === 0) {
                res.sendStatus(500);
                return;
            }
            for (let i = 0; i < output.length; i++) {
                let output_json = null;
                try {
                    output_json = JSON.parse(output[i]);
                } catch(e) {
                    output_json = null;
                }
                if (!output_json) {
                    // if invalid, continue onto the next
                    continue;
                }

                const filepath_no_extension = removeFileExtension(output_json['_filename']);
                
                var full_file_path = filepath_no_extension + '.mp3';
                var file_name = filepath_no_extension.substring(audioFolderPath.length, filepath_no_extension.length);
                if (fs.existsSync(full_file_path)) {
                    let tags = {
                        title: output_json['title'],
                        artist: output_json['artist'] ? output_json['artist'] : output_json['uploader']
                    }
                    // NodeID3.create(tags, function(frame) {  })
                    let success = NodeID3.write(tags, full_file_path);
                    if (!success) logger.error('Failed to apply ID3 tag to audio file ' + full_file_path);

                    // registers file in DB
                    uid = registerFileDB(full_file_path.substring(audioFolderPath.length, full_file_path.length), 'audio');
                } else {
                    logger.error('Download failed: Output mp3 does not exist');
                }

                if (file_name) file_names.push(file_name);
            }

            let is_playlist = file_names.length > 1;

            if (merged_string !== null) {
                let current_merged_archive = fs.readFileSync(merged_path, 'utf8');
                let diff = current_merged_archive.replace(merged_string, '');
                const archive_path = path.join(archivePath, 'archive_audio.txt');
                fs.appendFileSync(archive_path, diff);
                fs.unlinkSync(merged_path)
            }

            var audiopathEncoded = encodeURIComponent(file_names[0]);
            res.send({
                audiopathEncoded: audiopathEncoded,
                file_names: is_playlist ? file_names : null,
                uid: uid
            });
        }
    });
});

app.post('/api/tomp4', async function(req, res) {
    var url = req.body.url;
    var date = Date.now();
    var videopath = '%(title)s';
    var globalArgs = config_api.getConfigItem('ytdl_custom_args');
    var customArgs = req.body.customArgs;
    var customOutput = req.body.customOutput;

    var selectedHeight = req.body.selectedHeight;
    var customQualityConfiguration = req.body.customQualityConfiguration;
    var youtubeUsername = req.body.youtubeUsername;
    var youtubePassword = req.body.youtubePassword;

    let merged_string = null;

    let downloadConfig = null;
    let qualityPath = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4';

    if (customArgs) {
        downloadConfig = customArgs.split(' ');
    } else {
        if (customQualityConfiguration) {
            qualityPath = customQualityConfiguration;
        } else if (selectedHeight && selectedHeight !== '') {
            qualityPath = `bestvideo[height=${selectedHeight}]+bestaudio/best[height=${selectedHeight}]`;
        }

        if (customOutput) {
            downloadConfig = ['-o', videoFolderPath + customOutput + ".mp4", '-f', qualityPath, '--write-info-json', '--print-json'];
        } else {
            downloadConfig = ['-o', videoFolderPath + videopath + ".mp4", '-f', qualityPath, '--write-info-json', '--print-json'];
        }

        if (youtubeUsername && youtubePassword) {
            downloadConfig.push('--username', youtubeUsername, '--password', youtubePassword);
        }
    
        if (!useDefaultDownloadingAgent && customDownloadingAgent) {
            downloadConfig.splice(0, 0, '--external-downloader', customDownloadingAgent);
        }

        let useYoutubeDLArchive = config_api.getConfigItem('ytdl_use_youtubedl_archive');
        if (useYoutubeDLArchive) {
            const archive_path = path.join(archivePath, 'archive_video.txt');
            // create archive file if it doesn't exist
            if (!fs.existsSync(archive_path)) {
                fs.closeSync(fs.openSync(archive_path, 'w'));
            }

            let blacklist_path = path.join(archivePath, 'blacklist_video.txt');
            // create blacklist file if it doesn't exist
            if (!fs.existsSync(blacklist_path)) {
                fs.closeSync(fs.openSync(blacklist_path, 'w'));
            }

            let merged_path = videoFolderPath + 'merged.txt';
            // merges blacklist and regular archive
            let inputPathList = [archive_path, blacklist_path];
            let status = await mergeFiles(inputPathList, merged_path);

            merged_string = fs.readFileSync(merged_path, "utf8");

            downloadConfig.push('--download-archive', merged_path);
        }

        if (globalArgs && globalArgs !== '') {
            // adds global args
            downloadConfig = downloadConfig.concat(globalArgs.split(' '));
        }

    }

    youtubedl.exec(url, downloadConfig, {}, function(err, output) {
        var uid = null;
        let new_date = Date.now();
        let difference = (new_date - date)/1000;
        logger.debug(`Video download delay: ${difference} seconds.`);
        if (err) {
            videopath = "-1";
            logger.error(err.stderr);
            res.sendStatus(500);
            throw err;
        } else if (output) {
            if (output.length === 0 || output[0].length === 0) {
                res.sendStatus(500);
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
                
                var full_file_path = filepath_no_extension + '.mp4';
                var file_name = filepath_no_extension.substring(audioFolderPath.length, filepath_no_extension.length);

                // renames file if necessary due to bug
                if (!fs.existsSync(output_json['_filename'] && fs.existsSync(output_json['_filename'] + '.webm'))) {
                    try {
                        fs.renameSync(output_json['_filename'] + '.webm', output_json['_filename']);
                        logger.info('Renamed ' + file_name + '.webm to ' + file_name);
                    } catch(e) {
                    }
                }

                // registers file in DB
                uid = registerFileDB(full_file_path.substring(videoFolderPath.length, full_file_path.length), 'video');

                if (file_name) file_names.push(file_name);
            }

            let is_playlist = file_names.length > 1;
            if (!is_playlist) audiopath = file_names[0];

            if (merged_string !== null) {
                let current_merged_archive = fs.readFileSync(videoFolderPath + 'merged.txt', 'utf8');
                let diff = current_merged_archive.replace(merged_string, '');
                const archive_path = path.join(archivePath, 'archive_video.txt');
                fs.appendFileSync(archive_path, diff);
            }
            
            var videopathEncoded = encodeURIComponent(file_names[0]);
            res.send({
                videopathEncoded: videopathEncoded,
                file_names: is_playlist ? file_names : null,
                uid: uid
            });
            res.end("yes");
        }
    });
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
app.post('/api/getMp3s', function(req, res) {
    var mp3s = db.get('files.audio').value(); // getMp3s();
    var playlists = db.get('playlists.audio').value();

    res.send({
        mp3s: mp3s,
        playlists: playlists
    });
    res.end("yes");
});

// gets all download mp4s
app.post('/api/getMp4s', function(req, res) {
    var mp4s = db.get('files.video').value(); // getMp4s();
    var playlists = db.get('playlists.video').value();

    res.send({
        mp4s: mp4s,
        playlists: playlists
    });
    res.end("yes");
});

app.post('/api/getFile', function (req, res) {
    var uid = req.body.uid;
    var type = req.body.type;

    var file = null;

    if (!type) {
        file = db.get('files.audio').find({uid: uid}).value();
        if (!file) {
            file = db.get('files.video').find({uid: uid}).value();
            if (file) type = 'video';
        } else {
            type = 'audio';
        }
    }

    if (!file && type) db.get(`files.${type}`).find({uid: uid}).value();

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
app.post('/api/enableSharing', function(req, res) {
    var type = req.body.type;
    var uid = req.body.uid;
    var is_playlist = req.body.is_playlist;
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

app.post('/api/disableSharing', function(req, res) {
    var type = req.body.type;
    var uid = req.body.uid;
    var is_playlist = req.body.is_playlist;
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

app.post('/api/subscribe', async (req, res) => {
    let name = req.body.name;
    let url = req.body.url;
    let timerange = req.body.timerange;

    const new_sub = {
                        name: name,
                        url: url,
                        id: uuid()
                    };

    // adds timerange if it exists, otherwise all videos will be downloaded
    if (timerange) {
        new_sub.timerange = timerange;
    }

    const result_obj = await subscriptions_api.subscribe(new_sub);

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

app.post('/api/unsubscribe', async (req, res) => {
    let deleteMode = req.body.deleteMode
    let sub = req.body.sub;

    let result_obj = subscriptions_api.unsubscribe(sub, deleteMode);
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

app.post('/api/deleteSubscriptionFile', async (req, res) => {
    let deleteForever = req.body.deleteForever;
    let file = req.body.file;
    let sub = req.body.sub;

    let success = await subscriptions_api.deleteSubscriptionFile(sub, file, deleteForever);

    if (success) {
        res.send({
            success: success
        });
    } else {
        res.sendStatus(500);
    }

});

app.post('/api/getSubscription', async (req, res) => {
    let subID = req.body.id;

    // get sub from db
    let subscription = subscriptions_api.getSubscription(subID);

    if (!subscription) {
        // failed to get subscription from db, send 400 error
        res.sendStatus(400);
        return;
    }

    // get sub videos
    if (subscription.name) {
        let base_path = config_api.getConfigItem('ytdl_subscriptions_base_path');
        let appended_base_path = path.join(base_path, subscription.isPlaylist ? 'playlists' : 'channels', subscription.name, '/');
        let files;
        try {
            files = recFindByExt(appended_base_path, 'mp4');
        } catch(e) {
            files = null;
            logger.info('Failed to get folder for subscription: ' + subscription.name + ' at path ' + appended_base_path);
            res.sendStatus(500);
            return;
        }
        var parsed_files = [];
        for (let i = 0; i < files.length; i++) {
            let file = files[i];
            var file_path = file.substring(appended_base_path.length, file.length);
            var stats = fs.statSync(file);

            var id = file_path.substring(0, file_path.length-4);
            var jsonobj = getJSONMp4(id, appended_base_path);
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
            var file_obj = new File(id, title, thumbnail, isaudio, duration, url, uploader, size, file, upload_date);
            parsed_files.push(file_obj);
        }

        res.send({
            subscription: subscription,
            files: parsed_files
        });
    } else {
        res.sendStatus(500);
    }
});

app.post('/api/downloadVideosForSubscription', async (req, res) => {
    let subID = req.body.subID;
    let sub = subscriptions_api.getSubscription(subID);
    subscriptions_api.getVideosForSub(sub);
    res.send({
        success: true
    });
});

app.post('/api/getAllSubscriptions', async (req, res) => {
    // get subs from api
    let subscriptions = subscriptions_api.getAllSubscriptions();

    res.send({
        subscriptions: subscriptions
    });
});

app.post('/api/createPlaylist', async (req, res) => {
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

    db.get(`playlists.${type}`)
      .push(new_playlist)
      .write();
    
    res.send({
        new_playlist: new_playlist,
        success: !!new_playlist // always going to be true
    })
});

app.post('/api/getPlaylist', async (req, res) => {
    let playlistID = req.body.playlistID;
    let type = req.body.type;

    let playlist = null;

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
    
    res.send({
        playlist: playlist,
        type: type,
        success: !!playlist 
    });
});

app.post('/api/updatePlaylist', async (req, res) => {
    let playlistID = req.body.playlistID;
    let fileNames = req.body.fileNames;
    let type = req.body.type;

    let success = false;
    try {
        db.get(`playlists.${type}`)
            .find({id: playlistID})
            .assign({fileNames: fileNames})
            .write();
        /*logger.info('success!');
        let new_val = db.get(`playlists.${type}`)
            .find({id: playlistID})
            .value();
        logger.info(new_val);*/
        success = true;
    } catch(e) {
        logger.error(`Failed to find playlist with ID ${playlistID}`);
    }
    
    res.send({
        success: success
    })
});

app.post('/api/deletePlaylist', async (req, res) => {
    let playlistID = req.body.playlistID;
    let type = req.body.type;

    let success = null;
    try {
        // removes playlist from playlists
        db.get(`playlists.${type}`)
            .remove({id: playlistID})
            .write();

        success = true;
    } catch(e) {
        success = false;
    }

    res.send({
        success: success
    })
});

// deletes mp3 file
app.post('/api/deleteMp3', async (req, res) => {
    // var name = req.body.name;
    var uid = req.body.uid;
    var audio_obj = db.get('files.audio').find({uid: uid}).value();
    var name = audio_obj.id;
    var blacklistMode = req.body.blacklistMode;
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
app.post('/api/deleteMp4', async (req, res) => {
    var uid = req.body.uid;
    var video_obj = db.get('files.video').find({uid: uid}).value();
    var name = video_obj.id;
    var blacklistMode = req.body.blacklistMode;
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

app.post('/api/downloadFile', async (req, res) => {
    let fileNames = req.body.fileNames;
    let zip_mode = req.body.zip_mode;
    let type = req.body.type;
    let outputName = req.body.outputName;
    let fullPathProvided = req.body.fullPathProvided;
    let subscriptionName = req.body.subscriptionName;
    let subscriptionPlaylist = req.body.subscriptionPlaylist;
    let file = null;
    if (!zip_mode) {
        fileNames = decodeURIComponent(fileNames);
        if (type === 'audio') {
            if (!subscriptionName) {
                file = path.join(__dirname, audioFolderPath, fileNames + '.mp3');
            } else {
                let basePath = config_api.getConfigItem('ytdl_subscriptions_base_path');
                file = path.join(__dirname, basePath, (subscriptionPlaylist ? 'playlists' : 'channels'), subscriptionName, fileNames + '.mp3')
            } 
        } else {
            // if type is 'subscription' or 'video', it's a video
            if (!subscriptionName) {
                file = path.join(__dirname, videoFolderPath, fileNames + '.mp4');
            } else {
                let basePath = config_api.getConfigItem('ytdl_subscriptions_base_path');
                file = path.join(__dirname, basePath, (subscriptionPlaylist ? 'playlists' : 'channels'), subscriptionName, fileNames + '.mp4')
            }
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
    res.send()
});

app.post('/api/downloadArchive', async (req, res) => {
    let sub = req.body.sub;
    let archive_dir = sub.archive;
    
    let full_archive_path = path.join(__dirname, archive_dir, 'archive.txt');

    if (fs.existsSync(full_archive_path)) {
        res.sendFile(full_archive_path);
    } else {
        res.sendStatus(404);
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

app.get('/api/video/:id', function(req , res){
    var head;
    let optionalParams = url_api.parse(req.url,true).query;
    let id = decodeURIComponent(req.params.id);
    let path = videoFolderPath + id + '.mp4';
    if (optionalParams['subName']) {
        let basePath = config_api.getConfigItem('ytdl_subscriptions_base_path');
        const isPlaylist = optionalParams['subPlaylist'];
        basePath += (isPlaylist === 'true' ? 'playlists/' : 'channels/');
        path = basePath + optionalParams['subName'] + '/' + id + '.mp4'; 
    }
    const stat = fs.statSync(path)
    const fileSize = stat.size
    const range = req.headers.range
    if (range) {
        const parts = range.replace(/bytes=/, "").split("-")
        const start = parseInt(parts[0], 10)
        const end = parts[1] 
        ? parseInt(parts[1], 10)
        : fileSize-1
        const chunksize = (end-start)+1
        const file = fs.createReadStream(path, {start, end})
        if (descriptors[id]) descriptors[id].push(file);
        else                            descriptors[id] = [file];
        file.on('close', function() {
            let index = descriptors[id].indexOf(file);
            descriptors[id].splice(index, 1);
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
        fs.createReadStream(path).pipe(res)
    }
});

app.get('/api/audio/:id', function(req , res){
    var head;
    let id = decodeURIComponent(req.params.id);
    let path = "audio/" + id + '.mp3';
    path = path.replace(/\"/g, '\'');
  const stat = fs.statSync(path)
  const fileSize = stat.size
  const range = req.headers.range
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-")
    const start = parseInt(parts[0], 10)
    const end = parts[1] 
      ? parseInt(parts[1], 10)
      : fileSize-1
    const chunksize = (end-start)+1
    const file = fs.createReadStream(path, {start, end});
    if (descriptors[id]) descriptors[id].push(file);
    else                            descriptors[id] = [file];
    file.on('close', function() {
        let index = descriptors[id].indexOf(file);
        descriptors[id].splice(index, 1);
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
    fs.createReadStream(path).pipe(res)
  }
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
