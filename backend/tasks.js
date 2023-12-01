const db_api = require('./db');
const notifications_api = require('./notifications');
const youtubedl_api = require('./youtube-dl');
const archive_api = require('./archive');
const files_api = require('./files');
const subscriptions_api = require('./subscriptions');
const config_api = require('./config');
const auth_api = require('./authentication/auth');
const utils = require('./utils');
const logger = require('./logger');
const CONSTS = require('./consts');

const fs = require('fs-extra');
const path = require('path');
const scheduler = require('node-schedule');

const TASKS = {
    backup_local_db: {
        run: db_api.backupDB,
        title: 'Backup DB',
        job: null
    },
    missing_files_check: {
        run: checkForMissingFiles,
        confirm: deleteMissingFiles,
        title: 'Missing files check',
        job: null
    },
    missing_db_records: {
        run: files_api.importUnregisteredFiles,
        title: 'Import missing DB records',
        job: null
    },
    duplicate_files_check: {
        run: checkForDuplicateFiles,
        confirm: removeDuplicates,
        title: 'Find duplicate files in DB',
        job: null
    },
    youtubedl_update_check: {
        run: youtubedl_api.checkForYoutubeDLUpdate,
        confirm: youtubedl_api.updateYoutubeDL,
        title: 'Update youtube-dl',
        job: null
    },
    delete_old_files: {
        run: checkForAutoDeleteFiles,
        confirm: autoDeleteFiles,
        title: 'Delete old files',
        job: null
    },
    import_legacy_archives: {
        run: archive_api.importArchives,
        title: 'Import legacy archives',
        job: null
    },
    rebuild_database: {
        run: rebuildDB,
        title: 'Rebuild database',
        job: null
    }
}

const defaultOptions = {
    all: {
        auto_confirm: false
    },
    delete_old_files: {
        blacklist_files: false,
        blacklist_subscription_files: false,
        threshold_days: ''
    }
}

function scheduleJob(task_key, schedule) {
    // schedule has to be converted from our format to one node-schedule can consume
    let converted_schedule = null;
    if (schedule['type'] === 'timestamp') {
        converted_schedule = new Date(schedule['data']['timestamp']);
    } else if (schedule['type'] === 'recurring') {
        const dayOfWeek = schedule['data']['dayOfWeek'] != null       ? schedule['data']['dayOfWeek'] : null;
        const hour = schedule['data']['hour']           != null       ? schedule['data']['hour']      : null;
        const minute = schedule['data']['minute']       != null       ? schedule['data']['minute']    : null;
        converted_schedule = new scheduler.RecurrenceRule(null, null, null, dayOfWeek, hour, minute, undefined, schedule['data']['tz'] ? schedule['data']['tz'] : undefined);
    } else {
        logger.error(`Failed to schedule job '${task_key}' as the type '${schedule['type']}' is invalid.`)
        return null;
    }

    return scheduler.scheduleJob(converted_schedule, async () => {
        const task_state = await db_api.getRecord('tasks', {key: task_key});
        if (task_state['running'] || task_state['confirming']) {
            logger.verbose(`Skipping running task ${task_state['key']} as it is already in progress.`);
            return;
        }

        // remove schedule if it's a one-time task
        if (task_state['schedule']['type'] !== 'recurring') await db_api.updateRecord('tasks', {key: task_key}, {schedule: null});
        // we're just "running" the task, any confirmation should be user-initiated
        exports.executeRun(task_key);
    });
}

if (db_api.database_initialized) {
    exports.setupTasks();
} else {
    db_api.database_initialized_bs.subscribe(init => {
        if (init) exports.setupTasks();
    });
}

