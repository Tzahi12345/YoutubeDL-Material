var async = require('async');
var fs = require('fs');
var path = require('path');
var youtubedl = require('youtube-dl');
var config = require('config');
var https = require('https');
var express = require("express");
var bodyParser = require("body-parser");
var archiver = require('archiver');
const low = require('lowdb')
var URL = require('url').URL;
const shortid = require('shortid')

var app = express();

const FileSync = require('lowdb/adapters/FileSync')
const adapter = new FileSync('db.json');
const db = low(adapter)

// Set some defaults
db.defaults({ playlists: {
    audio: [],
    video: []
}}).write();


// check if debug mode
let debugMode = process.env.YTDL_MODE === 'debug';

if (debugMode) console.log('YTDL-Material in debug mode!');

var frontendUrl = !debugMode ? config.get("YoutubeDLMaterial.Host.frontendurl") : 'http://localhost:4200';
var backendUrl = config.get("YoutubeDLMaterial.Host.backendurl")
var backendPort = 17442;
var usingEncryption = config.get("YoutubeDLMaterial.Encryption.use-encryption");
var basePath = config.get("YoutubeDLMaterial.Downloader.path-base");
var audioFolderPath = config.get("YoutubeDLMaterial.Downloader.path-audio");
var videoFolderPath = config.get("YoutubeDLMaterial.Downloader.path-video");
var downloadOnlyMode = config.get("YoutubeDLMaterial.Extra.download_only_mode")
var useDefaultDownloadingAgent = config.get("YoutubeDLMaterial.Advanced.use_default_downloading_agent");
var customDownloadingAgent = config.get("YoutubeDLMaterial.Advanced.custom_downloading_agent");
var validDownloadingAgents = [
    'aria2c'
]
if (!useDefaultDownloadingAgent && validDownloadingAgents.indexOf(customDownloadingAgent) !== -1 ) {
    console.log(`INFO: Using non-default downloading agent \'${customDownloadingAgent}\'`)
}

var descriptors = {};


if (usingEncryption)
{
    
    var certFilePath = path.resolve(config.get("YoutubeDLMaterial.Encryption.cert-file-path"));
    var keyFilePath = path.resolve(config.get("YoutubeDLMaterial.Encryption.key-file-path"));

    var certKeyFile = fs.readFileSync(keyFilePath);
    var certFile = fs.readFileSync(certFilePath);

    var options = {
        key: certKeyFile,
        cert: certFile
    };
}



app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

var url_domain = new URL(frontendUrl);

app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", url_domain.origin);
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

app.get('/using-encryption', function(req, res) {
    res.send(usingEncryption);
    res.end("yes");
});

// objects

function File(id, title, thumbnailURL, isAudio, duration) {
    this.id = id;
    this.title = title;
    this.thumbnailURL = thumbnailURL;
    this.isAudio = isAudio;
    this.duration = duration;
}

// actual functions

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

