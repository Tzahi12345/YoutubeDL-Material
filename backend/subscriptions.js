const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')

var fs = require('fs');
const { uuid } = require('uuidv4');
var path = require('path');

var youtubedl = require('youtube-dl');
const config_api = require('./config');

const adapter = new FileSync('db.json');
const db = low(adapter)

let debugMode = process.env.YTDL_MODE === 'debug';

async function subscribe(sub) {
    const result_obj = {
        success: false,
        error: ''
    };
    return new Promise(async resolve => {
        // sub should just have url and name. here we will get isPlaylist and path
        sub.isPlaylist = sub.url.includes('playlist');

        if (db.get('subscriptions').find({url: sub.url}).value()) {
            console.log('Sub already exists');
            result_obj.error = 'Subcription with URL ' + sub.url + ' already exists!';
            resolve(result_obj);
            return;
        }

        // add sub to db
        db.get('subscriptions').push(sub).write();

        await getVideosForSub(sub);
        result_obj.success = true;
        result_obj.sub = sub;
        resolve(result_obj);
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

async function getVideosForSub(sub) {
    return new Promise(resolve => {
        const basePath = config_api.getConfigItem('ytdl_subscriptions_base_path');
        const useArchive = config_api.getConfigItem('ytdl_subscriptions_use_youtubedl_archive');

        const appendedBasePath = basePath + (sub.isPlaylist ? 'playlists/%(playlist_title)s' : 'channels/%(uploader)s');

        let downloadConfig = ['-o', appendedBasePath + '/%(title)s.mp4', '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4', '-ciw', '--write-annotations', '--write-thumbnail', '--write-info-json', '--print-json'];

        if (sub.timerange) {
            downloadConfig.push('--dateafter', sub.timerange);
        }

        let archive_dir = null;
        let archive_path = null;
        let usingTempArchive = false;

        if (useArchive) {
            if (sub.archive) {
                archive_dir = sub.archive;
                archive_path = path.join(archive_dir, 'archive.txt')
            } else {
                usingTempArchive = true;

                // set temporary archive
                archive_dir = basePath + 'archives/' + sub.id;
                archive_path = path.join(archive_dir, sub.id + '.txt');

                // create temporary dir and archive txt
                if (!fs.existsSync(archive_dir)) {
                    fs.mkdirSync(archive_dir);
                    fs.closeSync(fs.openSync(archive_path, 'w'));
                }
            }
            downloadConfig.push('--download-archive', archive_path);
        }

        // get videos 
        youtubedl.exec(sub.url, downloadConfig, {}, function(err, output) {
            if (debugMode) {
                console.log('Subscribe: got videos for subscription ' + sub.name);
            }
            if (err) {
                console.log(err.stderr);
                resolve(false);
            } else if (output) {
                if (output.length === 0) {
                    if (debugMode) console.log('No additional videos to download for ' + sub.name);
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

                    if (!sub.name && output_json) {
                        sub.name = sub.isPlaylist ? output_json.playlist_title : output_json.uploader;
                        // if it's now valid, update
                        if (sub.name) {
                            db.get('subscriptions').find({id: sub.id}).assign({name: sub.name}).write();
                        }
                    }

                    if (usingTempArchive && !sub.archive && sub.name) {
                        let new_archive_dir = basePath + 'archives/' + sub.name;

                        // TODO: clean up, code looks ugly
                        if (fs.existsSync(new_archive_dir)) {
                            if (fs.existsSync(new_archive_dir + '/archive.txt')) {
                                console.log('INFO: Archive file already exists. Rewriting archive.');
                                fs.unlinkSync(new_archive_dir + '/archive.txt')
                            }
                        } else {
                            // creates archive directory for subscription
                            fs.mkdirSync(new_archive_dir);
                        }

                        // moves archive
                        fs.copyFileSync(archive_path, new_archive_dir + '/archive.txt');

                        // updates subscription
                        sub.archive = new_archive_dir;
                        db.get('subscriptions').find({id: sub.id}).assign({archive: new_archive_dir}).write();

                        // remove temporary archive directory
                        fs.unlinkSync(archive_path);
                        fs.rmdirSync(archive_dir);
                    }
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

module.exports = {
    getSubscription    : getSubscription,
    getAllSubscriptions: getAllSubscriptions,
    subscribe          : subscribe,
    unsubscribe        : unsubscribe,
    getVideosForSub    : getVideosForSub
}
