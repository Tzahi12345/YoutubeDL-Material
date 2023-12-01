const fs = require('fs-extra')
const path = require('path')
const { v4: uuid } = require('uuid');

const config_api = require('./config');
const db_api = require('./db');
const archive_api = require('./archive');
const utils = require('./utils')
const logger = require('./logger');

exports.registerFileDB = async (file_path, type, user_uid = null, category = null, sub_id = null, cropFileSettings = null, file_object = null) => {
    if (!file_object) file_object = generateFileObject(file_path, type);
    if (!file_object) {
        logger.error(`Could not find associated JSON file for ${type} file ${file_path}`);
        return false;
    }

    utils.fixVideoMetadataPerms(file_path, type);

    // add thumbnail path
    file_object['thumbnailPath'] = utils.getDownloadedThumbnail(file_path);

    // if category exists, only include essential info
    if (category) file_object['category'] = {name: category['name'], uid: category['uid']};

    // modify duration
    if (cropFileSettings) {
        file_object['duration'] = (cropFileSettings.cropFileEnd || file_object.duration) - cropFileSettings.cropFileStart;
    }

    if (user_uid) file_object['user_uid'] = user_uid;
    if (sub_id) file_object['sub_id'] = sub_id;

    const file_obj = await registerFileDBManual(file_object);

    // remove metadata JSON if needed
    if (!config_api.getConfigItem('ytdl_include_metadata')) {
        utils.deleteJSONFile(file_path, type)
    }

    return file_obj;
}

async function registerFileDBManual(file_object) {
    // add additional info
    file_object['uid'] = uuid();
    file_object['registered'] = Date.now();
    const path_object = path.parse(file_object['path']);
    file_object['path'] = path.format(path_object);

    await db_api.insertRecordIntoTable('files', file_object, {path: file_object['path']})

    return file_object;
}

function generateFileObject(file_path, type) {
    const jsonobj = utils.getJSON(file_path, type);
    if (!jsonobj) {
        return null;
    } else if (!jsonobj['_filename']) {
        logger.error(`Failed to get filename from info JSON! File ${jsonobj['title']} could not be added.`);
        return null;
    }
    const true_file_path = utils.getTrueFileName(jsonobj['_filename'], type);
    // console.
    const stats = fs.statSync(true_file_path);

    const file_id = utils.removeFileExtension(path.basename(file_path));
    const title = jsonobj.title;
    const url = jsonobj.webpage_url;
    const uploader = jsonobj.uploader;
    const upload_date = utils.formatDateString(jsonobj.upload_date);

    const size = stats.size;

    const thumbnail = jsonobj.thumbnail;
    const duration = jsonobj.duration;
    const isaudio = type === 'audio';
    const description = jsonobj.description;
    const file_obj = new utils.File(file_id, title, thumbnail, isaudio, duration, url, uploader, size, true_file_path, upload_date, description, jsonobj.view_count, jsonobj.height, jsonobj.abr);
    return file_obj;
}

exports.importUnregisteredFiles = async () => {
    const imported_files = [];
    const dirs_to_check = await db_api.getFileDirectoriesAndDBs();

    // run through check list and check each file to see if it's missing from the db
    for (let i = 0; i < dirs_to_check.length; i++) {
        const dir_to_check = dirs_to_check[i];
        // recursively get all files in dir's path
        const files = await utils.getDownloadedFilesByType(dir_to_check.basePath, dir_to_check.type);

        for (let j = 0; j < files.length; j++) {
            const file = files[j];

            // check if file exists in db, if not add it
            const files_with_same_url = await db_api.getRecords('files', {url: file.url, sub_id: dir_to_check.sub_id});
            const file_is_registered = !!(files_with_same_url.find(file_with_same_url => path.resolve(file_with_same_url.path) === path.resolve(file.path)));
            if (!file_is_registered) {
                // add additional info
                const file_obj = await exports.registerFileDB(file['path'], dir_to_check.type, dir_to_check.user_uid, null, dir_to_check.sub_id, null);
                if (file_obj) {
                    imported_files.push(file_obj['uid']);
                    logger.verbose(`Added discovered file to the database: ${file.id}`);
                } else {
                    logger.error(`Failed to import ${file['path']} automatically.`);
                }
            }
        }
    }
    return imported_files;
}

exports.addMetadataPropertyToDB = async (property_key) => {
    try {
        const dirs_to_check = await db_api.getFileDirectoriesAndDBs();
        const update_obj = {};
        for (let i = 0; i < dirs_to_check.length; i++) {
            const dir_to_check = dirs_to_check[i];

            // recursively get all files in dir's path
            const files = await utils.getDownloadedFilesByType(dir_to_check.basePath, dir_to_check.type, true);
            for (let j = 0; j < files.length; j++) {
                const file = files[j];
                if (file[property_key]) {
                    update_obj[file.uid] = {[property_key]: file[property_key]};
                }
            }
        }

        return await db_api.bulkUpdateRecordsByKey('files', 'uid', update_obj);
    } catch(err) {
        logger.error(err);
        return false;
    }
}

exports.createPlaylist = async (playlist_name, uids, user_uid = null) => {
    const first_video = await exports.getVideo(uids[0]);
    const thumbnailToUse = first_video['thumbnailURL'];
    
    let new_playlist = {
        name: playlist_name,
        uids: uids,
        id: uuid(),
        thumbnailURL: thumbnailToUse,
        registered: Date.now(),
        randomize_order: false
    };

    new_playlist.user_uid = user_uid ? user_uid : undefined;

    await db_api.insertRecordIntoTable('playlists', new_playlist);
    
    const duration = await exports.calculatePlaylistDuration(new_playlist);
    await db_api.updateRecord('playlists', {id: new_playlist.id}, {duration: duration});

    return new_playlist;
}

