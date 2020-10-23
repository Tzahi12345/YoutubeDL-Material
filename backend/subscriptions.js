const FileSync = require('lowdb/adapters/FileSync')

var fs = require('fs-extra');
const { uuid } = require('uuidv4');
var path = require('path');

var youtubedl = require('youtube-dl');
const config_api = require('./config');
var utils = require('./utils')

const debugMode = process.env.YTDL_MODE === 'debug';

var logger = null;
var db = null;
var users_db = null;
var db_api = null;

function setDB(input_db, input_users_db, input_db_api) { db = input_db; users_db = input_users_db; db_api = input_db_api }
function setLogger(input_logger) { logger = input_logger; }

function initialize(input_db, input_users_db, input_logger, input_db_api) {
    setDB(input_db, input_users_db, input_db_api);
    setLogger(input_logger);
}

async function subscribe(sub, user_uid = null) {
    const result_obj = {
        success: false,
        error: ''
    };
    return new Promise(async resolve => {
        // sub should just have url and name. here we will get isPlaylist and path
        sub.isPlaylist = sub.url.includes('playlist');
        sub.videos = [];

        let url_exists = false;

        if (user_uid)
            url_exists = !!users_db.get('users').find({uid: user_uid}).get('subscriptions').find({url: sub.url}).value()
        else
            url_exists = !!db.get('subscriptions').find({url: sub.url}).value();

        if (!sub.name && url_exists) {
            logger.error(`Sub with the same URL "${sub.url}" already exists -- please provide a custom name for this new subscription.`);
            result_obj.error = 'Subcription with URL ' + sub.url + ' already exists! Custom name is required.';
            resolve(result_obj);
            return;
        }

        // add sub to db
        let sub_db = null;
        if (user_uid) {
            users_db.get('users').find({uid: user_uid}).get('subscriptions').push(sub).write();
            sub_db = users_db.get('users').find({uid: user_uid}).get('subscriptions').find({id: sub.id});
        } else {
            db.get('subscriptions').push(sub).write();
            sub_db = db.get('subscriptions').find({id: sub.id});
        }
        let success = await getSubscriptionInfo(sub, user_uid);

        if (success) {
            sub = sub_db.value();
            getVideosForSub(sub, user_uid);
        } else {
            logger.error('Subscribe: Failed to get subscription info. Subscribe failed.')
        };

        result_obj.success = success;
        result_obj.sub = sub;
        resolve(result_obj);
    });

}