function getJSONMp4(name)
{
    var jsonPath = videoFolderPath+name+".info.json";
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

async function deleteVideoFile(name) {
    return new Promise(resolve => {
        var jsonPath = path.join(videoFolderPath,name+'.info.json');
        var videoFilePath = path.join(videoFolderPath,name+'.mp4');
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

app.post('/tomp3', function(req, res) {
    var url = req.body.url;
    var date = Date.now();
    var path = audioFolderPath;
    var audiopath = '%(title)s';

    var customQualityConfiguration = req.body.customQualityConfiguration;
    var maxBitrate = req.body.maxBitrate;

    let downloadConfig = ['-o', path + audiopath + ".mp3", '-x', '--audio-format', 'mp3', '--write-info-json', '--print-json']
    let qualityPath = '';

    if (customQualityConfiguration) {
        qualityPath = `-f ${customQualityConfiguration}`;
    } else if (maxBitrate) {
        if (!maxBitrate || maxBitrate === '') maxBitrate = '0'; 
        qualityPath = `--audio-quality ${maxBitrate}`
    }

    if (qualityPath !== '') {
        downloadConfig.splice(2, 0, qualityPath);
    }

    if (!useDefaultDownloadingAgent && customDownloadingAgent === 'aria2c') {
        downloadConfig.splice(0, 0, '--external-downloader', 'aria2c');
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
                var alternate_file_name = file_name.substring(0, file_name.length-4);
                if (alternate_file_name) file_names.push(alternate_file_name);
            }

            let is_playlist = file_names.length > 1;
            if (!is_playlist) audiopath = file_names[0];

            var audiopathEncoded = encodeURIComponent(file_names[0]);
            res.send({
                audiopathEncoded: audiopathEncoded,
                file_names: is_playlist ? file_names : null
            });
        }
    });
});

app.post('/tomp4', function(req, res) {
    var url = req.body.url;
    var date = Date.now();
    var path = videoFolderPath;
    var videopath = '%(title)s';

    var selectedHeight = req.body.selectedHeight;
    var customQualityConfiguration = req.body.customQualityConfiguration;

    let qualityPath = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4';

    if (customQualityConfiguration) {
        qualityPath = customQualityConfiguration;
    } else if (selectedHeight && selectedHeight !== '') {
        qualityPath = `bestvideo[height=${selectedHeight}]+bestaudio/best[height=${selectedHeight}]`;
    }

    let downloadConfig = ['-o', path + videopath + ".mp4", '-f', qualityPath, '--write-info-json', '--print-json']
    if (!useDefaultDownloadingAgent && customDownloadingAgent === 'aria2c') {
        downloadConfig.splice(0, 0, '--external-downloader', 'aria2c');
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
                if (alternate_file_name) file_names.push(alternate_file_name);
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
app.post('/fileStatusMp3', function(req, res) {
    var name = decodeURI(req.body.name + "");
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
app.post('/fileStatusMp4', function(req, res) {
    var name = decodeURI(req.body.name);
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
app.post('/getMp3s', function(req, res) {
    var mp3s = [];
    var playlists = db.get('playlists.audio').value();
    var fullpath = audioFolderPath;
    var files = fs.readdirSync(audioFolderPath);
    
    for (var i in files)
    {
        var nameLength = path.basename(files[i]).length;
        var ext = path.basename(files[i]).substring(nameLength-4, nameLength);
        if (ext == ".mp3") 
        {
            var jsonobj = getJSONMp3(path.basename(files[i]).substring(0, path.basename(files[i]).length-4));
            if (!jsonobj) continue;
            var id = path.basename(files[i]).substring(0, path.basename(files[i]).length-4);
            var title = jsonobj.title;

            if (title.length > 14) // edits title if it's too long
            {
                title = title.substring(0,12) + "...";
            }

            var thumbnail = jsonobj.thumbnail;
            var duration = jsonobj.duration;
            var isaudio = true;
            var file = new File(id, title, thumbnail, isaudio, duration);
            mp3s.push(file);
        }
    }

    res.send({
        mp3s: mp3s,
        playlists: playlists
    });
    res.end("yes");
});

// gets all download mp4s
app.post('/getMp4s', function(req, res) {
    var mp4s = [];
    var playlists = db.get('playlists.video').value();
    var fullpath = videoFolderPath;
    var files = fs.readdirSync(videoFolderPath);
    
    for (var i in files)
    {
        var nameLength = path.basename(files[i]).length;
        var ext = path.basename(files[i]).substring(nameLength-4, nameLength);
        if (ext == ".mp4") 
        {
            var jsonobj = getJSONMp4(path.basename(files[i]).substring(0, path.basename(files[i]).length-4));
            if (!jsonobj) continue;
            var id = path.basename(files[i]).substring(0, path.basename(files[i]).length-4);
            var title = jsonobj.title;

            if (title.length > 14) // edits title if it's too long
            {
                title = title.substring(0,12) + "...";
            }

            var thumbnail = jsonobj.thumbnail;
            var duration = jsonobj.duration;
            var isaudio = false;
            var file = new File(id, title, thumbnail, isaudio, duration);
            mp4s.push(file);
        }
    }

    res.send({
        mp4s: mp4s,
        playlists: playlists
    });
    res.end("yes");
});

app.post('/createPlaylist', async (req, res) => {
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

app.post('/updatePlaylist', async (req, res) => {
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

app.post('/deletePlaylist', async (req, res) => {
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
app.post('/deleteMp3', async (req, res) => {
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
app.post('/deleteMp4', async (req, res) => {
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

app.post('/downloadFile', async (req, res) => {
    let fileNames = req.body.fileNames;
    let is_playlist = req.body.is_playlist;
    let type = req.body.type;
    let outputName = req.body.outputName;
    let file = null;
    if (!is_playlist) {
        if (type === 'audio') {
            file = __dirname + '/' + 'audio/' + fileNames + '.mp3';
        } else if (type === 'video') {
            file = __dirname + '/' + 'video/' + fileNames + '.mp4';
        }
    } else {
        file = await createPlaylistZipFile(fileNames, type, outputName);
    }

    res.sendFile(file);
});

app.post('/deleteFile', async (req, res) => {
    let fileName = req.body.fileName;
    let type = req.body.type;
    if (type === 'audio') {
        deleteAudioFile(fileName);
    } else if (type === 'video') {
        deleteVideoFile(fileName);
    }
    res.send()
});

app.get('/video/:id', function(req , res){
    var head;
    const path = "video/" + req.params.id + '.mp4';
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
    if (descriptors[req.params.id]) descriptors[req.params.id].push(file);
    else                            descriptors[req.params.id] = [file];
    file.on('close', function() {
        let index = descriptors[req.params.id].indexOf(file);
        descriptors[req.params.id].splice(index, 1);
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

app.get('/audio/:id', function(req , res){
    var head;
    let path = "audio/" + req.params.id + '.mp3';
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
    if (descriptors[req.params.id]) descriptors[req.params.id].push(file);
    else                            descriptors[req.params.id] = [file];
    file.on('close', function() {
        let index = descriptors[req.params.id].indexOf(file);
        descriptors[req.params.id].splice(index, 1);
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


  app.post('/getVideoInfos', async (req, res) => {
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




if (usingEncryption)
{
    https.createServer(options, app).listen(backendPort, function() {
        console.log('HTTPS: Anchor set on 17442');
    });
}
else
{
    app.listen(backendPort,function(){
        console.log("HTTP: Started on PORT " + backendPort);
    });
}