exports.getPlaylist = async (playlist_id, user_uid = null, require_sharing = false) => {
    let playlist = await db_api.getRecord('playlists', {id: playlist_id});

    if (!playlist) {
        playlist = await db_api.getRecord('categories', {uid: playlist_id});
        if (playlist) {
            const uids = (await db_api.getRecords('files', {'category.uid': playlist_id})).map(file => file.uid);
            playlist['uids'] = uids;
            playlist['auto'] = true;
        }
    }

    // converts playlists to new UID-based schema
    if (playlist && playlist['fileNames'] && !playlist['uids']) {
        playlist['uids'] = [];
        logger.verbose(`Converting playlist ${playlist['name']} to new UID-based schema.`);
        for (let i = 0; i < playlist['fileNames'].length; i++) {
            const fileName = playlist['fileNames'][i];
            const uid = await exports.getVideoUIDByID(fileName, user_uid);
            if (uid) playlist['uids'].push(uid);
            else logger.warn(`Failed to convert file with name ${fileName} to its UID while converting playlist ${playlist['name']} to the new UID-based schema. The original file is likely missing/deleted and it will be skipped.`);
        }
        exports.updatePlaylist(playlist, user_uid);
    }

    // prevent unauthorized users from accessing the file info
    if (require_sharing && !playlist['sharingEnabled']) return null;

    return playlist;
}

exports.updatePlaylist = async (playlist) => {
    let playlistID = playlist.id;

    const duration = await exports.calculatePlaylistDuration(playlist);
    playlist.duration = duration;

    return await db_api.updateRecord('playlists', {id: playlistID}, playlist);
}

exports.setPlaylistProperty = async (playlist_id, assignment_obj, user_uid = null) => {
    let success = await db_api.updateRecord('playlists', {id: playlist_id}, assignment_obj);

    if (!success) {
        success = await db_api.updateRecord('categories', {uid: playlist_id}, assignment_obj);
    }

    if (!success) {
        logger.error(`Could not find playlist or category with ID ${playlist_id}`);
    }

    return success;
}

exports.calculatePlaylistDuration = async (playlist, playlist_file_objs = null) => {
    if (!playlist_file_objs) {
        playlist_file_objs = [];
        for (let i = 0; i < playlist['uids'].length; i++) {
            const uid = playlist['uids'][i];
            const file_obj = await exports.getVideo(uid);
            if (file_obj) playlist_file_objs.push(file_obj);
        }
    }

    return playlist_file_objs.reduce((a, b) => a + utils.durationStringToNumber(b.duration), 0);
}

exports.deleteFile = async (uid, blacklistMode = false) => {
    const file_obj = await exports.getVideo(uid);
    const type = file_obj.isAudio ? 'audio' : 'video';
    const folderPath = path.dirname(file_obj.path);
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
    if (useYoutubeDLArchive || file_obj.sub_id) {
        // get id/extractor from JSON

        const info_json = await (type === 'audio' ? utils.getJSONMp3(name, folderPath) : utils.getJSONMp4(name, folderPath));
        let retrievedID = null;
        let retrievedExtractor = null;
        if (info_json) {
            retrievedID = info_json['id'];
            retrievedExtractor = info_json['extractor'];
        }

        // Remove file ID from the archive file, and write it to the blacklist (if enabled)
        if (!blacklistMode) {
            await archive_api.removeFromArchive(retrievedExtractor, retrievedID, type, file_obj.user_uid, file_obj.sub_id)
        } else {
            const exists_in_archive = await archive_api.existsInArchive(retrievedExtractor, retrievedID, type, file_obj.user_uid, file_obj.sub_id);
            if (!exists_in_archive) {
                await archive_api.addToArchive(retrievedExtractor, retrievedID, type, file_obj.title, file_obj.user_uid, file_obj.sub_id);
            }
        }
    }

    if (jsonExists) await fs.unlink(jsonPath);
    if (thumbnailExists) await fs.unlink(thumbnailPath);

    await db_api.removeRecord('files', {uid: uid});

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
exports.getVideoUIDByID = async (file_id, uuid = null) => {
    const file_obj = await db_api.getRecord('files', {id: file_id});
    return file_obj ? file_obj['uid'] : null;
}

exports.getVideo = async (file_uid) => {
    return await db_api.getRecord('files', {uid: file_uid});
}

exports.getAllFiles = async (sort, range, text_search, file_type_filter, favorite_filter, sub_id, uuid) => {
    const filter_obj = {user_uid: uuid};
    const regex = true;
    if (text_search) {
        if (regex) {
            filter_obj['title'] = {$regex: `.*${text_search}.*`, $options: 'i'};
        } else {
            filter_obj['$text'] = { $search: utils.createEdgeNGrams(text_search) };
        }
    }

    if (favorite_filter) {
        filter_obj['favorite'] = true;
    }

    if (sub_id) {
        filter_obj['sub_id'] = sub_id;
    }

    if (file_type_filter === 'audio_only') filter_obj['isAudio'] = true;
    else if (file_type_filter === 'video_only') filter_obj['isAudio'] = false;
    
    const files = JSON.parse(JSON.stringify(await db_api.getRecords('files', filter_obj, false, sort, range, text_search)));
    const file_count = await db_api.getRecords('files', filter_obj, true);

    return {files, file_count};
}
