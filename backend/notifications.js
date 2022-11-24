const utils = require('./utils');
const logger = require('./logger');
const db_api = require('./db');

exports.sendNotification = async () => {
    // TODO: hook into third party service

    const notification = {}

    await db_api.insertRecordIntoTable('notifications', notification);

    return notification;
}