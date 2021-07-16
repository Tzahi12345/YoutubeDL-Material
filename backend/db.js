var fs = require('fs-extra')
var path = require('path')
var utils = require('./utils')
const { uuid } = require('uuidv4');
const config_api = require('./config');
const { MongoClient } = require("mongodb");

const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync');
const local_adapter = new FileSync('./appdata/local_db.json');
const local_db = low(local_adapter);

var logger = null;
var db = null;
var users_db = null;
var database = null;

const tables = ['files', 'playlists', 'categories', 'subscriptions', 'downloads', 'users', 'roles', 'test'];

const local_db_defaults = {}
tables.forEach(table => {local_db_defaults[table] = []});
local_db.defaults(local_db_defaults).write();

let using_local_db = config_api.getConfigItem('ytdl_use_local_db');

function setDB(input_db, input_users_db) {
    db = input_db; users_db = input_users_db;
    exports.db = input_db;
    exports.users_db = input_users_db
}

function setLogger(input_logger) {
    logger = input_logger;
}

exports.initialize = (input_db, input_users_db, input_logger) => {
    setDB(input_db, input_users_db);
    setLogger(input_logger);
}

exports.connectToDB = async (retries = 5, no_fallback = false) => {
    if (using_local_db) return;
    const success = await exports._connectToDB();
    if (success) return true;

    logger.warn(`MongoDB connection failed! Retrying ${retries} times...`);
    const retry_delay_ms = 2000;
    for (let i = 0; i < retries; i++) {
        const retry_succeeded = await exports._connectToDB();
        if (retry_succeeded) {
            logger.info(`Successfully connected to DB after ${i+1} attempt(s)`);
            return true;
        }

        if (i !== retries - 1) {
            logger.warn(`Retry ${i+1} failed, waiting ${retry_delay_ms}ms before trying again.`);
            await utils.wait(retry_delay_ms);
        } else {
            logger.warn(`Retry ${i+1} failed.`);
        }
    }
    if (no_fallback) {
        logger.error('Failed to connect to MongoDB. Verify your connection string is valid.');
        return;
    }
    using_local_db = true;
    config_api.setConfigItem('ytdl_use_local_db', true);
    logger.error('Failed to connect to MongoDB, using Local DB as a fallback. Make sure your MongoDB instance is accessible, or set Local DB as a default through the config.');
    return true;
}

exports._connectToDB = async () => {
    const uri = config_api.getConfigItem('ytdl_mongodb_connection_string'); // "mongodb://127.0.0.1:27017/?compressors=zlib&gssapiServiceName=mongodb";
    const client = new MongoClient(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    });

    try {
        await client.connect();
        database = client.db('ytdl_material');
        const existing_collections = (await database.listCollections({}, { nameOnly: true }).toArray()).map(collection => collection.name);

        const missing_tables = tables.filter(table => !(existing_collections.includes(table)));
        missing_tables.forEach(async table => {
            await database.createCollection(table);
        })
        return true;
    } catch(err) {
        logger.error(err);
        return false;
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}

exports.registerFileDB = async (file_path, type, multiUserMode = null, sub = null, customPath = null, category = null, cropFileSettings = null, file_object = null) => {
    let db_path = null;
    const file_id = utils.removeFileExtension(file_path);
    if (!file_object) file_object = generateFileObject(file_id, type, customPath || multiUserMode && multiUserMode.file_path, sub);
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

    if (multiUserMode) file_object['user_uid'] = multiUserMode.user;

    const file_obj = await registerFileDBManual(file_object);

    // remove metadata JSON if needed
    if (!config_api.getConfigItem('ytdl_include_metadata')) {
        utils.deleteJSONFile(file_id, type, multiUserMode && multiUserMode.file_path)
    }

    return file_obj;
}

exports.registerFileDB2 = async (file_path, type, user_uid = null, category = null, sub_id = null, cropFileSettings = null, file_object = null) => {
    if (!file_object) file_object = generateFileObject2(file_path, type);
    if (!file_object) {
        logger.error(`Could not find associated JSON file for ${type} file ${file_path}`);
        return false;
    }

    utils.fixVideoMetadataPerms2(file_path, type);

    // add thumbnail path
    file_object['thumbnailPath'] = utils.getDownloadedThumbnail2(file_path, type);

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
        utils.deleteJSONFile2(file_path, type)
    }

    return file_obj;
}

