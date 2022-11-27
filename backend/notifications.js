const { uuid } = require('uuidv4');
const db_api = require('./db');

exports.sendNotification = async (notification) => {
    // TODO: hook into third party service
    await db_api.insertRecordIntoTable('notifications', notification);
    return notification;
}

exports.sendDownloadNotification = async (file, user_uid) => {
    const data = {file_uid: file.uid, file_title: file.title};
    const notification = exports.createNotification('download_complete', ['play'], data, user_uid);
    return await exports.sendNotification(notification);
}

exports.sendDownloadErrorNotification = async (download, user_uid) => {
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
