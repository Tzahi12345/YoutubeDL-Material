const db_api = require('./db');
const config_api = require('./config');
const logger = require('./logger');
const utils = require('./utils');
const consts = require('./consts');

const { v4: uuid } = require('uuid');

const fetch = require('node-fetch');
const { gotify } = require("gotify");
const TelegramBotAPI = require('node-telegram-bot-api');
let telegram_bot = null;
const REST = require('@discordjs/rest').REST;
const API = require('@discordjs/core').API;
const EmbedBuilder = require('@discordjs/builders').EmbedBuilder;

const NOTIFICATION_TYPE_TO_TITLE = {
    task_finished: 'Task finished',
    download_complete: 'Download complete',
    download_error: 'Download error'
}

const NOTIFICATION_TYPE_TO_BODY = {
    task_finished: (notification) => notification['data']['task_title'],
    download_complete: (notification) => {return `${notification['data']['file_title']}\nOriginal URL: ${notification['data']['original_url']}`},
    download_error: (notification) => {return `Error: ${notification['data']['download_error_message']}\nError code: ${notification['data']['download_error_type']}\n\nOriginal URL: ${notification['data']['download_url']}`}
}

const NOTIFICATION_TYPE_TO_URL = {
    task_finished: () => {return `${utils.getBaseURL()}/#/tasks`},
    download_complete: (notification) => {return `${utils.getBaseURL()}/#/player;uid=${notification['data']['file_uid']}`},
    download_error: () => {return `${utils.getBaseURL()}/#/downloads`},
}

const NOTIFICATION_TYPE_TO_THUMBNAIL = {
    task_finished: () => null,
    download_complete: (notification) => notification['data']['file_thumbnail'],
    download_error: () => null
}

