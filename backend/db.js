var fs = require('fs-extra')
var path = require('path')
const { MongoClient } = require("mongodb");
const { uuid } = require('uuidv4');

const config_api = require('./config');
var utils = require('./utils')
const logger = require('./logger');

const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync');
const { BehaviorSubject } = require('rxjs');
const local_adapter = new FileSync('./appdata/local_db.json');
const local_db = low(local_adapter);

let database = null;
exports.database_initialized = false;
exports.database_initialized_bs = new BehaviorSubject(false);

const tables = {
    files: {
        name: 'files',
        primary_key: 'uid',
        text_search: {
            title: 'text',
            uploader: 'text',
            uid: 'text'
        }
    },
    playlists: {
        name: 'playlists',
        primary_key: 'id'
    },
    categories: {
        name: 'categories',
        primary_key: 'uid'
    },
    subscriptions: {
        name: 'subscriptions',
        primary_key: 'id'
    },
    downloads: {
        name: 'downloads'
    },
    users: {
        name: 'users',
        primary_key: 'uid'
    },
    roles: {
        name: 'roles',
        primary_key: 'key'
    },
    download_queue: {
        name: 'download_queue',
        primary_key: 'uid'
    },
    tasks: {
        name: 'tasks',
        primary_key: 'key'
    },
    test: {
        name: 'test'
    }
}

const tables_list = Object.keys(tables);

const local_db_defaults = {}
tables_list.forEach(table => {local_db_defaults[table] = []});
local_db.defaults(local_db_defaults).write();

let using_local_db = null; 

function setDB(input_db, input_users_db) {
    db = input_db; users_db = input_users_db;
    exports.db = input_db;
    exports.users_db = input_users_db
}

exports.initialize = (input_db, input_users_db) => {
    setDB(input_db, input_users_db);

    // must be done here to prevent getConfigItem from being called before init
    using_local_db = config_api.getConfigItem('ytdl_use_local_db');
}

