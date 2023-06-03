const fs = require('fs-extra')
const path = require('path')
const { MongoClient } = require("mongodb");
const { uuid } = require('uuidv4');
const _ = require('lodash');

const config_api = require('./config');
const utils = require('./utils')
const logger = require('./logger');

const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync');
const { BehaviorSubject } = require('rxjs');

let local_db = null;
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
    notifications: {
        name: 'notifications',
        primary_key: 'uid'
    },
    archives: {
        name: 'archives'
    },
    test: {
        name: 'test'
    }
}

const tables_list = Object.keys(tables);

let using_local_db = null; 

function setDB(input_db, input_users_db) {
    db = input_db; users_db = input_users_db;
    exports.db = input_db;
    exports.users_db = input_users_db
}

exports.initialize = (input_db, input_users_db, db_name = 'local_db.json') => {
    setDB(input_db, input_users_db);

    // must be done here to prevent getConfigItem from being called before init
    using_local_db = config_api.getConfigItem('ytdl_use_local_db');

    const local_adapter = new FileSync(`./appdata/${db_name}`);
    local_db = low(local_adapter);

    const local_db_defaults = {}
    tables_list.forEach(table => {local_db_defaults[table] = []});
    local_db.defaults(local_db_defaults).write();
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
        using_local_db = false; // needs to happen for tests (in normal operation using_local_db is guaranteed false)
        return true;
    } catch(err) {
        logger.error(err);
        return false;
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}

exports.setVideoProperty = async (file_uid, assignment_obj) => {
    // TODO: check if video exists, throw error if not
    await exports.updateRecord('files', {uid: file_uid}, assignment_obj);
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
                type: 'audio',
                archive_path: utils.getArchiveFolder('audio', user.uid)
            });

            // add user's video dir to check list
            dirs_to_check.push({
                basePath: path.join(usersFileFolder, user.uid, 'video'),
                user_uid: user.uid,
                type: 'video',
                archive_path: utils.getArchiveFolder('video', user.uid)
            });
        }
    } else {
        const audioFolderPath = config_api.getConfigItem('ytdl_audio_folder_path');
        const videoFolderPath = config_api.getConfigItem('ytdl_video_folder_path');

        // add audio dir to check list
        dirs_to_check.push({
            basePath: audioFolderPath,
            type: 'audio',
            archive_path: utils.getArchiveFolder('audio')
        });

        // add video dir to check list
        dirs_to_check.push({
            basePath: videoFolderPath,
            type: 'video',
            archive_path: utils.getArchiveFolder('video')
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
            sub_id: subscription_to_check['id'],
            archive_path: utils.getArchiveFolder(subscription_to_check.type, subscription_to_check.user_uid, subscription_to_check)
        });
    }

    return dirs_to_check;
}

// Basic DB functions

// Create

exports.insertRecordIntoTable = async (table, doc, replaceFilter = null) => {
    // local db override
    if (using_local_db) {
        if (replaceFilter) local_db.get(table).remove((doc) => _.isMatch(doc, replaceFilter)).write();
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
        return exports.applyFilterLocalDB(local_db.get(table), filter_obj, 'find').value();
    }

    return await database.collection(table).findOne(filter_obj);
}