exports.setupTasks = async () => {
    const tasks_keys = Object.keys(TASKS);
    for (let i = 0; i < tasks_keys.length; i++) {
        const task_key = tasks_keys[i];
        const mergedDefaultOptions = Object.assign({}, defaultOptions['all'], defaultOptions[task_key] || {});
        const task_in_db = await db_api.getRecord('tasks', {key: task_key});
        if (!task_in_db) {
            // insert task metadata into table if missing, eventually move title to UI
            await db_api.insertRecordIntoTable('tasks', {
                key: task_key,
                title: TASKS[task_key]['title'],
                last_ran: null,
                last_confirmed: null,
                running: false,
                confirming: false,
                data: null,
                error: null,
                schedule: null,
                options: Object.assign({}, defaultOptions['all'], defaultOptions[task_key] || {})
            });
        } else {
            // verify all options exist in task
            for (const key of Object.keys(mergedDefaultOptions)) {
                const option_key = `options.${key}`;
                // Remove any potential mangled option keys (#861)
                await db_api.removePropertyFromRecord('tasks', {key: task_key}, {[option_key]: true});
                if (!(task_in_db.options && task_in_db.options.hasOwnProperty(key))) {
                    await db_api.updateRecord('tasks', {key: task_key}, {[option_key]: mergedDefaultOptions[key]}, true);
                }
            }

            // reset task if necessary
            await db_api.updateRecord('tasks', {key: task_key}, {running: false, confirming: false});

            // schedule task and save job
            if (task_in_db['schedule']) {
                // prevent timestamp schedules from being set to the past
                if (task_in_db['schedule']['type'] === 'timestamp' && task_in_db['schedule']['data']['timestamp'] < Date.now()) {
                    await db_api.updateRecord('tasks', {key: task_key}, {schedule: null});
                    continue;
                }
                TASKS[task_key]['job'] = scheduleJob(task_key, task_in_db['schedule']);
            }
        }
    }
}

exports.executeTask = async (task_key) => {
    if (!TASKS[task_key]) {
        logger.error(`Task ${task_key} does not exist!`);
        return;
    }
    logger.verbose(`Executing task ${task_key}`);
    await exports.executeRun(task_key);
    if (!TASKS[task_key]['confirm']) return;
    await exports.executeConfirm(task_key);
    logger.verbose(`Finished executing ${task_key}`);
}

exports.executeRun = async (task_key) => {
    logger.verbose(`Running task ${task_key}`);
    await db_api.updateRecord('tasks', {key: task_key}, {error: null})
    // don't set running to true when backup up DB as it will be stick "running" if restored
    if (task_key !== 'backup_local_db') await db_api.updateRecord('tasks', {key: task_key}, {running: true});
    const data = await TASKS[task_key].run();
    await db_api.updateRecord('tasks', {key: task_key}, {data: TASKS[task_key]['confirm'] ? data : null, last_ran: Date.now()/1000, running: false});
    logger.verbose(`Finished running task ${task_key}`);
    const task_obj = await db_api.getRecord('tasks', {key: task_key});
    await notifications_api.sendTaskNotification(task_obj, false);

    if (task_obj['options'] && task_obj['options']['auto_confirm']) {
        exports.executeConfirm(task_key);
    }
}

exports.executeConfirm = async (task_key) => {
    logger.verbose(`Confirming task ${task_key}`);
    await db_api.updateRecord('tasks', {key: task_key}, {error: null})
    if (!TASKS[task_key]['confirm']) {
        return null;
    }
    await db_api.updateRecord('tasks', {key: task_key}, {confirming: true});
    const task_obj = await db_api.getRecord('tasks', {key: task_key});
    const data = task_obj['data'];
    await TASKS[task_key].confirm(data);
    await db_api.updateRecord('tasks', {key: task_key}, {confirming: false, last_confirmed: Date.now()/1000, data: null});
    logger.verbose(`Finished confirming task ${task_key}`);
    await notifications_api.sendTaskNotification(task_obj, false);
}

exports.updateTaskSchedule = async (task_key, schedule) => {
    logger.verbose(`Updating schedule for task ${task_key}`);
    await db_api.updateRecord('tasks', {key: task_key}, {schedule: schedule});
    if (TASKS[task_key]['job']) {
        TASKS[task_key]['job'].cancel();
        TASKS[task_key]['job'] = null;
    }
    if (schedule) {
        TASKS[task_key]['job'] = scheduleJob(task_key, schedule);
    }
}

// missing files check

async function checkForMissingFiles() {
    const missing_files = [];
    const all_files = await db_api.getRecords('files');
    for (let i = 0; i < all_files.length; i++) {
        const file_to_check = all_files[i];
        const file_exists = fs.existsSync(file_to_check['path']);
        if (!file_exists) missing_files.push(file_to_check['uid']);
    }
    return {uids: missing_files};
}

async function deleteMissingFiles(data) {
    const uids = data['uids'];
    for (let i = 0; i < uids.length; i++) {
        const uid = uids[i];
        await db_api.removeRecord('files', {uid: uid});
    }
}

// duplicate files check

async function checkForDuplicateFiles() {
    const duplicate_files = await db_api.findDuplicatesByKey('files', 'path');
    const duplicate_uids = duplicate_files.map(duplicate_file => duplicate_file['uid']);
    if (duplicate_uids && duplicate_uids.length > 0) {
        return {uids: duplicate_uids};
    }
    return {uids: []};
}

