const FileSync = require('lowdb/adapters/FileSync')

var fs = require('fs-extra');
const { uuid } = require('uuidv4');
var path = require('path');

var youtubedl = require('youtube-dl');
const config_api = require('./config');

const debugMode = process.env.YTDL_MODE === 'debug';

var logger = null;
var db = null;
function setDB(input_db) { db = input_db; } 
function setLogger(input_logger) { logger = input_logger; }

function initialize(input_db, input_logger) {
    setDB(input_db);
    setLogger(input_logger);
}

async function subscribe(sub) {
    const result_obj = {
        success: false,
        error: ''
    };
    return new Promise(async resolve => {
        // sub should just have url and name. here we will get isPlaylist and path
        sub.isPlaylist = sub.url.includes('playlist');

        if (db.get('subscriptions').find({url: sub.url}).value()) {
            logger.info('Sub already exists');
            result_obj.error = 'Subcription with URL ' + sub.url + ' already exists!';
            resolve(result_obj);
            return;
        }

        // add sub to db
        db.get('subscriptions').push(sub).write();

        let success = await getSubscriptionInfo(sub);
        result_obj.success = success;
        result_obj.sub = sub;
        getVideosForSub(sub);
        resolve(result_obj);
    });
    
}

async function getSubscriptionInfo(sub) {
    const basePath = config_api.getConfigItem('ytdl_subscriptions_base_path');
    return new Promise(resolve => {
        // get videos 
        let downloadConfig = ['--dump-json', '--playlist-end', '1']
        youtubedl.exec(sub.url, downloadConfig, {}, function(err, output) {
            if (debugMode) {
                logger.info('Subscribe: got info for subscription ' + sub.id);
            }
            if (err) {
                logger.error(err.stderr);
                resolve(false);
            } else if (output) {
                if (output.length === 0 || (output.length === 1 && output[0] === '')) {
                    logger.verbose('Could not get info for ' + sub.id);
                    resolve(false);
                }
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

                    if (!sub.name) {
                        sub.name = sub.isPlaylist ? output_json.playlist_title : output_json.uploader;
                        // if it's now valid, update
                        if (sub.name) {
                            db.get('subscriptions').find({id: sub.id}).assign({name: sub.name}).write();
                        }
                    }

                    if (!sub.archive) {
                        // must create the archive
                        const archive_dir = path.join(__dirname, basePath, 'archives', sub.name);
                        const archive_path = path.join(archive_dir, 'archive.txt');

                        // creates archive directory and text file if it doesn't exist
                        fs.ensureDirSync(archive_dir);
                        fs.ensureFileSync(archive_path);

                        // updates subscription
                        sub.archive = archive_dir;
                        db.get('subscriptions').find({id: sub.id}).assign({archive: archive_dir}).write();
                    }

                    // TODO: get even more info

                    resolve(true);
                }
                resolve(false);
            }
        });
    });
}

async function unsubscribe(sub, deleteMode) {
    return new Promise(async resolve => {
        const basePath = config_api.getConfigItem('ytdl_subscriptions_base_path');
        let result_obj = { success: false, error: '' };

        let id = sub.id;
        db.get('subscriptions').remove({id: id}).write();

        const appendedBasePath = getAppendedBasePath(sub, basePath);
        if (deleteMode && fs.existsSync(appendedBasePath)) {
            if (sub.archive && fs.existsSync(sub.archive)) {
                const archive_file_path = path.join(sub.archive, 'archive.txt');
                // deletes archive if it exists
                if (fs.existsSync(archive_file_path)) {
                    fs.unlinkSync(archive_file_path);
                }
                fs.rmdirSync(sub.archive);
            }
            deleteFolderRecursive(appendedBasePath);
        }
    });

}

async function deleteSubscriptionFile(sub, file, deleteForever) {
    const basePath = config_api.getConfigItem('ytdl_subscriptions_base_path');
    const useArchive = config_api.getConfigItem('ytdl_subscriptions_use_youtubedl_archive');
    const appendedBasePath = getAppendedBasePath(sub, basePath);
    const name = file;
    let retrievedID = null;
    return new Promise(resolve => {
        let filePath = appendedBasePath;
        var jsonPath = path.join(__dirname,filePath,name+'.info.json');
        var videoFilePath = path.join(__dirname,filePath,name+'.mp4');
        var imageFilePath = path.join(__dirname,filePath,name+'.jpg');

        jsonExists = fs.existsSync(jsonPath);
        videoFileExists = fs.existsSync(videoFilePath);
        imageFileExists = fs.existsSync(imageFilePath);

        if (jsonExists) {
            retrievedID = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))['id'];
            fs.unlinkSync(jsonPath);
        }

        if (imageFileExists) {
            fs.unlinkSync(imageFilePath);
        }

        if (videoFileExists) {
            fs.unlink(videoFilePath, function(err) {
                if (fs.existsSync(jsonPath) || fs.existsSync(videoFilePath)) {
                    resolve(false);
                } else {
                    // check if the user wants the video to be redownloaded (deleteForever === false)
                    if (!deleteForever && useArchive && sub.archive && retrievedID) {
                        const archive_path = path.join(sub.archive, 'archive.txt')
                        // if archive exists, remove line with video ID
                        if (fs.existsSync(archive_path)) {
                            removeIDFromArchive(archive_path, retrievedID);
                        }
                    }
                    resolve(true);
                }
            });
        } else {
            // TODO: tell user that the file didn't exist
            resolve(true);
        }
        
    });
}

