var async = require('async');
const { uuid } = require('uuidv4');
var fs = require('fs');
var path = require('path');
var youtubedl = require('youtube-dl');
var compression = require('compression');
var https = require('https');
var express = require("express");
var bodyParser = require("body-parser");
var archiver = require('archiver');
const low = require('lowdb')
var URL = require('url').URL;
const shortid = require('shortid')
const url_api = require('url');
var config_api = require('./config.js'); 
var subscriptions_api = require('./subscriptions')

var app = express();

const FileSync = require('lowdb/adapters/FileSync')
const adapter = new FileSync('db.json');
const db = low(adapter)

// Set some defaults
db.defaults(
    { 
        playlists: {
            audio: [],
            video: []
        },
        configWriteFlag: false,
        subscriptions: []
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

// other needed values
var options = null; // encryption options
var url_domain = null;

// check if debug mode
let debugMode = process.env.YTDL_MODE === 'debug';

if (debugMode) console.log('YTDL-Material in debug mode!');

var validDownloadingAgents = [
    'aria2c'
]

// don't overwrite config if it already happened.. NOT
// let alreadyWritten = db.get('configWriteFlag').value();
let writeConfigMode = process.env.write_ytdl_config;
var config = null;

if (writeConfigMode) {
    setAndLoadConfig();
} else {
    loadConfig();
}

var descriptors = {};

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// objects

function File(id, title, thumbnailURL, isAudio, duration) {
    this.id = id;
    this.title = title;
    this.thumbnailURL = thumbnailURL;
    this.isAudio = isAudio;
    this.duration = duration;
}

// actual functions

function startServer() {
    if (usingEncryption)
    {
        https.createServer(options, app).listen(backendPort, function() {
            console.log('HTTPS: Started on PORT ' + backendPort);
        });
    }
    else
    {
        app.listen(backendPort,function(){
            console.log("HTTP: Started on PORT " + backendPort);
        });
    }
}

async function setAndLoadConfig() {
    await setConfigFromEnv();
    await loadConfig();
    // console.log(backendUrl);
}

async function setConfigFromEnv() {
    return new Promise(resolve => {
        let config_items = getEnvConfigItems();
        let success = config_api.setConfigItems(config_items);
        if (success) {
            console.log('Config items set using ENV variables.');
            setTimeout(() => resolve(true), 100);
        } else {
            console.log('ERROR: Failed to set config items using ENV variables.');
            resolve(false);
        }
    });
}

async function loadConfig() {
    return new Promise(resolve => {
        // get config library
        // config = require('config');

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
            console.log(`INFO: Using non-default downloading agent \'${customDownloadingAgent}\'`)
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

        // get subscriptions
        if (allowSubscriptions) {
            // runs initially, then runs every ${subscriptionCheckInterval} seconds
            watchSubscriptions();
            setInterval(() => {
                watchSubscriptions();
            }, subscriptionsCheckInterval * 1000);
        }

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
        if (debugMode) console.log('watching ' + sub.name + ' with delay interval of ' + delay_interval);
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
    var jsonPath = audioFolderPath+name+".mp3.info.json";
    if (fs.existsSync(jsonPath))
    var obj = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
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

async function createPlaylistZipFile(fileNames, type, outputName) {
    return new Promise(async resolve => {
        let zipFolderPath = path.join(__dirname, (type === 'audio') ? audioFolderPath : videoFolderPath);
        // let name = fileNames[0].split(' ')[0] + fileNames[1].split(' ')[0];
        let ext = (type === 'audio') ? '.mp3' : '.mp4';

        let output = fs.createWriteStream(path.join(zipFolderPath, outputName + '.zip'));

        var archive = archiver('zip', {
            gzip: true,
            zlib: { level: 9 } // Sets the compression level.
        });
        
        archive.on('error', function(err) {
            console.log(err);
            throw err;
        });
        
        // pipe archive data to the output file
        archive.pipe(output);

        for (let i = 0; i < fileNames.length; i++) {
            let fileName = fileNames[i];
            archive.file(zipFolderPath + fileName + ext, {name: fileName + ext})
        }

        await archive.finalize();

        // wait a tiny bit for the zip to reload in fs
        setTimeout(function() {
            resolve(path.join(zipFolderPath,outputName + '.zip'));
        }, 100);
        
    });
    

}

function deleteAudioFile(name) {
    return new Promise(resolve => {
        // TODO: split descriptors into audio and video descriptors, as deleting an audio file will close all video file streams
        var jsonPath = path.join(audioFolderPath,name+'.mp3.info.json');
        var audioFilePath = path.join(audioFolderPath,name+'.mp3');
        jsonPath = path.join(__dirname, jsonPath);
        audioFilePath = path.join(__dirname, audioFilePath);

        let jsonExists = fs.existsSync(jsonPath);
        let audioFileExists = fs.existsSync(audioFilePath);

        if (descriptors[name]) {
            try {
                for (let i = 0; i < descriptors[name].length; i++) {
                    descriptors[name][i].destroy();
                }
            } catch(e) {

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

async function deleteVideoFile(name, customPath = null) {
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
                console.log(`ERROR: Could not find info for file ${fileName}.mp3`);
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
                console.log(`ERROR: Could not find info for file ${fileName}.mp4`);
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
                console.log(`URL info retrieval delay: ${difference} seconds.`);
            }
            if (err) {
                console.log('Error during parsing:' + err);
                resolve(null);
            }
            let try_putput = null;
            try {
                try_putput = JSON.parse(output);
                result = try_putput;
            } catch(e) {
                // probably multiple urls
                console.log('failed to parse for urls starting with ' + urls[0]);
                // console.log(output);
            }
            resolve(result);
        });
    });
}

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
        console.log('ERROR: Tried to save invalid config file!')
        res.sendStatus(400);
    }
    
});

app.get('/api/using-encryption', function(req, res) {
    res.send(usingEncryption);
});

app.post('/api/tomp3', function(req, res) {
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
    let qualityPath = '';

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
            downloadConfig = ['-o', audioFolderPath + customOutput + '.mp3', '-x', '--audio-format', 'mp3', '--write-info-json', '--print-json'];
        } else {
            downloadConfig = ['-o', audioFolderPath + audiopath + ".mp3", '-x', '--audio-format', 'mp3', '--write-info-json', '--print-json'];
        }

        if (youtubeUsername && youtubePassword) {
            downloadConfig.push('--username', youtubeUsername, '--password', youtubePassword);
        }
    
        if (qualityPath !== '') {
            downloadConfig.splice(2, 0, qualityPath);
        }
    
        if (!useDefaultDownloadingAgent && customDownloadingAgent === 'aria2c') {
            downloadConfig.splice(0, 0, '--external-downloader', 'aria2c');
        }

        if (globalArgs && globalArgs !== '') {
            // adds global args
            downloadConfig = downloadConfig.concat(globalArgs.split(' '));
        }
    }

    youtubedl.exec(url, downloadConfig, {}, function(err, output) {
        if (debugMode) {
            let new_date = Date.now();
            let difference = (new_date - date)/1000;
            console.log(`Audio download delay: ${difference} seconds.`);
        }
        if (err) {
            audiopath = "-1";
            console.log(err.stderr);
            res.sendStatus(500);
            throw err;
        } else if (output) {  
            var file_names = [];
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
                var file_name = output_json['_filename'].replace(/^.*[\\\/]/, '');
                var file_path = output_json['_filename'].substring(audioFolderPath.length, output_json['_filename'].length);
                var alternate_file_path = file_path.substring(0, file_path.length-4);
                var alternate_file_name = file_name.substring(0, file_name.length-4);
                if (alternate_file_path) file_names.push(alternate_file_path);
            }

            let is_playlist = file_names.length > 1;
            // if (!is_playlist) audiopath = file_names[0];

            var audiopathEncoded = encodeURIComponent(file_names[0]);
            res.send({
                audiopathEncoded: audiopathEncoded,
                file_names: is_playlist ? file_names : null
            });
        }
    });
});

