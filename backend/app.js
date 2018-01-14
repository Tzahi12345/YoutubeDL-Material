var async = require('async');
var fs = require('fs');
var path = require('path');
var youtubedl = require('youtube-dl');
var config = require('config');
const https = require('https');
var express = require("express");
var bodyParser = require("body-parser");
var app = express();
var appAnchor = express();

var hostURL = config.get("YoutubeDL-Material.Host.url");
var hostPort = config.get("YoutubeDL-Material.Host.port");
var usingEncryption = config.get("YoutubeDL-Material.Encryption.use-encryption");
var basePath = config.get("YoutubeDL-Material.Downloader.path-base");
var audioPath = config.get("YoutubeDL-Material.Downloader.path-audio");
var videoPath = config.get("YoutubeDL-Material.Downloader.path-video");

if (usingEncryption)
{
    var certFilePath = path.resolve(config.get("YoutubeDL-Material.Encryption.cert-file-path"));
    var keyFilePath = path.resolve(config.get("YoutubeDL-Material.Encryption.key-file-path"));

    var certKeyFile = fs.readFileSync(certFilePath);
    var certFile = fs.readFileSync(keyFilePath);
    var options = {
        key: certKeyFile,
        cert: certFile
    };
}



app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

appAnchor.use(bodyParser.urlencoded({ extended: false }));
appAnchor.use(bodyParser.json());

app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", hostURL);
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

appAnchor.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", hostURL);
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

appAnchor.get('/url', function(req, res) {
    res.send(JSON.stringify(("localhost" + ":" + hostPort + "/")));
    res.end("yes");
});

appAnchor.get('/using-encryption', function(req, res) {
    res.send(usingEncryption);
    res.end("yes");
});

app.post('/tomp3', function(req, res) {
    var url = req.body.url;
    var date = Date.now();
    var path = audioPath;
    var audiopath = Date.now();
    youtubedl.exec(url, ['--no-check-certificate','-o', path + audiopath + ".mp3", '-x', '--audio-format', 'mp3'], {}, function(err, output) {
        if (err) {
            audiopath = "-1";
            throw err;
        }
    });
    var completeString = "done";
    var audiopathEncoded = encodeURIComponent(audiopath);
    res.send(audiopathEncoded);
    res.end("yes");
});

app.post('/tomp4', function(req, res) {
    var url = req.body.url;
    var date = Date.now();
    var path = videoPath;
    var videopath = Date.now();
    youtubedl.exec(url, ['--no-check-certificate', '-o', path + videopath + ".mp4", '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4'], {}, function(err, output) {
        if (err) {
            videopath = "-1";
            throw err;
        }
    });
    var completeString = "done";
    var videopathEncoded = encodeURIComponent(videopath);
    res.send(videopathEncoded);
    res.end("yes");
});

app.post('/mp3fileexists', function(req, res) {
    var name = req.body.name + "";
    var exists = "";
    var fullpath = audioPath + name + ".mp3";
    if (fs.existsSync(fullpath)) {
    	exists = basePath + audioPath + name;
    }
    else
    {
      exists = "failed";
    }
    //console.log(exists + " " + name);
    res.send(JSON.stringify(exists));
    res.end("yes");
});

app.post('/mp4fileexists', function(req, res) {
    var name = req.body.name;
    var exists = "";
    var fullpath = videoPath + name + ".mp4";
    if (fs.existsSync(fullpath)) {
    	exists = basePath + videoPath + name;
    }
    else
    {
      exists = "failed";
    }
    //console.log(exists + " " + name);
    res.send(JSON.stringify(exists));
    res.end("yes");
});

app.get('/video/:id', function(req , res){
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
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    }
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    }
    res.writeHead(200, head)
    fs.createReadStream(path).pipe(res)
  }
});

app.get('/audio/:id', function(req , res){
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
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'audio/mp3',
    }
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'audio/mp3',
    }
    res.writeHead(200, head)
    fs.createReadStream(path).pipe(res)
  }
  });


appAnchor.listen(17442,function(){
  console.log("Anchor set on 17442");
});

if (usingEncryption)
{
    https.createServer(options, app).listen(hostPort, function() {
        console.log('HTTPS: Started on PORT ' + hostPort);
    });
}
else
{
    app.listen(hostPort,function(){
        console.log("HTTP: Started on PORT " + hostPort);
    });
}