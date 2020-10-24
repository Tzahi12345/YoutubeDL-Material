var fs = require('fs-extra')
var path = require('path')
var utils = require('./utils')
const { uuid } = require('uuidv4');
const config_api = require('./config');

var logger = null;
var db = null;
var users_db = null;
function setDB(input_db, input_users_db) { db = input_db; users_db = input_users_db }
function setLogger(input_logger) { logger = input_logger; }

function initialize(input_db, input_users_db, input_logger) {
    setDB(input_db, input_users_db);
    setLogger(input_logger);
}

function registerFileDB(file_path, type, multiUserMode = null, sub = null, customPath = null) {
    let db_path = null;
    const file_id = file_path.substring(0, file_path.length-4);
    const file_object = generateFileObject(file_id, type, customPath || multiUserMode && multiUserMode.file_path, sub);
    if (!file_object) {
        logger.error(`Could not find associated JSON file for ${type} file ${file_id}`);
        return false;
    }

    utils.fixVideoMetadataPerms(file_id, type, multiUserMode && multiUserMode.file_path);

    // add thumbnail path
    file_object['thumbnailPath'] = utils.getDownloadedThumbnail(file_id, type, customPath || multiUserMode && multiUserMode.file_path);

    if (!sub) {
        if (multiUserMode) {
            const user_uid = multiUserMode.user;
            db_path = users_db.get('users').find({uid: user_uid}).get(`files.${type}`);
        } else {
            db_path = db.get(`files.${type}`)
        }
    } else {
        if (multiUserMode) {
            const user_uid = multiUserMode.user;
            db_path = users_db.get('users').find({uid: user_uid}).get('subscriptions').find({id: sub.id}).get('videos');
        } else {
            db_path = db.get('subscriptions').find({id: sub.id}).get('videos');
        }
    }

    const file_uid = registerFileDBManual(db_path, file_object);

    // remove metadata JSON if needed
    if (!config_api.getConfigItem('ytdl_include_metadata')) {
        utils.deleteJSONFile(file_id, type, multiUserMode && multiUserMode.file_path)
    }

    return file_uid;
}

function registerFileDBManual(db_path, file_object) {
    // add additional info
    file_object['uid'] = uuid();
    file_object['registered'] = Date.now();
    path_object = path.parse(file_object['path']);
    file_object['path'] = path.format(path_object);

    // remove duplicate(s)
    db_path.remove({path: file_object['path']}).write();

    // add new file to db
    db_path.push(file_object).write();
    return file_object['uid'];
}

function generateFileObject(id, type, customPath = null, sub = null) {
    if (!customPath && sub) {
        customPath = getAppendedBasePathSub(sub, config_api.getConfigItem('ytdl_subscriptions_base_path'));
    }
    var jsonobj = (type === 'audio') ? utils.getJSONMp3(id, customPath, true) : utils.getJSONMp4(id, customPath, true);
    if (!jsonobj) {
        return null;
    }
    const ext = (type === 'audio') ? '.mp3' : '.mp4'
    const file_path = utils.getTrueFileName(jsonobj['_filename'], type); // path.join(type === 'audio' ? audioFolderPath : videoFolderPath, id + ext);
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

function updatePlaylist(playlist, user_uid) {
    let playlistID = playlist.id;
    let type = playlist.type;
    let db_loc = null;
    if (user_uid) {
        db_loc = users_db.get('users').find({uid: user_uid}).get(`playlists.${type}`).find({id: playlistID});
    } else {
        db_loc = db.get(`playlists.${type}`).find({id: playlistID});
    }
    db_loc.assign(playlist).write();
    return true;
}

function getAppendedBasePathSub(sub, base_path) {
    return path.join(base_path, (sub.isPlaylist ? 'playlists/' : 'channels/'), sub.name);
}

async function importUnregisteredFiles() {
    let dirs_to_check = [];
    let subscriptions_to_check = [];
    const subscriptions_base_path = config_api.getConfigItem('ytdl_subscriptions_base_path'); // only for single-user mode
    const multi_user_mode = config_api.getConfigItem('ytdl_multi_user_mode');
    const usersFileFolder = config_api.getConfigItem('ytdl_users_base_path');
    const subscriptions_enabled = config_api.getConfigItem('ytdl_allow_subscriptions');
    if (multi_user_mode) {
        let users = users_db.get('users').value();
        for (let i = 0; i < users.length; i++) {
            const user = users[i];

            if (subscriptions_enabled) subscriptions_to_check = subscriptions_to_check.concat(users[i]['subscriptions']);

            // add user's audio dir to check list
            dirs_to_check.push({
                basePath: path.join(usersFileFolder, user.uid, 'audio'),
                dbPath: users_db.get('users').find({uid: user.uid}).get('files.audio'),
                type: 'audio'
            });

            // add user's video dir to check list
            dirs_to_check.push({
                basePath: path.join(usersFileFolder, user.uid, 'video'),
                dbPath: users_db.get('users').find({uid: user.uid}).get('files.video'),
                type: 'video'
            });
        }
    } else {
        const audioFolderPath = config_api.getConfigItem('ytdl_audio_folder_path');
        const videoFolderPath = config_api.getConfigItem('ytdl_video_folder_path');
        const subscriptions = db.get('subscriptions').value();

        if (subscriptions_enabled && subscriptions) subscriptions_to_check = subscriptions_to_check.concat(subscriptions);

        // add audio dir to check list
        dirs_to_check.push({
            basePath: audioFolderPath,
            dbPath: db.get('files.audio'),
            type: 'audio'
        });

        // add video dir to check list
        dirs_to_check.push({
            basePath: videoFolderPath,
            dbPath: db.get('files.video'),
            type: 'video'
        });
    }

    // add subscriptions to check list
    for (let i = 0; i < subscriptions_to_check.length; i++) {
        let subscription_to_check = subscriptions_to_check[i];
        if (!subscription_to_check.name) {
            // TODO: Remove subscription as it'll never complete
            continue;
        }
        dirs_to_check.push({
            basePath: multi_user_mode ? path.join(usersFileFolder, subscription_to_check.user_uid, 'subscriptions', subscription_to_check.isPlaylist ? 'playlists/' : 'channels/', subscription_to_check.name)
                                      : path.join(subscriptions_base_path, subscription_to_check.isPlaylist ? 'playlists/' : 'channels/', subscription_to_check.name),
            dbPath: multi_user_mode ? users_db.get('users').find({uid: subscription_to_check.user_uid}).get('subscriptions').find({id: subscription_to_check.id}).get('videos')
                                    : db.get('subscriptions').find({id: subscription_to_check.id}).get('videos'),
            type: subscription_to_check.type
        });
    }

    // run through check list and check each file to see if it's missing from the db
    for (const dir_to_check of dirs_to_check) {
        // recursively get all files in dir's path
        const files = await utils.getDownloadedFilesByType(dir_to_check.basePath, dir_to_check.type);

        files.forEach(file => {
            // check if file exists in db, if not add it
            const file_is_registered = !!(dir_to_check.dbPath.find({id: file.id}).value())
            if (!file_is_registered) {
                // add additional info
                registerFileDBManual(dir_to_check.dbPath, file);
                logger.verbose(`Added discovered file to the database: ${file.id}`);
            }
        });
    }

}

module.exports = {
    initialize: initialize,
    registerFileDB: registerFileDB,
    updatePlaylist: updatePlaylist,
    importUnregisteredFiles: importUnregisteredFiles
}
