var async = require('async');
var fs = require('fs');
var path = require('path');
var youtubedl = require('youtube-dl');
var config = require('config');
var https = require('https');
var express = require("express");
var bodyParser = require("body-parser");
var app = express();

var URL = require('url').URL;

var frontendUrl = config.get("YoutubeDLMaterial.Host.frontendurl");
var backendUrl = config.get("YoutubeDLMaterial.Host.backendurl")
var backendPort = 17442;
var usingEncryption = config.get("YoutubeDLMaterial.Encryption.use-encryption");
var basePath = config.get("YoutubeDLMaterial.Downloader.path-base");
var audioPath = config.get("YoutubeDLMaterial.Downloader.path-audio");
var videoPath = config.get("YoutubeDLMaterial.Downloader.path-video");

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
    var jsonPath = audioPath+name+".mp3.info.json";

    if (fs.existsSync(jsonPath))
        var obj = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    else
        var obj = 0;
    
    return obj.filesize;
}

function getFileSizeMp4(name)
{
    var jsonPath = videoPath+name+".info.json";
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
    var jsonPath = audioPath+name+".mp3.info.json";
    if (fs.existsSync(jsonPath))
    var obj = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    else
        var obj = 0;
    
    return obj;
}

function getJSONMp4(name)
{
    var jsonPath = videoPath+name+".info.json";
    if (fs.existsSync(jsonPath))
    {
        var obj = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        return obj;
    }
    else return 0;
}

function getAmountDownloadedMp3(name)
{
    var partPath = audioPath+name+".mp3.part";
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
    var partPath = videoPath+name+".f"+format+".mp4.part";
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
    var jsonPath = videoPath+name+".info.json";
    if (fs.existsSync(jsonPath))
    {
        var obj = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        var format = obj.format.substring(0,3);
        return format;
    }
}

app.post('/tomp3', function(req, res) {
    var url = req.body.url;
    var date = Date.now();
    var path = audioPath;
    var audiopath = Date.now();
    youtubedl.exec(url, ['--external-downloader', 'aria2c', '-o', path + audiopath + ".mp3", '-x', '--audio-format', 'mp3', '--write-info-json'], {}, function(err, output) {
        if (err) {
            audiopath = "-1";
            throw err;
        }
    });

    // write file info

    /*
    youtubedl.getInfo(url, function(err, info) {
        if (err) throw err;
       
        var size = info.size;
        fs.writeFile("data/"+audiopath, size, function(err) {
            if(err) {
                return console.log(err);
            }
        
            console.log("The file was saved!");
        }); 
      });
      */
    var completeString = "done";
    var audiopathEncoded = encodeURIComponent(audiopath);
    res.send({
        audiopathEncoded: audiopathEncoded
    });
    res.end("yes");
});

app.post('/tomp4', function(req, res) {
    var url = req.body.url;
    var date = Date.now();
    var path = videoPath;
    var videopath = Date.now();
    youtubedl.exec(url, ['--external-downloader', 'aria2c', '-o', path + videopath + ".mp4", '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4', '--write-info-json'], {}, function(err, output) {
        if (err) {
            videopath = "-1";
            throw err;
        }
    });
    var completeString = "done";
    var videopathEncoded = encodeURIComponent(videopath);
    res.send({
        videopathEncoded: videopathEncoded
    });
    res.end("yes");
});

// gets the status of the mp3 file that's being downloaded
app.post('/fileStatusMp3', function(req, res) {
    var name = req.body.name + "";
    var exists = "";
    var fullpath = audioPath + name + ".mp3";
    if (fs.existsSync(fullpath)) {
    	exists = [basePath + audioPath + name, getFileSizeMp3(name)];
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
    var name = req.body.name;
    var exists = "";
    var fullpath = videoPath + name + ".mp4";
    if (fs.existsSync(fullpath)) {
    	exists = [basePath + videoPath + name, getFileSizeMp4(name)];
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
    var fullpath = audioPath;
    var files = fs.readdirSync(audioPath);
    
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
        mp3s: mp3s
    });
    res.end("yes");
});

// gets all download mp4s
app.post('/getMp4s', function(req, res) {
    var mp4s = [];
    var fullpath = videoPath;
    var files = fs.readdirSync(videoPath);
    
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
        mp4s: mp4s
    });
    res.end("yes");
});

// deletes mp3 file
app.post('/deleteMp3', function(req, res) {
    var name = req.body.name;
    var fullpath = audioPath + name + ".mp3";
    var wasDeleted = false;
    if (fs.existsSync(fullpath))
    {
        fs.unlink(fullpath, call => {

        });
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
app.post('/deleteMp4', function(req, res) {
    var name = req.body.name;
    var fullpath = videoPath + name + ".mp4";
    var wasDeleted = false;
    if (fs.existsSync(fullpath))
    {
        fs.unlink(fullpath, call => {
            // console.log(call);
        });
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

app.post('/downloadFile', function(req, res) {
    let fileName = req.body.fileName;
    let type = req.body.type;
    let file = null;
    if (type === 'audio') {
        file = __dirname + '/' + 'audio/' + fileName + '.mp3';
    } else if (type === 'video') {
        file = __dirname + '/' + 'video/' + fileName + '.mp4';
    }

    res.sendFile(file);
});


app.get('/video/:id', function(req , res){
    var head;
    const path = "video/" + req.params.id + ".mp4";
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
    const path = "audio/" + req.params.id + ".mp3";
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