async function registerFileDBManual(file_object) {
    // add additional info
    file_object['uid'] = uuid();
    file_object['registered'] = Date.now();
    path_object = path.parse(file_object['path']);
    file_object['path'] = path.format(path_object);

    exports.insertRecordIntoTable('files', file_object, {path: file_object['path']})

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

function generateFileObject2(file_path, type) {
    var jsonobj = utils.getJSON(file_path, type);
    if (!jsonobj) {
        return null;
    }
    const ext = (type === 'audio') ? '.mp3' : '.mp4'
    const true_file_path = utils.getTrueFileName(jsonobj['_filename'], type);
    // console.
    var stats = fs.statSync(true_file_path);

    const file_id = utils.removeFileExtension(path.basename(file_path));
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
    var file_obj = new utils.File(file_id, title, thumbnail, isaudio, duration, url, uploader, size, true_file_path, upload_date, description, jsonobj.view_count, jsonobj.height, jsonobj.abr);
    return file_obj;
}

function getAppendedBasePathSub(sub, base_path) {
    return path.join(base_path, (sub.isPlaylist ? 'playlists/' : 'channels/'), sub.name);
}

exports.getFileDirectoriesAndDBs = async () => {
    let dirs_to_check = [];
    let subscriptions_to_check = [];
    const subscriptions_base_path = config_api.getConfigItem('ytdl_subscriptions_base_path'); // only for single-user mode
    const multi_user_mode = config_api.getConfigItem('ytdl_multi_user_mode');
    const usersFileFolder = config_api.getConfigItem('ytdl_users_base_path');
    const subscriptions_enabled = config_api.getConfigItem('ytdl_allow_subscriptions');
    if (multi_user_mode) {
        const users = await exports.getRecords('users');
        for (let i = 0; i < users.length; i++) {
            const user = users[i];

            // add user's audio dir to check list
            dirs_to_check.push({
                basePath: path.join(usersFileFolder, user.uid, 'audio'),
                user_uid: user.uid,
                type: 'audio'
            });

            // add user's video dir to check list
            dirs_to_check.push({
                basePath: path.join(usersFileFolder, user.uid, 'video'),
                type: 'video'
            });
        }
    } else {
        const audioFolderPath = config_api.getConfigItem('ytdl_audio_folder_path');
        const videoFolderPath = config_api.getConfigItem('ytdl_video_folder_path');

        // add audio dir to check list
        dirs_to_check.push({
            basePath: audioFolderPath,
            type: 'audio'
        });

        // add video dir to check list
        dirs_to_check.push({
            basePath: videoFolderPath,
            type: 'video'
        });
    }

    if (subscriptions_enabled) {
        const subscriptions = await exports.getRecords('subscriptions');
        subscriptions_to_check = subscriptions_to_check.concat(subscriptions);
    }

    // add subscriptions to check list
    for (let i = 0; i < subscriptions_to_check.length; i++) {
        let subscription_to_check = subscriptions_to_check[i];
        if (!subscription_to_check.name) {
            // TODO: Remove subscription as it'll never complete
            continue;
        }
        dirs_to_check.push({
            basePath: subscription_to_check.user_uid ? path.join(usersFileFolder, subscription_to_check.user_uid, 'subscriptions', subscription_to_check.isPlaylist ? 'playlists/' : 'channels/', subscription_to_check.name)
                                      : path.join(subscriptions_base_path, subscription_to_check.isPlaylist ? 'playlists/' : 'channels/', subscription_to_check.name),
            user_uid: subscription_to_check.user_uid,
            type: subscription_to_check.type,
            sub_id: subscription_to_check['id']
        });
    }

    return dirs_to_check;
}

exports.importUnregisteredFiles = async () => {
    const dirs_to_check = await exports.getFileDirectoriesAndDBs();

    // run through check list and check each file to see if it's missing from the db
    for (let i = 0; i < dirs_to_check.length; i++) {
        const dir_to_check = dirs_to_check[i];
        // recursively get all files in dir's path
        const files = await utils.getDownloadedFilesByType(dir_to_check.basePath, dir_to_check.type);

        for (let j = 0; j < files.length; j++) {
            const file = files[j];

            // check if file exists in db, if not add it
            const file_is_registered = !!(await exports.getRecord('files', {id: file.id, sub_id: dir_to_check.sub_id}))
            if (!file_is_registered) {
                // add additional info
                await exports.registerFileDB2(file['path'], dir_to_check.type, dir_to_check.user_uid, null, dir_to_check.sub_id, null);
                logger.verbose(`Added discovered file to the database: ${file.id}`);
            }
        }
    }

}

exports.preimportUnregisteredSubscriptionFile = async (sub, appendedBasePath) => {
    const preimported_file_paths = [];

    const files = await utils.getDownloadedFilesByType(appendedBasePath, sub.type);
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // check if file exists in db, if not add it
        const file_is_registered = await exports.getRecord('files', {id: file.id, sub_id: sub.id});
        if (!file_is_registered) {
            // add additional info
            await exports.registerFileDB2(file['path'], sub.type, sub.user_uid, null, sub.id, null, file);
            preimported_file_paths.push(file['path']);
            logger.verbose(`Preemptively added subscription file to the database: ${file.id}`);
        }
    }
    return preimported_file_paths;
}

