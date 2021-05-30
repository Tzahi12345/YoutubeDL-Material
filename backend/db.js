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

exports.initialize = (input_db, input_users_db, input_logger) => {
    setDB(input_db, input_users_db);
    setLogger(input_logger);
}

exports.registerFileDB = (file_path, type, multiUserMode = null, sub = null, customPath = null, category = null, cropFileSettings = null) => {
    let db_path = null;
    const file_id = utils.removeFileExtension(file_path);
    const file_object = generateFileObject(file_id, type, customPath || multiUserMode && multiUserMode.file_path, sub);
    if (!file_object) {
        logger.error(`Could not find associated JSON file for ${type} file ${file_id}`);
        return false;
    }

    utils.fixVideoMetadataPerms(file_id, type, multiUserMode && multiUserMode.file_path);

    // add thumbnail path
    file_object['thumbnailPath'] = utils.getDownloadedThumbnail(file_id, type, customPath || multiUserMode && multiUserMode.file_path);

    // if category exists, only include essential info
    if (category) file_object['category'] = {name: category['name'], uid: category['uid']};

    // modify duration
    if (cropFileSettings) {
        file_object['duration'] = (cropFileSettings.cropFileEnd || file_object.duration) - cropFileSettings.cropFileStart;
    }

    if (!sub) {
        if (multiUserMode) {
            const user_uid = multiUserMode.user;
            db_path = users_db.get('users').find({uid: user_uid}).get(`files`);
        } else {
            db_path = db.get(`files`);
        }
    } else {
        if (multiUserMode) {
            const user_uid = multiUserMode.user;
            db_path = users_db.get('users').find({uid: user_uid}).get('subscriptions').find({id: sub.id}).get('videos');
        } else {
            db_path = db.get('subscriptions').find({id: sub.id}).get('videos');
        }
    }

    const file_obj = registerFileDBManual(db_path, file_object);

    // remove metadata JSON if needed
    if (!config_api.getConfigItem('ytdl_include_metadata')) {
        utils.deleteJSONFile(file_id, type, multiUserMode && multiUserMode.file_path)
    }

    return file_obj;
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
    return file_object;
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
    var description = jsonobj.description;
    var file_obj = new utils.File(id, title, thumbnail, isaudio, duration, url, uploader, size, file_path, upload_date, description, jsonobj.view_count, jsonobj.height, jsonobj.abr);
    return file_obj;
}

function getAppendedBasePathSub(sub, base_path) {
    return path.join(base_path, (sub.isPlaylist ? 'playlists/' : 'channels/'), sub.name);
}