app.post('/api/tomp4', function(req, res) {
    var url = req.body.url;
    var date = Date.now();
    var path = videoFolderPath;
    var videopath = '%(title)s';
    var globalArgs = config_api.getConfigItem('ytdl_custom_args');
    var customArgs = req.body.customArgs;
    var customOutput = req.body.customOutput;

    var selectedHeight = req.body.selectedHeight;
    var customQualityConfiguration = req.body.customQualityConfiguration;
    var youtubeUsername = req.body.youtubeUsername;
    var youtubePassword = req.body.youtubePassword;

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
            downloadConfig = ['-o', path + customOutput + ".mp4", '-f', qualityPath, '--write-info-json', '--print-json'];
        } else {
            downloadConfig = ['-o', path + videopath + ".mp4", '-f', qualityPath, '--write-info-json', '--print-json'];
        }

        if (youtubeUsername && youtubePassword) {
            downloadConfig.push('--username', youtubeUsername, '--password', youtubePassword);
        }
    
        if (!useDefaultDownloadingAgent && customDownloadingAgent === 'aria2c') {
            downloadConfig.splice(0, 0, '--external-downloader', 'aria2c');
        }

        if (globalArgs && globalArgs !== '') {
            // adds global args
            downloadConfig = downloadConfig.concat(globalArgs.split(' '));
        }
    }

    youtubedl.exec(url, downloadConfig, {}, function(err, output) {
        if (debugMode) {
            let new_date = Date.now();
            let difference = (new_date - date)/1000;
            console.log(`Video download delay: ${difference} seconds.`);
        }
        if (err) {
            videopath = "-1";
            console.log(err.stderr);
            res.sendStatus(500);
            throw err;
        } else if (output) {
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
                var file_name = output_json['_filename'].replace(/^.*[\\\/]/, '');

                // renames file if necessary due to bug
                if (!fs.existsSync(output_json['_filename'] && fs.existsSync(output_json['_filename'] + '.webm'))) {
                    try {
                        fs.renameSync(output_json['_filename'] + '.webm', output_json['_filename']);
                        console.log('Renamed ' + file_name + '.webm to ' + file_name);
                    } catch(e) {
                    }
                }
                var alternate_file_name = file_name.substring(0, file_name.length-4);
                var file_path = output_json['_filename'].substring(audioFolderPath.length, output_json['_filename'].length);
                var alternate_file_path = file_path.substring(0, file_path.length-4);
                if (alternate_file_name) file_names.push(alternate_file_path);
            }

            let is_playlist = file_names.length > 1;
            if (!is_playlist) audiopath = file_names[0];
            
            var videopathEncoded = encodeURIComponent(file_names[0]);
            res.send({
                videopathEncoded: videopathEncoded,
                file_names: is_playlist ? file_names : null
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
    //console.log(exists + " " + name);
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
    //console.log(exists + " " + name);
    res.send(exists);
    res.end("yes");
});

// gets all download mp3s
app.post('/api/getMp3s', function(req, res) {
    var mp3s = [];
    var playlists = db.get('playlists.audio').value();
    var files = recFindByExt(audioFolderPath, 'mp3'); // fs.readdirSync(audioFolderPath);
    for (let i = 0; i < files.length; i++) {
        let file = files[i];
        var file_path = file.substring(audioFolderPath.length, file.length);
        var id = file_path.substring(0, file_path.length-4);
        var jsonobj = getJSONMp3(id);
        if (!jsonobj) continue;
        var title = jsonobj.title;

        if (title.length > 14) // edits title if it's too long
        {
            title = title.substring(0,12) + "...";
        }

        var thumbnail = jsonobj.thumbnail;
        var duration = jsonobj.duration;
        var isaudio = true;
        var file_obj = new File(id, title, thumbnail, isaudio, duration);
        mp3s.push(file_obj);
    }

    res.send({
        mp3s: mp3s,
        playlists: playlists
    });
    res.end("yes");
});

// gets all download mp4s
app.post('/api/getMp4s', function(req, res) {
    var mp4s = [];
    var playlists = db.get('playlists.video').value();
    var fullpath = videoFolderPath;
    var files = recFindByExt(videoFolderPath, 'mp4');
    for (let i = 0; i < files.length; i++) {
        let file = files[i];
        var file_path = file.substring(videoFolderPath.length, file.length);
        var id = file_path.substring(0, file_path.length-4);
        var jsonobj = getJSONMp4(id);
        if (!jsonobj) continue;
        var title = jsonobj.title;

        if (title.length > 14) // edits title if it's too long
        {
            title = title.substring(0,12) + "...";
        }

        var thumbnail = jsonobj.thumbnail;
        var duration = jsonobj.duration;
        var isaudio = false;
        var file_obj = new File(id, title, thumbnail, isaudio, duration);
        mp4s.push(file_obj);
    }

    res.send({
        mp4s: mp4s,
        playlists: playlists
    });
    res.end("yes");
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
            console.log('Failed to get folder for subscription: ' + subscription.name);
            res.sendStatus(500);
            return;
        }
        var parsed_files = [];
        for (let i = 0; i < files.length; i++) {
            let file = files[i];
            var file_path = file.substring(appended_base_path.length, file.length);
            var id = file_path.substring(0, file_path.length-4);
            var jsonobj = getJSONMp4(id, appended_base_path);
            if (!jsonobj) continue;
            var title = jsonobj.title;

            var thumbnail = jsonobj.thumbnail;
            var duration = jsonobj.duration;
            var isaudio = false;
            var file_obj = new File(id, title, thumbnail, isaudio, duration);
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
        thumbnailURL: thumbnailURL
    };

    db.get(`playlists.${type}`)
      .push(new_playlist)
      .write();
    
    res.send({
        new_playlist: new_playlist,
        success: !!new_playlist // always going to be true
    })
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
        /*console.log('success!');
        let new_val = db.get(`playlists.${type}`)
            .find({id: playlistID})
            .value();
        console.log(new_val);*/
        success = true;
    } catch(e) {
        console.error(`Failed to find playlist with ID ${playlistID}`);
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
    var name = req.body.name;
    var fullpath = audioFolderPath + name + ".mp3";
    var wasDeleted = false;
    if (fs.existsSync(fullpath))
    {
        deleteAudioFile(name);
        wasDeleted = true;
        res.send(wasDeleted);
        res.end("yes");
    }
    else
    {
        wasDeleted = false;
        res.send(wasDeleted);
        res.end("yes");
    }
});

// deletes mp4 file
app.post('/api/deleteMp4', async (req, res) => {
    var name = req.body.name;
    var fullpath = videoFolderPath + name + ".mp4";
    var wasDeleted = false;
    if (fs.existsSync(fullpath))
    {
        wasDeleted = await deleteVideoFile(name);
        // wasDeleted = true;
        res.send(wasDeleted);
        res.end("yes");
    }
    else
    {
        wasDeleted = false;
        res.send(wasDeleted);
        res.end("yes");
    }
});

app.post('/api/downloadFile', async (req, res) => {
    let fileNames = req.body.fileNames;
    let is_playlist = req.body.is_playlist;
    let type = req.body.type;
    let outputName = req.body.outputName;
    let file = null;
    if (!is_playlist) {
        fileNames = decodeURIComponent(fileNames);
        if (type === 'audio') {
            file = __dirname + '/' + audioFolderPath + fileNames + '.mp3';
        } else if (type === 'video') {
            file = __dirname + '/' + videoFolderPath + fileNames + '.mp4';
        }
    } else {
        for (let i = 0; i < fileNames.length; i++) {
            fileNames[i] = decodeURIComponent(fileNames[i]);
        }
        file = await createPlaylistZipFile(fileNames, type, outputName);
    }

    res.sendFile(file);
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

app.get('/api/video/:id', function(req , res){
    var head;
    let optionalParams = url_api.parse(req.url,true).query;
    let id = decodeURIComponent(req.params.id);
    let path = "video/" + id + '.mp4';
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
            if (debugMode) console.log('Successfully closed stream and removed file reference.');
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
        if (debugMode) console.log('Successfully closed stream and removed file reference.');
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

    fs.createReadStream('./public/index.html').pipe(res);

});

app.use(express.static('./public'));