exports.getRecords = async (table, filter_obj = null, return_count = false, sort = null, range = null) => {
    // local db override
    if (using_local_db) {
        let cursor = filter_obj ? exports.applyFilterLocalDB(local_db.get(table), filter_obj, 'filter').value() : local_db.get(table).value();
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

exports.updateRecord = async (table, filter_obj, update_obj, nested_mode = false) => {
    // local db override
    if (using_local_db) {
        if (nested_mode) {
            // if object is nested we need to handle it differently
            update_obj = utils.convertFlatObjectToNestedObject(update_obj);
            exports.applyFilterLocalDB(local_db.get(table), filter_obj, 'find').merge(update_obj).write();
            return true;
        }
        exports.applyFilterLocalDB(local_db.get(table), filter_obj, 'find').assign(update_obj).write();
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
        exports.applyFilterLocalDB(local_db.get(table), filter_obj, 'filter').each((record) => {
            const props_to_update = Object.keys(update_obj);
            for (let i = 0; i < props_to_update.length; i++) {
                const prop_to_update = props_to_update[i];
                const prop_value = update_obj[prop_to_update];
                record[prop_to_update] = prop_value;
            }
        }).write();
        return true;
    }

    const output = await database.collection(table).updateMany(filter_obj, {$set: update_obj});
    return !!(output['result']['ok']);
}

exports.removePropertyFromRecord = async (table, filter_obj, remove_obj) => {
    // local db override
    if (using_local_db) {
        const props_to_remove = Object.keys(remove_obj);
        exports.applyFilterLocalDB(local_db.get(table), filter_obj, 'find').unset(props_to_remove).write();
        return true;
    }

    const output = await database.collection(table).updateOne(filter_obj, {$unset: remove_obj});
    return !!(output['result']['ok']);
}

exports.bulkUpdateRecordsByKey = async (table, key_label, update_obj) => {
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
        exports.applyFilterLocalDB(local_db.get(table), filter_obj, 'find').get(key).push(value).write();
        return true;
    }

    const output = await database.collection(table).updateOne(filter_obj, {$push: {[key]: value}});
    return !!(output['result']['ok']);
}

exports.pullFromRecordsArray = async (table, filter_obj, key, value) => {
    // local db override
    if (using_local_db) {
        exports.applyFilterLocalDB(local_db.get(table), filter_obj, 'find').get(key).pull(value).write();
        return true;
    }

    const output = await database.collection(table).updateOne(filter_obj, {$pull: {[key]: value}});
    return !!(output['result']['ok']);
}

// Delete

exports.removeRecord = async (table, filter_obj) => {
    // local db override
    if (using_local_db) {
        exports.applyFilterLocalDB(local_db.get(table), filter_obj, 'remove').write();
        return true;
    }

    const output = await database.collection(table).deleteOne(filter_obj);
    return !!(output['result']['ok']);
}

// exports.removeRecordsByUIDBulk = async (table, uids) => {
//     // local db override
//     if (using_local_db) {
//         exports.applyFilterLocalDB(local_db.get(table), filter_obj, 'remove').write();
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
            if (filter_obj) exports.applyFilterLocalDB(local_db.get(table), filter_obj, 'remove').write();
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
        if (!subscription['videos']) continue;
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

    logger.info(`Backing up ${using_local_db ? 'local' : 'remote'} DB to ${path_to_backups}`);

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

    logger.info('Backup up DB...');
    await exports.backupDB(); // should backup always

    using_local_db = !local_to_remote;
    if (local_to_remote) {
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

        error:    {$ne: null}
          ^            ^
          |            |
      filter_prop  filter_prop_value
*/
exports.applyFilterLocalDB = (db_path, filter_obj, operation) => {
    const filter_props = Object.keys(filter_obj);
    const return_val = db_path[operation](record => {
        if (!filter_props) return true;
        let filtered = true;
        for (let i = 0; i < filter_props.length; i++) {
            const filter_prop = filter_props[i];
            const filter_prop_value = filter_obj[filter_prop];
            if (filter_prop_value === undefined || filter_prop_value === null) {
                filtered &= record[filter_prop] === undefined || record[filter_prop] === null;
            } else {
                if (typeof filter_prop_value === 'object') {
                    if (!record[filter_prop]) {
                        continue;
                    }
                    if ('$regex' in filter_prop_value) {
                        filtered &= (record[filter_prop].search(new RegExp(filter_prop_value['$regex'], filter_prop_value['$options'])) !== -1);
                    } else if ('$ne' in filter_prop_value) {
                        filtered &= filter_prop in record && record[filter_prop] !== filter_prop_value['$ne'];
                    } else if ('$lt' in filter_prop_value) {
                        filtered &= filter_prop in record && record[filter_prop] < filter_prop_value['$lt'];
                    } else if ('$gt' in filter_prop_value) {
                        filtered &= filter_prop in record && record[filter_prop] > filter_prop_value['$gt'];
                    } else if ('$lte' in filter_prop_value) {
                        filtered &= filter_prop in record && record[filter_prop] <= filter_prop_value['$lt'];
                    } else if ('$gte' in filter_prop_value) {
                        filtered &= filter_prop in record && record[filter_prop] >= filter_prop_value['$gt'];
                    }
                } else {
                    // handle case of nested property check
                    if (filter_prop.includes('.')) {
                        filtered &= utils.searchObjectByString(record, filter_prop) === filter_prop_value;
                    } else {
                        if (!record[filter_prop]) {
                            continue;
                        }
                        filtered &= record[filter_prop] === filter_prop_value;
                    } 
                }
            }
        }
        return filtered;
    });
    return return_val;
}

// should only be used for tests
exports.setLocalDBMode = (mode) => {
    using_local_db = mode;
}