exports.sendNotification = async (notification) => {
    // info necessary if we are using 3rd party APIs
    const type = notification['type'];

    const data = {
        title: NOTIFICATION_TYPE_TO_TITLE[type],
        body: NOTIFICATION_TYPE_TO_BODY[type](notification),
        type: type,
        url: NOTIFICATION_TYPE_TO_URL[type](notification),
        thumbnail: NOTIFICATION_TYPE_TO_THUMBNAIL[type](notification)
    }

    if (config_api.getConfigItem('ytdl_use_ntfy_API') && config_api.getConfigItem('ytdl_ntfy_topic_url')) {
        sendNtfyNotification(data);
    }
    if (config_api.getConfigItem('ytdl_use_gotify_API') && config_api.getConfigItem('ytdl_gotify_server_url') && config_api.getConfigItem('ytdl_gotify_app_token')) {
        sendGotifyNotification(data);
    }
    if (config_api.getConfigItem('ytdl_use_telegram_API') && config_api.getConfigItem('ytdl_telegram_bot_token') && config_api.getConfigItem('ytdl_telegram_chat_id')) {
        exports.sendTelegramNotification(data);
    }
    if (config_api.getConfigItem('ytdl_webhook_url')) {
        sendGenericNotification(data);
    }
    if (config_api.getConfigItem('ytdl_discord_webhook_url')) {
        sendDiscordNotification(data);
    }
    if (config_api.getConfigItem('ytdl_slack_webhook_url')) {
        sendSlackNotification(data);
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
    const data = {file_uid: file.uid, file_title: file.title, file_thumbnail: file.thumbnailURL, original_url: file.url};
    const notification = exports.createNotification('download_complete', ['play'], data, user_uid);
    return await exports.sendNotification(notification);
}

exports.sendDownloadErrorNotification = async (download, user_uid, error_message, error_type = null) => {
    if (!notificationEnabled('download_error')) return;
    const data = {download_uid: download.uid, download_url: download.url, download_error_message: error_message, download_error_type: error_type};
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

// ntfy

function sendNtfyNotification({body, title, type, url, thumbnail}) {
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

// Gotify

async function sendGotifyNotification({body, title, type, url, thumbnail}) {
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

// Telegram

setupTelegramBot();
config_api.config_updated.subscribe(change => {
    const use_telegram_api = config_api.getConfigItem('ytdl_use_telegram_API');
    const bot_token = config_api.getConfigItem('ytdl_telegram_bot_token');
    if (!use_telegram_api || !bot_token) return;
    if (!change) return;
    if (change['key'] === 'ytdl_use_telegram_API' || change['key'] === 'ytdl_telegram_bot_token' || change['key'] === 'ytdl_telegram_webhook_proxy') {
        logger.debug('Telegram bot setting up');
        setupTelegramBot();
    }
});

async function setupTelegramBot() {
    const use_telegram_api = config_api.getConfigItem('ytdl_use_telegram_API');
    const bot_token = config_api.getConfigItem('ytdl_telegram_bot_token');
    if (!use_telegram_api || !bot_token) return;
    
    telegram_bot = new TelegramBotAPI(bot_token);
    const webhook_proxy = config_api.getConfigItem('ytdl_telegram_webhook_proxy');
    const webhook_url = webhook_proxy ? webhook_proxy : `${utils.getBaseURL()}/api/telegramRequest`;
    telegram_bot.setWebHook(webhook_url);
}

exports.sendTelegramNotification = async ({body, title, type, url, thumbnail}) => {
    if (!telegram_bot){
        logger.error('Telegram bot not found!');
        return;
    }

    const chat_id = config_api.getConfigItem('ytdl_telegram_chat_id');
    if (!chat_id){
        logger.error('Telegram chat ID required!');
        return;
    }
    
    logger.verbose('Sending notification to Telegram');
    if (thumbnail) await telegram_bot.sendPhoto(chat_id, thumbnail);
    telegram_bot.sendMessage(chat_id, `<b>${title}</b>\n\n${body}\n<a href="${url}">${url}</a>`, {parse_mode: 'HTML'});
}

// Discord

async function sendDiscordNotification({body, title, type, url, thumbnail}) {
    const discord_webhook_url = config_api.getConfigItem('ytdl_discord_webhook_url');
    const url_split = discord_webhook_url.split('webhooks/');
    const [webhook_id, webhook_token] = url_split[1].split('/');
    const rest = new REST({ version: '10' });
    const api = new API(rest);
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(0x00FFFF)
        .setURL(url)
        .setDescription(`ID: ${type}`);
    if (thumbnail) embed.setThumbnail(thumbnail);
    if (type === 'download_error') embed.setColor(0xFC2003);

    const result = await api.webhooks.execute(webhook_id, webhook_token, {
        content: body,
        username: 'YoutubeDL-Material',
        avatar_url: consts.ICON_URL,
        embeds: [embed],
    });
    return result;
}

// Slack

function sendSlackNotification({body, title, type, url, thumbnail}) {
    const slack_webhook_url = config_api.getConfigItem('ytdl_slack_webhook_url');
    logger.verbose(`Sending slack notification to ${slack_webhook_url}`);
    const data = {
        blocks: [
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*${title}*`
                }
            },
            {
                type: "section",
                text: {
                    type: "plain_text",
                    text: body
                }
            }
        ]
    }

    // add thumbnail if exists
    if (thumbnail) {
        data['blocks'].push({
            type: "image",
            image_url: thumbnail,
            alt_text: "notification_thumbnail"
        });
    }

    data['blocks'].push(
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: `<${url}|${url}>`
            }
        },
        {
            type: "context",
            elements: [
                {
                    type: "mrkdwn",
                    text: `*ID:* ${type}`
                }
            ]
        }
    );

    fetch(slack_webhook_url, {
        method: 'POST',
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data),
    });
}

// Generic

function sendGenericNotification(data) {
    const webhook_url = config_api.getConfigItem('ytdl_webhook_url');
    logger.verbose(`Sending generic notification to ${webhook_url}`);
    fetch(webhook_url, {
        method: 'POST',
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data),
    });
}