async function getSubscriptionInfo(sub, user_uid = null) {
    let basePath = null;
    if (user_uid)
        basePath = path.join(config_api.getConfigItem('ytdl_users_base_path'), user_uid, 'subscriptions');
    else
        basePath = config_api.getConfigItem('ytdl_subscriptions_base_path');

    // get videos
    let downloadConfig = ['--dump-json', '--playlist-end', '1'];
    let useCookies = config_api.getConfigItem('ytdl_use_cookies');
    if (useCookies) {
        if (await fs.pathExists(path.join(__dirname, 'appdata', 'cookies.txt'))) {
            downloadConfig.push('--cookies', path.join('appdata', 'cookies.txt'));
        } else {
            logger.warn('Cookies file could not be found. You can either upload one, or disable \'use cookies\' in the Advanced tab in the settings.');
        }
    }

    return new Promise(resolve => {
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
                            if (user_uid)
                                users_db.get('users').find({uid: user_uid}).get('subscriptions').find({id: sub.id}).assign({name: sub.name}).write();
                            else
                                db.get('subscriptions').find({id: sub.id}).assign({name: sub.name}).write();
                        }
                    }

                    const useArchive = config_api.getConfigItem('ytdl_use_youtubedl_archive');
                    if (useArchive && !sub.archive) {
                        // must create the archive
                        const archive_dir = path.join(__dirname, basePath, 'archives', sub.name);
                        const archive_path = path.join(archive_dir, 'archive.txt');

                        // creates archive directory and text file if it doesn't exist
                        fs.ensureDirSync(archive_dir);
                        fs.ensureFileSync(archive_path);

                        // updates subscription
                        sub.archive = archive_dir;
                        if (user_uid)
                            users_db.get('users').find({uid: user_uid}).get('subscriptions').find({id: sub.id}).assign({archive: archive_dir}).write();
                        else
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

async function unsubscribe(sub, deleteMode, user_uid = null) {
    let basePath = null;
    if (user_uid)
        basePath = path.join(config_api.getConfigItem('ytdl_users_base_path'), user_uid, 'subscriptions');
    else
        basePath = config_api.getConfigItem('ytdl_subscriptions_base_path');
    let result_obj = { success: false, error: '' };

    let id = sub.id;
    if (user_uid)
        users_db.get('users').find({uid: user_uid}).get('subscriptions').remove({id: id}).write();
    else
        db.get('subscriptions').remove({id: id}).write();

    // failed subs have no name, on unsubscribe they shouldn't error
    if (!sub.name) {
        return;
    }

    const appendedBasePath = getAppendedBasePath(sub, basePath);
    if (deleteMode && (await fs.pathExists(appendedBasePath))) {
        if (sub.archive && (await fs.pathExists(sub.archive))) {
            const archive_file_path = path.join(sub.archive, 'archive.txt');
            // deletes archive if it exists
            if (await fs.pathExists(archive_file_path)) {
                await fs.unlink(archive_file_path);
            }
            await fs.rmdir(sub.archive);
        }
        await fs.remove(appendedBasePath);
    }
}

async function deleteSubscriptionFile(sub, file, deleteForever, file_uid = null, user_uid = null) {
    let basePath = null;
    let sub_db = null;
    if (user_uid) {
        basePath = path.join(config_api.getConfigItem('ytdl_users_base_path'), user_uid, 'subscriptions');
        sub_db = users_db.get('users').find({uid: user_uid}).get('subscriptions').find({id: sub.id});
    } else {
        basePath = config_api.getConfigItem('ytdl_subscriptions_base_path');
        sub_db = db.get('subscriptions').find({id: sub.id});
    }
    const useArchive = config_api.getConfigItem('ytdl_use_youtubedl_archive');
    const appendedBasePath = getAppendedBasePath(sub, basePath);
    const name = file;
    let retrievedID = null;
    sub_db.get('videos').remove({uid: file_uid}).write();

    let filePath = appendedBasePath;
    const ext = (sub.type && sub.type === 'audio') ? '.mp3' : '.mp4'
    var jsonPath = path.join(__dirname,filePath,name+'.info.json');
    var videoFilePath = path.join(__dirname,filePath,name+ext);
    var imageFilePath = path.join(__dirname,filePath,name+'.jpg');
    var altImageFilePath = path.join(__dirname,filePath,name+'.jpg');

    const [jsonExists, videoFileExists, imageFileExists, altImageFileExists] = await Promise.all([
        fs.pathExists(jsonPath),
        fs.pathExists(videoFilePath),
        fs.pathExists(imageFilePath),
        fs.pathExists(altImageFilePath),
    ]);

    if (jsonExists) {
        retrievedID = JSON.parse(await fs.readFile(jsonPath, 'utf8'))['id'];
        await fs.unlink(jsonPath);
    }

    if (imageFileExists) {
        await fs.unlink(imageFilePath);
    }

    if (altImageFileExists) {
        await fs.unlink(altImageFilePath);
    }

    if (videoFileExists) {
        await fs.unlink(videoFilePath);
        if ((await fs.pathExists(jsonPath)) || (await fs.pathExists(videoFilePath))) {
            return false;
        } else {
            // check if the user wants the video to be redownloaded (deleteForever === false)
            if (!deleteForever && useArchive && sub.archive && retrievedID) {
                const archive_path = path.join(sub.archive, 'archive.txt')
                // if archive exists, remove line with video ID
                if (await fs.pathExists(archive_path)) {
                    await removeIDFromArchive(archive_path, retrievedID);
                }
            }
            return true;
        }
    } else {
        // TODO: tell user that the file didn't exist
        return true;
    }
}

async function getVideosForSub(sub, user_uid = null) {
    if (!subExists(sub.id, user_uid)) {
        return false;
    }

    // get sub_db
    let sub_db = null;
    if (user_uid)
        sub_db = users_db.get('users').find({uid: user_uid}).get('subscriptions').find({id: sub.id});
    else
        sub_db = db.get('subscriptions').find({id: sub.id});

    // get basePath
    let basePath = null;
    if (user_uid)
        basePath = path.join(config_api.getConfigItem('ytdl_users_base_path'), user_uid, 'subscriptions');
    else
        basePath = config_api.getConfigItem('ytdl_subscriptions_base_path');

    const useArchive = config_api.getConfigItem('ytdl_use_youtubedl_archive');

    let appendedBasePath = null
    appendedBasePath = getAppendedBasePath(sub, basePath);

    let multiUserMode = null;
    if (user_uid) {
        multiUserMode = {
            user: user_uid,
            file_path: appendedBasePath
        }
    }

    const ext = (sub.type && sub.type === 'audio') ? '.mp3' : '.mp4'

    let fullOutput = `${appendedBasePath}/%(title)s.%(ext)s`;
    if (sub.custom_output) {
        fullOutput = `${appendedBasePath}/${sub.custom_output}.%(ext)s`;
    }

    let downloadConfig = ['-o', fullOutput, '-ciw', '--write-info-json', '--print-json'];

    let qualityPath = null;
    if (sub.type && sub.type === 'audio') {
        qualityPath = ['-f', 'bestaudio']
        qualityPath.push('-x');
        qualityPath.push('--audio-format', 'mp3');
    } else {
        qualityPath = ['-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4']
    }

    downloadConfig.push(...qualityPath)

    if (sub.custom_args) {
        customArgsArray = sub.custom_args.split(',,');
        if (customArgsArray.indexOf('-f') !== -1) {
            // if custom args has a custom quality, replce the original quality with that of custom args
            const original_output_index = downloadConfig.indexOf('-f');
            downloadConfig.splice(original_output_index, 2);
        }
        downloadConfig.push(...customArgsArray);
    }

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

    let useCookies = config_api.getConfigItem('ytdl_use_cookies');
    if (useCookies) {
        if (await fs.pathExists(path.join(__dirname, 'appdata', 'cookies.txt'))) {
            downloadConfig.push('--cookies', path.join('appdata', 'cookies.txt'));
        } else {
            logger.warn('Cookies file could not be found. You can either upload one, or disable \'use cookies\' in the Advanced tab in the settings.');
        }
    }

    if (config_api.getConfigItem('ytdl_include_thumbnail')) {
        downloadConfig.push('--write-thumbnail');
    }

    // get videos
    logger.verbose('Subscription: getting videos for subscription ' + sub.name);

    return new Promise(resolve => {
        youtubedl.exec(sub.url, downloadConfig, {}, function(err, output) {
            logger.verbose('Subscription: finished check for ' + sub.name);
            if (err && !output) {
                logger.error(err.stderr);
                if (err.stderr.includes('This video is unavailable')) {
                    logger.info('An error was encountered with at least one video, backup method will be used.')
                    try {
                        const outputs = err.stdout.split(/\r\n|\r|\n/);
                        for (let i = 0; i < outputs.length; i++) {
                            const output = JSON.parse(outputs[i]);
                            handleOutputJSON(sub, sub_db, output, i === 0, multiUserMode)
                            if (err.stderr.includes(output['id']) && archive_path) {
                                // we found a video that errored! add it to the archive to prevent future errors
                                fs.appendFileSync(archive_path, output['id']);
                            }
                        }
                    } catch(e) {
                        logger.error('Backup method failed. See error below:');
                        logger.error(e);
                    }
                }
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

                    const reset_videos = i === 0;
                    handleOutputJSON(sub, sub_db, output_json, multiUserMode, reset_videos);

                    // TODO: Potentially store downloaded files in db?

                }
                resolve(true);
            }
        });
    }, err => {
        logger.error(err);
    });
}

function handleOutputJSON(sub, sub_db, output_json, multiUserMode = null, reset_videos = false) {
    if (sub.streamingOnly) {
        if (reset_videos) {
            sub_db.assign({videos: []}).write();
        }

        // remove unnecessary info
        output_json.formats = null;

        // add to db
        sub_db.get('videos').push(output_json).write();
    } else {
        db_api.registerFileDB(path.basename(output_json['_filename']), sub.type, multiUserMode, sub);
    }
}

function getAllSubscriptions(user_uid = null) {
    if (user_uid)
        return users_db.get('users').find({uid: user_uid}).get('subscriptions').value();
    else
        return db.get('subscriptions').value();
}

function getSubscription(subID, user_uid = null) {
    if (user_uid)
        return users_db.get('users').find({uid: user_uid}).get('subscriptions').find({id: subID}).value();
    else
        return db.get('subscriptions').find({id: subID}).value();
}

function getSubscriptionByName(subName, user_uid = null) {
    if (user_uid)
        return users_db.get('users').find({uid: user_uid}).get('subscriptions').find({name: subName}).value();
    else
        return db.get('subscriptions').find({name: subName}).value();
}

function updateSubscription(sub, user_uid = null) {
    if (user_uid) {
        users_db.get('users').find({uid: user_uid}).get('subscriptions').find({id: sub.id}).assign(sub).write();
    } else {
        db.get('subscriptions').find({id: sub.id}).assign(sub).write();
    }
    return true;
}

function subExists(subID, user_uid = null) {
    if (user_uid)
        return !!users_db.get('users').find({uid: user_uid}).get('subscriptions').find({id: subID}).value();
    else
        return !!db.get('subscriptions').find({id: subID}).value();
}

// helper functions

function getAppendedBasePath(sub, base_path) {

    return path.join(base_path, (sub.isPlaylist ? 'playlists/' : 'channels/'), sub.name);
}

async function removeIDFromArchive(archive_path, id) {
    let data = await fs.readFile(archive_path, {encoding: 'utf-8'});
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
    await fs.writeFile(archive_path, updatedData);
    if (line) return line;
    if (err) throw err;
}

module.exports = {
    getSubscription        : getSubscription,
    getSubscriptionByName  : getSubscriptionByName,
    getAllSubscriptions    : getAllSubscriptions,
    updateSubscription     : updateSubscription,
    subscribe              : subscribe,
    unsubscribe            : unsubscribe,
    deleteSubscriptionFile : deleteSubscriptionFile,
    getVideosForSub        : getVideosForSub,
    removeIDFromArchive    : removeIDFromArchive,
    setLogger              : setLogger,
    initialize             : initialize
}