exports.addMetadataPropertyToDB = async (property_key) => {
    try {
        const dirs_to_check = await exports.getFileDirectoriesAndDBs();
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

        return await exports.bulkUpdateRecords('files', 'uid', update_obj);
    } catch(err) {
        logger.error(err);
        return false;
    }
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

    new_playlist.user_uid = user_uid ? user_uid : undefined;

    await exports.insertRecordIntoTable('playlists', new_playlist);

    return new_playlist;
}

exports.getPlaylist = async (playlist_id, user_uid = null, require_sharing = false) => {
    let playlist = await exports.getRecord('playlists', {id: playlist_id});

    if (!playlist) {
        playlist = await exports.getRecord('categories', {uid: playlist_id});
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

exports.updatePlaylist = async (playlist, user_uid = null) => {
    let playlistID = playlist.id;

    const duration = await exports.calculatePlaylistDuration(playlist, user_uid);
    playlist.duration = duration;

    return await exports.updateRecord('playlists', {id: playlistID}, playlist);
}

exports.setPlaylistProperty = async (playlist_id, assignment_obj, user_uid = null) => {
    let success = await exports.updateRecord('playlists', {id: playlist_id}, assignment_obj);

    if (!success) {
        success = await exports.updateRecord('categories', {uid: playlist_id}, assignment_obj);
    }

    if (!success) {
        logger.error(`Could not find playlist or category with ID ${playlist_id}`);
    }

    return success;
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

    await exports.removeRecord('files', {uid: uid});

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
    const file_obj = await exports.getRecord('files', {id: file_id});
    return file_obj ? file_obj['uid'] : null;
}

exports.getVideo = async (file_uid, uuid = null, sub_id = null) => {
    return await exports.getRecord('files', {uid: file_uid});
}

exports.getFiles = async (uuid = null) => {
    return await exports.getRecords('files', {user_uid: uuid});
}

exports.setVideoProperty = async (file_uid, assignment_obj) => {
    // TODO: check if video exists, throw error if not
    await exports.updateRecord('files', {uid: file_uid}, assignment_obj);
}

// DB to JSON

exports.exportDBToJSON = async (tables) => {
    const users_db_json = await createUsersJSONs(tables.files, tables.playlists, tables.subscriptions, tables.categories, tables.users);
    const db_json = await createNonUserJSON(tables.files, tables.playlists, tables.subscriptions, tables.categories);

    return {users_db_json: users_db_json, db_json: db_json};
}

const createUsersJSONs = async (files, playlists, subscriptions, categories, users) => {
    // we need to already have a list of user objects to gather the records into
    for (let user of users) {
        const files_of_user = files.filter(file => file.user_uid === user.uid && !file.sub_id);
        const playlists_of_user = playlists.filter(playlist => playlist.user_uid === user.uid);
        const subs_of_user = subscriptions.filter(sub => sub.user_uid === user.uid);
        const categories_of_user = categories ? categories.filter(category => category && category.user_uid === user.uid) : [];
        user['files'] = files_of_user;
        user['playlists'] = playlists_of_user;
        user['subscriptions'] = subs_of_user;
        user['categories'] = categories_of_user;

        for (let subscription of subscriptions) {
            subscription['videos'] = files.filter(file => file.user_uid === user.uid && file.sub_id === sub.id);
        }
    }
}

const createNonUserJSON = async (files, playlists, subscriptions, categories) => {
    const non_user_json = {
        files: files.filter(file => !file.user_uid && !file.sub_id),
        playlists: playlists.filter(playlist => !playlist.user_uid),
        subscriptions: subscriptions.filter(sub => !sub.user_uid),
        categories: categories ? categories.filter(category => category && !category.user_uid) : []
    }

    for (let subscription of non_user_json['subscriptions']) {
        subscription['videos'] = files.filter(file => !file.user_uid && file.sub_id === subscription.id);
    }

    return non_user_json;
}

// Basic DB functions

// Create

exports.insertRecordIntoTable = async (table, doc, replaceFilter = null) => {
    // local db override
    if (using_local_db) {
        if (replaceFilter) local_db.get(table).remove(replaceFilter).write();
        local_db.get(table).push(doc).write();
        return true;
    }

    if (replaceFilter) await database.collection(table).deleteMany(replaceFilter);

    const output = await database.collection(table).insertOne(doc);
    logger.debug(`Inserted doc into ${table}`);
    return !!(output['result']['ok']);
}

exports.insertRecordsIntoTable = async (table, docs) => {
    // local db override
    if (using_local_db) {
        local_db.get(table).push(...docs).write();
        return true;
    }

    const output = await database.collection(table).insertMany(docs);
    logger.debug(`Inserted ${output.insertedCount} docs into ${table}`);
    return !!(output['result']['ok']);
}

exports.bulkInsertRecordsIntoTable = async (table, docs) => {
    // local db override
    if (using_local_db) {
        return await exports.insertRecordsIntoTable(table, docs);
    }

    // not a necessary function as insertRecords does the same thing but gives us more control on batch size if needed
    const table_collection = database.collection(table);
        
    let bulk = table_collection.initializeOrderedBulkOp(); // Initialize the Ordered Batch

    for (let i = 0; i < docs.length; i++) {
        bulk.insert(docs[i]);
    }

    const output = await bulk.execute();
    return !!(output['result']['ok']);

}

// Read

exports.getRecord = async (table, filter_obj) => {
    // local db override
    if (using_local_db) {
        return applyFilterLocalDB(local_db.get(table), filter_obj, 'find').value();
    }

    return await database.collection(table).findOne(filter_obj);
}

exports.getRecords = async (table, filter_obj = null) => {
    // local db override
    if (using_local_db) {
        return filter_obj ? applyFilterLocalDB(local_db.get(table), filter_obj, 'filter').value() : local_db.get(table).value();
    }

    return filter_obj ? await database.collection(table).find(filter_obj).toArray()  : await database.collection(table).find().toArray();
}

// Update

exports.updateRecord = async (table, filter_obj, update_obj) => {
    // local db override
    if (using_local_db) {
        applyFilterLocalDB(local_db.get(table), filter_obj, 'find').assign(update_obj).write();
        return true;
    }

    // sometimes _id will be in the update obj, this breaks mongodb
    if (update_obj['_id']) delete update_obj['_id'];
    const output = await database.collection(table).updateOne(filter_obj, {$set: update_obj});
    return !!(output['result']['ok']);
}

exports.updateRecords = async (table, filter_obj, update_obj) => {
    // local db override
    if (using_local_db) {
        applyFilterLocalDB(local_db.get(table), filter_obj, 'filter').assign(update_obj).write();
        return true;
    }

    const output = await database.collection(table).updateMany(filter_obj, {$set: update_obj});
    return !!(output['result']['ok']);
}

exports.bulkUpdateRecords = async (table, key_label, update_obj) => {
    // local db override
    if (using_local_db) {
        local_db.get(table).each((record) => {
            const item_id_to_update = record[key_label];
            if (!update_obj[item_id_to_update]) return;

            const props_to_update = Object.keys(update_obj[item_id_to_update]);
            for (let i = 0; i < props_to_update.length; i++) {
                const prop_to_update = props_to_update[i];
                const prop_value = update_obj[item_id_to_update][prop_to_update];
                record[prop_to_update] = prop_value;
            }
        }).write();
        return true;
    }

    const table_collection = database.collection(table);
        
    let bulk = table_collection.initializeOrderedBulkOp(); // Initialize the Ordered Batch

    const item_ids_to_update = Object.keys(update_obj);

    for (let i = 0; i < item_ids_to_update.length; i++) {
        const item_id_to_update = item_ids_to_update[i];
        bulk.find({[key_label]: item_id_to_update }).updateOne({
            "$set": update_obj[item_id_to_update]
        });
    }

    const output = await bulk.execute();
    return !!(output['result']['ok']);
}

exports.pushToRecordsArray = async (table, filter_obj, key, value) => {
    // local db override
    if (using_local_db) {
        applyFilterLocalDB(local_db.get(table), filter_obj, 'find').get(key).push(value).write();
        return true;
    }

    const output = await database.collection(table).updateOne(filter_obj, {$push: {[key]: value}});
    return !!(output['result']['ok']);
}

exports.pullFromRecordsArray = async (table, filter_obj, key, value) => {
    // local db override
    if (using_local_db) {
        applyFilterLocalDB(local_db.get(table), filter_obj, 'find').get(key).pull(value).write();
        return true;
    }

    const output = await database.collection(table).updateOne(filter_obj, {$pull: {[key]: value}});
    return !!(output['result']['ok']);
}

// Delete

exports.removeRecord = async (table, filter_obj) => {
    // local db override
    if (using_local_db) {
        applyFilterLocalDB(local_db.get(table), filter_obj, 'remove').write();
        return true;
    }

    const output = await database.collection(table).deleteOne(filter_obj);
    return !!(output['result']['ok']);
}

exports.removeAllRecords = async (table = null) => {
    // local db override
    if (using_local_db) {
        const tables_to_remove = table ? [table] : tables;
        logger.debug(`Removing all records from: ${tables_to_remove}`)
        for (let i = 0; i < tables_to_remove.length; i++) {
            const table_to_remove = tables_to_remove[i];
            local_db.assign({[table_to_remove]: []}).write();
            logger.debug(`Removed all records from ${table_to_remove}`);
        }
        return true;
    }

    let success = true;
    const tables_to_remove = table ? [table] : tables;
    logger.debug(`Removing all records from: ${tables_to_remove}`)
    for (let i = 0; i < tables_to_remove.length; i++) {
        const table_to_remove = tables_to_remove[i];

        const output = await database.collection(table_to_remove).deleteMany({});
        logger.debug(`Removed all records from ${table_to_remove}`);
        success &= !!(output['result']['ok']);
    }
    return success;
}

// Stats

exports.getDBStats = async () => {
    const stats_by_table = {};
    for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        if (table === 'test') continue;

        stats_by_table[table] = await getDBTableStats(table);
    }
    return {stats_by_table: stats_by_table, using_local_db: using_local_db};
}

const getDBTableStats = async (table) => {
    const table_stats = {};
    // local db override
    if (using_local_db) {
        table_stats['records_count'] = local_db.get(table).value().length;
    } else {
        const stats = await database.collection(table).stats();
        table_stats['records_count'] = stats.count;
    }
    return table_stats;
}

// JSON to DB

exports.generateJSONTables = async (db_json, users_json) => {
    // create records
    let files = db_json['files'] || [];
    let playlists = db_json['playlists'] || [];
    let categories = db_json['categories'] || [];
    let subscriptions = db_json['subscriptions'] || [];

    const users = users_json['users'];

    for (let i = 0; i < users.length; i++) {
        const user = users[i];

        if (user['files']) {
            user['files'] = user['files'].map(file => ({ ...file, user_uid: user['uid'] }));
            files = files.concat(user['files']);
        }
        if (user['playlists']) {
            user['playlists'] = user['playlists'].map(playlist => ({ ...playlist, user_uid: user['uid'] }));
            playlists = playlists.concat(user['playlists']);
        }
        if (user['categories']) {
            user['categories'] = user['categories'].map(category => ({ ...category, user_uid: user['uid'] }));
            categories = categories.concat(user['categories']);
        }

        if (user['subscriptions']) {
            user['subscriptions'] = user['subscriptions'].map(subscription => ({ ...subscription, user_uid: user['uid'] }));
            subscriptions = subscriptions.concat(user['subscriptions']);
        }
    }

    const tables_obj = {};
    
    // TODO: use create*Records funcs to strip unnecessary properties
    tables_obj.files = createFilesRecords(files, subscriptions);
    tables_obj.playlists = playlists;
    tables_obj.categories = categories;
    tables_obj.subscriptions = createSubscriptionsRecords(subscriptions);
    tables_obj.users = createUsersRecords(users);
    tables_obj.roles = createRolesRecords(users_json['roles']);
    tables_obj.downloads = createDownloadsRecords(db_json['downloads'])
    
    return tables_obj;
}

exports.importJSONToDB = async (db_json, users_json) => {
    await fs.writeFile(`appdata/db.json.${Date.now()/1000}.bak`, db_json);
    await fs.writeFile(`appdata/users_db.json.${Date.now()/1000}.bak`, users_json);

    // TODO: delete current records
    const tables_obj = await exports.generateJSONTables(db_json, users_json);

    const table_keys = Object.keys(tables_obj);
    
    let success = true;
    for (let i = 0; i < table_keys.length; i++) {
        const table_key = table_keys[i];
        success &= await exports.insertRecordsIntoTable(table_key, tables_obj[table_key]);
    }

    return success;
}

const createFilesRecords = (files, subscriptions) => {
    for (let i = 0; i < subscriptions.length; i++) {
        const subscription = subscriptions[i];
        subscription['videos'] = subscription['videos'].map(file => ({ ...file, sub_id: subscription['id'], user_uid: subscription['user_uid'] ? subscription['user_uid'] : undefined}));
        files = files.concat(subscriptions[i]['videos']);
        console.log(files.length);
    }

    return files;
}

const createPlaylistsRecords = async (playlists) => {

}

const createCategoriesRecords = async (categories) => {

}

const createSubscriptionsRecords = (subscriptions) => {
    for (let i = 0; i < subscriptions.length; i++) {
        delete subscriptions[i]['videos'];
    }

    return subscriptions;
}

const createUsersRecords = (users) => {
    users.forEach(user => {
        delete user['files'];
        delete user['playlists'];
        delete user['subscriptions'];
    });
    return users;
}

const createRolesRecords = (roles) => {
    const new_roles = [];
    Object.keys(roles).forEach(role_key => {
        new_roles.push({
            key: role_key,
            ...roles[role_key]
        });
    });
    return new_roles;
}

const createDownloadsRecords = (downloads) => {
    const new_downloads = [];
    Object.keys(downloads).forEach(session_key => {
        new_downloads.push({
            key: session_key,
            ...downloads[session_key]
        });
    });
    return new_downloads;
}

exports.transferDB = async (local_to_remote) => {
    const table_to_records = {};
    for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        table_to_records[table] = await exports.getRecords(table);
    }

    using_local_db = !local_to_remote;
    if (local_to_remote) {
        // backup local DB
        logger.debug('Backup up Local DB...');
        await fs.copyFile('appdata/local_db.json', `appdata/local_db.json.${Date.now()/1000}.bak`);
        const db_connected = await exports.connectToDB(5, true);
        if (!db_connected) {
            logger.error('Failed to transfer database - could not connect to MongoDB. Verify that your connection URL is valid.');
            return false;
        }
    }
    success = true;

    logger.debug('Clearing new database before transfer...');

    await exports.removeAllRecords();

    logger.debug('Database cleared! Beginning transfer.');

    for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        if (!table_to_records[table] || table_to_records[table].length === 0) continue;
        success &= await exports.bulkInsertRecordsIntoTable(table, table_to_records[table]);
    }

    config_api.setConfigItem('ytdl_use_local_db', using_local_db);

    return success;
}

/*
    This function is necessary to emulate mongodb's ability to search for null or missing values.
        A filter of null or undefined for a property will find docs that have that property missing, or have it
        null or undefined. We want that same functionality for the local DB as well
*/
const applyFilterLocalDB = (db_path, filter_obj, operation) => {
    const filter_props = Object.keys(filter_obj);
    const return_val = db_path[operation](record => {
        if (!filter_props) return true;
        let filtered = true;
        for (let i = 0; i < filter_props.length; i++) {
            const filter_prop = filter_props[i];
            const filter_prop_value = filter_obj[filter_prop];
            if (filter_prop_value === undefined || filter_prop_value === null) {
                filtered &= record[filter_prop] === undefined || record[filter_prop] === null
            } else {
                filtered &= record[filter_prop] === filter_prop_value;
            }
        }
        return filtered;
    });
    return return_val;
}