exports.getFileDirectoriesAndDBs = () => {
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
                dbPath: users_db.get('users').find({uid: user.uid}).get('files'),
                type: 'audio'
            });

            // add user's video dir to check list
            dirs_to_check.push({
                basePath: path.join(usersFileFolder, user.uid, 'video'),
                dbPath: users_db.get('users').find({uid: user.uid}).get('files'),
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
            dbPath: db.get('files'),
            type: 'audio'
        });

        // add video dir to check list
        dirs_to_check.push({
            basePath: videoFolderPath,
            dbPath: db.get('files'),
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

    return dirs_to_check;
}

exports.importUnregisteredFiles = async () => {
    const dirs_to_check = exports.getFileDirectoriesAndDBs();

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

exports.preimportUnregisteredSubscriptionFile = async (sub, appendedBasePath) => {
    const preimported_file_paths = [];

    let dbPath = null;
    if (sub.user_uid)
        dbPath = users_db.get('users').find({uid: sub.user_uid}).get('subscriptions').find({id: sub.id}).get('videos');
    else
        dbPath = db.get('subscriptions').find({id: sub.id}).get('videos');

    const files = await utils.getDownloadedFilesByType(appendedBasePath, sub.type);
    files.forEach(file => {
        // check if file exists in db, if not add it
        const file_is_registered = !!(dbPath.find({id: file.id}).value())
        if (!file_is_registered) {
            // add additional info
            registerFileDBManual(dbPath, file);
            preimported_file_paths.push(file['path']);
            logger.verbose(`Preemptively added subscription file to the database: ${file.id}`);
        }
    });
    return preimported_file_paths;
}

exports.createPlaylist = async (playlist_name, uids, type, thumbnail_url, user_uid = null) => {
    let new_playlist = {
        name: playlist_name,
        uids: uids,
        id: uuid(),
        thumbnailURL: thumbnail_url,
        type: type,
        registered: Date.now(),
    };

    const duration = await exports.calculatePlaylistDuration(new_playlist, user_uid);
    new_playlist.duration = duration;
    
    if (user_uid) {
        users_db.get('users').find({uid: user_uid}).get(`playlists`).push(new_playlist).write();
    } else {
        db.get(`playlists`)
            .push(new_playlist)
            .write();
    }

    return new_playlist;
}

exports.getPlaylist = async (playlist_id, user_uid = null, require_sharing = false) => {
    let playlist = null
    if (user_uid) {
        playlist = users_db.get('users').find({uid: user_uid}).get(`playlists`).find({id: playlist_id}).value();
    } else {
        playlist = db.get(`playlists`).find({id: playlist_id}).value();
    }

    if (!playlist) {
        playlist = db.get('categories').find({uid: playlist_id}).value();
        if (playlist) {
            // category found
            const files = await exports.getFiles(user_uid);
            utils.addUIDsToCategory(playlist, files);
        }
    }

    // converts playlists to new UID-based schema
    if (playlist && playlist['fileNames'] && !playlist['uids']) {
        playlist['uids'] = [];
        logger.verbose(`Converting playlist ${playlist['name']} to new UID-based schema.`);
        for (let i = 0; i < playlist['fileNames'].length; i++) {
            const fileName = playlist['fileNames'][i];
            const uid = exports.getVideoUIDByID(fileName, user_uid);
            if (uid) playlist['uids'].push(uid);
            else logger.warn(`Failed to convert file with name ${fileName} to its UID while converting playlist ${playlist['name']} to the new UID-based schema. The original file is likely missing/deleted and it will be skipped.`);
        }
        exports.updatePlaylist(playlist, user_uid);
    }

    // prevent unauthorized users from accessing the file info
    if (require_sharing && !playlist['sharingEnabled']) return null;

    return playlist;
}

exports.updatePlaylist = async (playlist, user_uid = null) => {
    let playlistID = playlist.id;

    const duration = await exports.calculatePlaylistDuration(playlist, user_uid);
    playlist.duration = duration;

    let db_loc = null;
    if (user_uid) {
        db_loc = users_db.get('users').find({uid: user_uid}).get(`playlists`).find({id: playlistID});
    } else {
        db_loc = db.get(`playlists`).find({id: playlistID});
    }
    db_loc.assign(playlist).write();
    return true;
}

exports.calculatePlaylistDuration = async (playlist, uuid, playlist_file_objs = null) => {
    if (!playlist_file_objs) {
        playlist_file_objs = [];
        for (let i = 0; i < playlist['uids'].length; i++) {
            const uid = playlist['uids'][i];
            const file_obj = await exports.getVideo(uid, uuid);
            if (file_obj) playlist_file_objs.push(file_obj);
        }
    }

    return playlist_file_objs.reduce((a, b) => a + utils.durationStringToNumber(b.duration), 0);
}

exports.deleteFile = async (uid, uuid = null, blacklistMode = false) => {
    const file_obj = await exports.getVideo(uid, uuid);
    const type = file_obj.isAudio ? 'audio' : 'video';
    const folderPath = path.dirname(file_obj.path);
    const ext = type === 'audio' ? 'mp3' : 'mp4';
    const name = file_obj.id;
    const filePathNoExtension = utils.removeFileExtension(file_obj.path);

    var jsonPath = `${file_obj.path}.info.json`;
    var altJSONPath = `${filePathNoExtension}.info.json`;
    var thumbnailPath = `${filePathNoExtension}.webp`;
    var altThumbnailPath = `${filePathNoExtension}.jpg`;

    jsonPath = path.join(__dirname, jsonPath);
    altJSONPath = path.join(__dirname, altJSONPath);

    let jsonExists = await fs.pathExists(jsonPath);
    let thumbnailExists = await fs.pathExists(thumbnailPath);

    if (!jsonExists) {
        if (await fs.pathExists(altJSONPath)) {
            jsonExists = true;
            jsonPath = altJSONPath;
        }
    }

    if (!thumbnailExists) {
        if (await fs.pathExists(altThumbnailPath)) {
            thumbnailExists = true;
            thumbnailPath = altThumbnailPath;
        }
    }

    let fileExists = await fs.pathExists(file_obj.path);

    if (config_api.descriptors[uid]) {
        try {
            for (let i = 0; i < config_api.descriptors[uid].length; i++) {
                config_api.descriptors[uid][i].destroy();
            }
        } catch(e) {

        }
    }

    let useYoutubeDLArchive = config_api.getConfigItem('ytdl_use_youtubedl_archive');
    if (useYoutubeDLArchive) {
        const archive_path = uuid ? path.join(usersFileFolder, uuid, 'archives', `archive_${type}.txt`) : path.join('appdata', 'archives', `archive_${type}.txt`);

        // get ID from JSON

        var jsonobj = await (type === 'audio' ? utils.getJSONMp3(name, folderPath) : utils.getJSONMp4(name, folderPath));
        let id = null;
        if (jsonobj) id = jsonobj.id;

        // use subscriptions API to remove video from the archive file, and write it to the blacklist
        if (await fs.pathExists(archive_path)) {
            const line = id ? await utils.removeIDFromArchive(archive_path, id) : null;
            if (blacklistMode && line) await writeToBlacklist(type, line);
        } else {
            logger.info('Could not find archive file for audio files. Creating...');
            await fs.close(await fs.open(archive_path, 'w'));
        }
    }

    if (jsonExists) await fs.unlink(jsonPath);
    if (thumbnailExists) await fs.unlink(thumbnailPath);

    const base_db_path = uuid ? users_db.get('users').find({uid: uuid}) : db;
    base_db_path.get('files').remove({uid: uid}).write();

    if (fileExists) {
        await fs.unlink(file_obj.path);
        if (await fs.pathExists(jsonPath) || await fs.pathExists(file_obj.path)) {
            return false;
        } else {
            return true;
        }
    } else {
        // TODO: tell user that the file didn't exist
        return true;
    }
}

// Video ID is basically just the file name without the base path and file extension - this method helps us get away from that
exports.getVideoUIDByID = (file_id, uuid = null) => {
    const base_db_path = uuid ? users_db.get('users').find({uid: uuid}) : db;
    const file_obj = base_db_path.get('files').find({id: file_id}).value();
    return file_obj ? file_obj['uid'] : null;
}

exports.getVideo = async (file_uid, uuid = null, sub_id = null) => {
    const base_db_path = uuid ? users_db.get('users').find({uid: uuid}) : db;
    const sub_db_path = sub_id ? base_db_path.get('subscriptions').find({id: sub_id}).get('videos') : base_db_path.get('files');
    return sub_db_path.find({uid: file_uid}).value();
}

exports.getFiles = async (uuid = null) => {
    const base_db_path = uuid ? users_db.get('users').find({uid: uuid}) : db;
    return base_db_path.get('files').value();
}

exports.setVideoProperty = async (file_uid, assignment_obj, uuid, sub_id) => {
    const base_db_path = uuid ? users_db.get('users').find({uid: uuid}) : db;
    const sub_db_path = sub_id ? base_db_path.get('subscriptions').find({id: sub_id}).get('videos') : base_db_path.get('files');
    const file_db_path = sub_db_path.find({uid: file_uid});
    if (!(file_db_path.value())) {
        logger.error(`Failed to find file with uid ${file_uid}`);
    }
    sub_db_path.find({uid: file_uid}).assign(assignment_obj).write();
}