async function removeDuplicates(data) {
    for (let i = 0; i < data['uids'].length; i++) {
        await db_api.removeRecord('files', {uid: data['uids'][i]});
    }
}

// auto delete files

async function checkForAutoDeleteFiles() {
    const task_obj = await db_api.getRecord('tasks', {key: 'delete_old_files'});
    if (!task_obj['options'] || !task_obj['options']['threshold_days']) {
        const error_message = 'Failed to do delete check because no limit was set!';
        logger.error(error_message);
        await db_api.updateRecord('tasks', {key: 'delete_old_files'}, {error: error_message})
        return null;
    }
    const delete_older_than_timestamp = Date.now() - task_obj['options']['threshold_days']*86400*1000;
    const files = (await db_api.getRecords('files', {registered: {$lt: delete_older_than_timestamp}}))
    const files_to_remove = files.map(file => {return {uid: file.uid, sub_id: file.sub_id}});
    return {files_to_remove: files_to_remove};
}

async function autoDeleteFiles(data) {
    const task_obj = await db_api.getRecord('tasks', {key: 'delete_old_files'});
    if (data['files_to_remove']) {
        logger.info(`Removing ${data['files_to_remove'].length} old files!`);
        for (let i = 0; i < data['files_to_remove'].length; i++) {
            const file_to_remove = data['files_to_remove'][i];
            await files_api.deleteFile(file_to_remove['uid'], task_obj['options']['blacklist_files'] || (file_to_remove['sub_id'] && file_to_remove['blacklist_subscription_files']));
        }
    }
}

async function rebuildDB() {
    await db_api.backupDB();
    let subs_to_add = await guessSubscriptions(false);
    subs_to_add = subs_to_add.concat(await guessSubscriptions(true));
    const users_to_add = await guessUsers();
    for (const user_to_add of users_to_add) {
        const usersFileFolder = config_api.getConfigItem('ytdl_users_base_path');
        
        const user_exists = await db_api.getRecord('users', {uid: user_to_add});
        if (!user_exists) {
            await auth_api.registerUser(user_to_add, user_to_add, 'password');
            logger.info(`Regenerated user ${user_to_add}`);
        }
        
        const user_channel_subs = await guessSubscriptions(false, path.join(usersFileFolder, user_to_add), user_to_add);
        const user_playlist_subs = await guessSubscriptions(true, path.join(usersFileFolder, user_to_add), user_to_add);
        subs_to_add = subs_to_add.concat(user_channel_subs, user_playlist_subs);
    }

    for (const sub_to_add of subs_to_add) {
        const sub_exists = !!(await subscriptions_api.getSubscriptionByName(sub_to_add['name'], sub_to_add['user_uid']));
        // TODO: we shouldn't be creating this here
        const new_sub = Object.assign({}, sub_to_add, {paused: true});
        if (!sub_exists) {
            await subscriptions_api.subscribe(new_sub, sub_to_add['user_uid'], true);
            logger.info(`Regenerated subscription ${sub_to_add['name']}`);
        }
    }

    logger.info(`Importing unregistered files`);
    await files_api.importUnregisteredFiles();
}

const guessUsers = async () => {
    const usersFileFolder = config_api.getConfigItem('ytdl_users_base_path');
    const userPaths = await utils.getDirectoriesInDirectory(usersFileFolder);
    return userPaths.map(userPath => path.basename(userPath));
}

const guessSubscriptions = async (isPlaylist, basePath = null) => {
    const guessed_subs = [];
    const subscriptionsFileFolder = config_api.getConfigItem('ytdl_subscriptions_base_path');

    const subsSubPath = basePath ? path.join(basePath, 'subscriptions') : subscriptionsFileFolder;
    const subsPath = path.join(subsSubPath, isPlaylist ? 'playlists' : 'channels');

    const subs = await utils.getDirectoriesInDirectory(subsPath);
    for (const subPath of subs) {
        const sub_backup_path = path.join(subPath, CONSTS.SUBSCRIPTION_BACKUP_PATH);
        if (!fs.existsSync(sub_backup_path)) continue;

        try {
            const sub_backup = fs.readJSONSync(sub_backup_path)
            delete sub_backup['_id'];
            guessed_subs.push(sub_backup);
        } catch(err) {
            logger.warn(`Failed to reimport subscription in path ${subPath}`)
            logger.warn(err);
        }
    }

    return guessed_subs;
}

exports.TASKS = TASKS;