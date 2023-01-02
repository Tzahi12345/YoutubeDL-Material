const db_api = require('./db');
const config_api = require('./config');
const logger = require('./logger');
const utils = require('./utils');

const { uuid } = require('uuidv4');
const fetch = require('node-fetch');
const { gotify } = require("gotify");

const NOTIFICATION_TYPE_TO_TITLE = {
    task_finished: 'Task finished',
    download_complete: 'Download complete',
    download_error: 'Download error'
}

const NOTIFICATION_TYPE_TO_BODY = {
    task_finished: (notification) => notification['data']['task_title'],
    download_complete: (notification) => notification['data']['file_title'],
    download_error: (notification) => notification['data']['download_url']
}

const NOTIFICATION_TYPE_TO_URL = {
    task_finished: () => {return `${utils.getBaseURL()}/#/tasks`},
    download_complete: (notification) => {return `${utils.getBaseURL()}/#/player;uid=${notification['data']['file_uid']}`},
    download_error: () => {return `${utils.getBaseURL()}/#/tasks`},
}

const NOTIFICATION_TYPE_TO_THUMBNAIL = {
    download_complete: (notification) => notification['data']['file_thumbnail']
}

exports.sendNotification = async (notification) => {
    // info necessary if we are using 3rd party APIs
    const type = notification['type'];
    const title = NOTIFICATION_TYPE_TO_TITLE[type];
    const body = NOTIFICATION_TYPE_TO_BODY[type](notification);
    const url = NOTIFICATION_TYPE_TO_URL[type](notification);
    const thumbnail = NOTIFICATION_TYPE_TO_THUMBNAIL[type](notification);

    if (config_api.getConfigItem('ytdl_use_ntfy_API') && config_api.getConfigItem('ytdl_ntfy_topic_url')) {
        sendNtfyNotification(body, title, type, url, thumbnail);
    }
    if (config_api.getConfigItem('ytdl_use_gotify_API') && config_api.getConfigItem('ytdl_gotify_server_url') && config_api.getConfigItem('ytdl_gotify_app_token')) {
        sendGotifyNotification(body, title, type, url, thumbnail);
    }
    await db_api.insertRecordIntoTable('notifications', notification);
    return notification;
}

exports.sendTaskNotification = async (task_obj, confirmed) => {
    if (!notificationEnabled('task_finished')) return;
    // workaround for tasks which are user_uid agnostic
    const user_uid = config_api.getConfigItem('ytdl_multi_user_mode') ? 'admin' : null;
    await db_api.removeAllRecords('notifications', {"data.task_key": task_obj.key});
    const data = {task_key: task_obj.key, task_title: task_obj.title, confirmed: confirmed};
    const notification = exports.createNotification('task_finished', ['view_tasks'], data, user_uid);
    return await exports.sendNotification(notification);
}

exports.sendDownloadNotification = async (file, user_uid) => {
    if (!notificationEnabled('download_complete')) return;
    const data = {file_uid: file.uid, file_title: file.title, file_thumbnail: file.thumbnailURL};
    const notification = exports.createNotification('download_complete', ['play'], data, user_uid);
    return await exports.sendNotification(notification);
}

exports.sendDownloadErrorNotification = async (download, user_uid) => {
    if (!notificationEnabled('download_error')) return;
    const data = {download_uid: download.uid, download_url: download.url};
    const notification = exports.createNotification('download_error', ['view_download_error', 'retry_download'], data, user_uid);
    return await exports.sendNotification(notification);
}

exports.createNotification = (type, actions, data, user_uid) => {
    const notification = {
        type: type,
        actions: actions,
        data: data,
        user_uid: user_uid,
        uid: uuid(),
        read: false,
        timestamp: Date.now()/1000
    }
    return notification;
}

function notificationEnabled(type) {
    return config_api.getConfigItem('ytdl_enable_notifications') && (config_api.getConfigItem('ytdl_enable_all_notifications') || config_api.getConfigItem('ytdl_allowed_notification_types').includes(type));
}

function sendNtfyNotification(body, title, type, url, thumbnail) {
    logger.verbose('Sending notification to ntfy');
    fetch(config_api.getConfigItem('ytdl_ntfy_topic_url'), {
        method: 'POST',
        body: body,
        headers: {
            'Title': title,
            'Tags': type,
            'Click': url,
            'Attach': thumbnail
        }
    });
}

async function sendGotifyNotification(body, title, type, url, thumbnail) {
    logger.verbose('Sending notification to gotify');
    await gotify({
        server: config_api.getConfigItem('ytdl_gotify_server_url'),
        app: config_api.getConfigItem('ytdl_gotify_app_token'),
        title: title,
        message: body,
        tag: type,
        priority: 5, // Keeping default from docs, may want to change this,
        extras: {
            "client::notification": {
                click: { url: url },
                bigImageUrl: thumbnail
            }
        }
      });
}