async function getVideosForSub(sub) {
    return new Promise(resolve => {
        if (!subExists(sub.id)) {
            resolve(false);
            return;
        }
        const sub_db = db.get('subscriptions').find({id: sub.id});
        const basePath = config_api.getConfigItem('ytdl_subscriptions_base_path');
        const useArchive = config_api.getConfigItem('ytdl_subscriptions_use_youtubedl_archive');

        let appendedBasePath = null
        if (sub.name) {
            appendedBasePath = getAppendedBasePath(sub, basePath);
        } else {
            appendedBasePath = basePath + (sub.isPlaylist ? 'playlists/%(playlist_title)s' : 'channels/%(uploader)s');
        }

        let downloadConfig = ['-o', appendedBasePath + '/%(title)s.mp4', '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4', '-ciw', '--write-annotations', '--write-thumbnail', '--write-info-json', '--print-json'];

        let archive_dir = null;
        let archive_path = null;

        if (useArchive) {
            if (sub.archive) {
                archive_dir = sub.archive;
                archive_path = path.join(archive_dir, 'archive.txt')
            }
            downloadConfig.push('--download-archive', archive_path);
        }

        // if streaming only mode, just get the list of videos
        if (sub.streamingOnly) {
            downloadConfig = ['-f', 'best', '--dump-json'];
        }

        if (sub.timerange) {
            downloadConfig.push('--dateafter', sub.timerange);
        }

        // get videos 
        logger.verbose('Subscribe: getting videos for subscription ' + sub.name);
        youtubedl.exec(sub.url, downloadConfig, {}, function(err, output) {
            if (err) {
                logger.error(err.stderr);
                resolve(false);
            } else if (output) {
                if (output.length === 0 || (output.length === 1 && output[0] === '')) {
                    logger.verbose('No additional videos to download for ' + sub.name);
                    resolve(true);
                }
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

                    if (sub.streamingOnly) {
                        if (i === 0) {
                            sub_db.assign({videos: []}).write();
                        }

                        // remove unnecessary info
                        output_json.formats = null;

                        // add to db
                        sub_db.get('videos').push(output_json).write();
                    }

                    // TODO: Potentially store downloaded files in db?
        
                }
                resolve(true);
            }
        });
    });
}

function getAllSubscriptions() {
    const subscriptions = db.get('subscriptions').value();
    return subscriptions;
}

function getSubscription(subID) {
    return db.get('subscriptions').find({id: subID}).value();
}

function subExists(subID) {
    return !!db.get('subscriptions').find({id: subID}).value();
}

// helper functions

function getAppendedBasePath(sub, base_path) {
    return base_path + (sub.isPlaylist ? 'playlists/' : 'channels/') + sub.name;
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

function removeIDFromArchive(archive_path, id) {
    let data = fs.readFileSync(archive_path, {encoding: 'utf-8'});
    if (!data) {
        logger.error('Archive could not be found.');
        return;
    }

    let dataArray = data.split('\n'); // convert file data in an array
    const searchKeyword = id; // we are looking for a line, contains, key word id in the file
    let lastIndex = -1; // let say, we have not found the keyword

    for (let index=0; index<dataArray.length; index++) {
        if (dataArray[index].includes(searchKeyword)) { // check if a line contains the id keyword
            lastIndex = index; // found a line includes a id keyword
            break; 
        }
    }

    const line = dataArray.splice(lastIndex, 1); // remove the keyword id from the data Array

    // UPDATE FILE WITH NEW DATA
    const updatedData = dataArray.join('\n');
    fs.writeFileSync(archive_path, updatedData);
    if (line) return line;
    if (err) throw err;
}

module.exports = {
    getSubscription        : getSubscription,
    getAllSubscriptions    : getAllSubscriptions,
    subscribe              : subscribe,
    unsubscribe            : unsubscribe,
    deleteSubscriptionFile : deleteSubscriptionFile,
    getVideosForSub        : getVideosForSub,
    removeIDFromArchive    : removeIDFromArchive,
    setLogger              : setLogger,
    initialize             : initialize
}