exports.connectToDB = async (retries = 5, no_fallback = false, custom_connection_string = null) => {
    const success = await exports._connectToDB(custom_connection_string);
    if (success) return true;

    if (retries) {
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

exports._connectToDB = async (custom_connection_string = null) => {
    const uri = !custom_connection_string ? config_api.getConfigItem('ytdl_mongodb_connection_string') : custom_connection_string; // "mongodb://127.0.0.1:27017/?compressors=zlib&gssapiServiceName=mongodb";
    const client = new MongoClient(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    });

    try {
        await client.connect();
        database = client.db('ytdl_material');

        // avoid doing anything else if it's just a test
        if (custom_connection_string) return true;

        const existing_collections = (await database.listCollections({}, { nameOnly: true }).toArray()).map(collection => collection.name);

        const missing_tables = tables_list.filter(table => !(existing_collections.includes(table)));
        missing_tables.forEach(async table => {
            await database.createCollection(table);
        });

        tables_list.forEach(async table => {
            const primary_key = tables[table]['primary_key'];
            if (primary_key) {
                await database.collection(table).createIndex({[primary_key]: 1}, { unique: true });
            }
            const text_search = tables[table]['text_search'];
            if (text_search) {
                await database.collection(table).createIndex(text_search);
            }
        });
        return true;
    } catch(err) {
        logger.error(err);
        return false;
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}

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
    path_object = path.parse(file_object['path']);
    file_object['path'] = path.format(path_object);

    exports.insertRecordIntoTable('files', file_object, {path: file_object['path']})

    return file_object;
}

function generateFileObject(file_path, type) {
    var jsonobj = utils.getJSON(file_path, type);
    if (!jsonobj) {
        return null;
    } else if (!jsonobj['_filename']) {
        logger.error(`Failed to get filename from info JSON! File ${jsonobj['title']} could not be added.`);
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
    var upload_date = utils.formatDateString(jsonobj.upload_date);

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
    const imported_files = [];
    const dirs_to_check = await exports.getFileDirectoriesAndDBs();

    // run through check list and check each file to see if it's missing from the db
    for (let i = 0; i < dirs_to_check.length; i++) {
        const dir_to_check = dirs_to_check[i];
        // recursively get all files in dir's path
        const files = await utils.getDownloadedFilesByType(dir_to_check.basePath, dir_to_check.type);

        for (let j = 0; j < files.length; j++) {
            const file = files[j];

            // check if file exists in db, if not add it
            const files_with_same_url = await exports.getRecords('files', {url: file.url, sub_id: dir_to_check.sub_id});
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

exports.createPlaylist = async (playlist_name, uids, type, user_uid = null) => {
    const first_video = await exports.getVideo(uids[0]);
    const thumbnailToUse = first_video['thumbnailURL'];
    
    let new_playlist = {
        name: playlist_name,
        uids: uids,
        id: uuid(),
        thumbnailURL: thumbnailToUse,
        type: type,
        registered: Date.now(),
        randomize_order: false
    };

    new_playlist.user_uid = user_uid ? user_uid : undefined;

    await exports.insertRecordIntoTable('playlists', new_playlist);
    
    const duration = await exports.calculatePlaylistDuration(new_playlist);
    await exports.updateRecord('playlists', {id: new_playlist.id}, {duration: duration});

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

exports.updatePlaylist = async (playlist) => {
    let playlistID = playlist.id;

    const duration = await exports.calculatePlaylistDuration(playlist);
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
        const usersFileFolder = config_api.getConfigItem('ytdl_users_base_path');
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

exports.getVideo = async (file_uid) => {
    return await exports.getRecord('files', {uid: file_uid});
}

exports.getFiles = async (uuid = null) => {
    return await exports.getRecords('files', {user_uid: uuid});
}

exports.setVideoProperty = async (file_uid, assignment_obj) => {
    // TODO: check if video exists, throw error if not
    await exports.updateRecord('files', {uid: file_uid}, assignment_obj);
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

    if (replaceFilter) {
        const output = await database.collection(table).bulkWrite([
            {
                deleteMany: {
                    filter: replaceFilter
                }
            },
            {
                insertOne: {
                    document: doc
                }
            }
        ]);
        logger.debug(`Inserted doc into ${table} with filter: ${JSON.stringify(replaceFilter)}`);
        return !!(output['result']['ok']);
    }

    const output = await database.collection(table).insertOne(doc);
    logger.debug(`Inserted doc into ${table}`);
    return !!(output['result']['ok']);
}

exports.insertRecordsIntoTable = async (table, docs, ignore_errors = false) => {
    // local db override
    if (using_local_db) {
        const records_limit = 30000;
        if (docs.length < records_limit) {
            local_db.get(table).push(...docs).write();
        } else {
            for (let i = 0; i < docs.length; i+=records_limit) {
                const records_to_push = docs.slice(i, i+records_limit > docs.length ? docs.length : i+records_limit)
                local_db.get(table).push(...records_to_push).write();
            }
        }
        return true;
    }
    const output = await database.collection(table).insertMany(docs, {ordered: !ignore_errors});
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

exports.getRecords = async (table, filter_obj = null, return_count = false, sort = null, range = null) => {
    // local db override
    if (using_local_db) {
        let cursor = filter_obj ? applyFilterLocalDB(local_db.get(table), filter_obj, 'filter').value() : local_db.get(table).value();
        if (sort) {
            cursor = cursor.sort((a, b) => (a[sort['by']] > b[sort['by']] ? sort['order'] : sort['order']*-1));
        }
        if (range) {
            cursor = cursor.slice(range[0], range[1]);
        }
        return !return_count ? cursor : cursor.length;
    }

    const cursor = filter_obj ? database.collection(table).find(filter_obj) : database.collection(table).find();
    if (sort) {
        cursor.sort({[sort['by']]: sort['order']});
    }
    if (range) {
        cursor.skip(range[0]).limit(range[1] - range[0]);
    }

    return !return_count ? await cursor.toArray() : await cursor.count();
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

// exports.removeRecordsByUIDBulk = async (table, uids) => {
//     // local db override
//     if (using_local_db) {
//         applyFilterLocalDB(local_db.get(table), filter_obj, 'remove').write();
//         return true;
//     }

//     const table_collection = database.collection(table);
        
//     let bulk = table_collection.initializeOrderedBulkOp(); // Initialize the Ordered Batch

//     const item_ids_to_remove = 

//     for (let i = 0; i < item_ids_to_update.length; i++) {
//         const item_id_to_update = item_ids_to_update[i];
//         bulk.find({[key_label]: item_id_to_update }).updateOne({
//             "$set": update_obj[item_id_to_update]
//         });
//     }

//     const output = await bulk.execute();
//     return !!(output['result']['ok']);
// }


exports.findDuplicatesByKey = async (table, key) => {
    let duplicates = [];
    if (using_local_db) {
        // this can probably be optimized
        const all_records = await exports.getRecords(table);
        const existing_records = {};
        for (let i = 0; i < all_records.length; i++) {
            const record = all_records[i];
            const value = record[key];

            if (existing_records[value]) {
                duplicates.push(record);
            }

            existing_records[value] = true;
        }
        return duplicates;
    }
    
    const duplicated_values = await database.collection(table).aggregate([
        {"$group" : { "_id": `$${key}`, "count": { "$sum": 1 } } },
        {"$match": {"_id" :{ "$ne" : null } , "count" : {"$gt": 1} } }, 
        {"$project": {[key] : "$_id", "_id" : 0} }
    ]).toArray();

    for (let i = 0; i < duplicated_values.length; i++) {
        const duplicated_value = duplicated_values[i];
        const duplicated_records = await exports.getRecords(table, duplicated_value, false);
        if (duplicated_records.length > 1) {
            duplicates = duplicates.concat(duplicated_records.slice(1, duplicated_records.length));
        }
    }
    return duplicates;
}

exports.removeAllRecords = async (table = null, filter_obj = null) => {
    // local db override
    const tables_to_remove = table ? [table] : tables_list;
    logger.debug(`Removing all records from: ${tables_to_remove} with filter: ${JSON.stringify(filter_obj)}`)
    if (using_local_db) {
        for (let i = 0; i < tables_to_remove.length; i++) {
            const table_to_remove = tables_to_remove[i];
            if (filter_obj) applyFilterLocalDB(local_db.get(table), filter_obj, 'remove').write();
            else local_db.assign({[table_to_remove]: []}).write();
            logger.debug(`Successfully removed records from ${table_to_remove}`);
        }
        return true;
    }

    let success = true;
    for (let i = 0; i < tables_to_remove.length; i++) {
        const table_to_remove = tables_to_remove[i];

        const output = await database.collection(table_to_remove).deleteMany(filter_obj ? filter_obj : {});
        logger.debug(`Successfully removed records from ${table_to_remove}`);
        success &= !!(output['result']['ok']);
    }
    return success;
}

// Stats

exports.getDBStats = async () => {
    const stats_by_table = {};
    for (let i = 0; i < tables_list.length; i++) {
        const table = tables_list[i];
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
    await fs.writeFile(`appdata/db.json.${Date.now()/1000}.bak`, JSON.stringify(db_json, null, 2));
    await fs.writeFile(`appdata/users_db.json.${Date.now()/1000}.bak`, JSON.stringify(users_json, null, 2));

    await exports.removeAllRecords();
    const tables_obj = await exports.generateJSONTables(db_json, users_json);

    const table_keys = Object.keys(tables_obj);
    
    let success = true;
    for (let i = 0; i < table_keys.length; i++) {
        const table_key = table_keys[i];
        if (!tables_obj[table_key] || tables_obj[table_key].length === 0) continue;
        success &= await exports.insertRecordsIntoTable(table_key, tables_obj[table_key], true);
    }

    return success;
}

const createFilesRecords = (files, subscriptions) => {
    for (let i = 0; i < subscriptions.length; i++) {
        const subscription = subscriptions[i];
        subscription['videos'] = subscription['videos'].map(file => ({ ...file, sub_id: subscription['id'], user_uid: subscription['user_uid'] ? subscription['user_uid'] : undefined}));
        files = files.concat(subscriptions[i]['videos']);
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

exports.backupDB = async () => {
    const backup_dir = path.join('appdata', 'db_backup');
    fs.ensureDirSync(backup_dir);
    const backup_file_name = `${using_local_db ? 'local' : 'remote'}_db.json.${Date.now()/1000}.bak`;
    const path_to_backups = path.join(backup_dir, backup_file_name);

    logger.verbose(`Backing up ${using_local_db ? 'local' : 'remote'} DB to ${path_to_backups}`);

    const table_to_records = {};
    for (let i = 0; i < tables_list.length; i++) {
        const table = tables_list[i];
        table_to_records[table] = await exports.getRecords(table);
    }

    fs.writeJsonSync(path_to_backups, table_to_records);

    return backup_file_name;
}

exports.restoreDB = async (file_name) => {
    const path_to_backup = path.join('appdata', 'db_backup', file_name);

    logger.debug('Reading database backup file.');
    const table_to_records = fs.readJSONSync(path_to_backup);

    if (!table_to_records) {
        logger.error(`Failed to restore DB! Backup file '${path_to_backup}' could not be read.`);
        return false;
    }

    logger.debug('Clearing database.');
    await exports.removeAllRecords();

    logger.debug('Database cleared! Beginning restore.');
    let success = true;
    for (let i = 0; i < tables_list.length; i++) {
        const table = tables_list[i];
        if (!table_to_records[table] || table_to_records[table].length === 0) continue;
        success &= await exports.bulkInsertRecordsIntoTable(table, table_to_records[table]);
    }

    logger.debug('Restore finished!');

    return success;
}

exports.transferDB = async (local_to_remote) => {
    const table_to_records = {};
    for (let i = 0; i < tables_list.length; i++) {
        const table = tables_list[i];
        table_to_records[table] = await exports.getRecords(table);
    }

    using_local_db = !local_to_remote;
    if (local_to_remote) {
        logger.debug('Backup up DB...');
        await exports.backupDB();
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

    for (let i = 0; i < tables_list.length; i++) {
        const table = tables_list[i];
        if (!table_to_records[table] || table_to_records[table].length === 0) continue;
        success &= await exports.bulkInsertRecordsIntoTable(table, table_to_records[table]);
    }

    config_api.setConfigItem('ytdl_use_local_db', using_local_db);

    logger.debug('Transfer finished!');

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
                if (typeof filter_prop_value === 'object') {
                    if (filter_prop_value['$regex']) {
                        filtered &= (record[filter_prop].search(new RegExp(filter_prop_value['$regex'], filter_prop_value['$options'])) !== -1);
                    }
                } else {
                    filtered &= record[filter_prop] === filter_prop_value;
                }
            }
        }
        return filtered;
    });
    return return_val;
}

// archive helper functions

async function writeToBlacklist(type, line) {
    const archivePath = path.join(__dirname, 'appdata', 'archives');
    let blacklistPath = path.join(archivePath, (type === 'audio') ? 'blacklist_audio.txt' : 'blacklist_video.txt');
    // adds newline to the beginning of the line
    line.replace('\n', '');
    line.replace('\r', '');
    line = '\n' + line;
    await fs.appendFile(blacklistPath, line);
}
