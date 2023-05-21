const config_api = require('./config');
const logger = require('./logger');

const moment = require('moment');
const fs = require('fs-extra')
const path = require('path');
const { promisify } = require('util');
const child_process = require('child_process');
const commandExistsSync = require('command-exists').sync;

async function getCommentsForVOD(vodId) {
    const exec = promisify(child_process.exec);
    
    // Reject invalid params to prevent command injection attack
    if (!vodId.match(/^[0-9a-z]+$/)) {
        logger.error('VOD ID must be purely alphanumeric. Twitch chat download failed!');
        return null;
    }

    const is_windows = process.platform === 'win32';
    const cliExt = is_windows ? '.exe' : ''
    const cliPath = `TwitchDownloaderCLI${cliExt}`

    if (!commandExistsSync(cliPath)) {
        logger.error(`${cliPath} does not exist. Twitch chat download failed! Get it here: https://github.com/lay295/TwitchDownloader`);
        return null;
    }

    const result = await exec(`${cliPath} chatdownload -u ${vodId} -o appdata/${vodId}.json`, {stdio:[0,1,2]});

    if (result['stderr']) {
        logger.error(`Failed to download twitch comments for ${vodId}`);
        logger.error(result['stderr']);
        return null;
    }

    const temp_chat_path = path.join('appdata', `${vodId}.json`);

    const raw_json = fs.readJSONSync(temp_chat_path);
    const new_json = raw_json.comments.map(comment_obj => {
        return {
            timestamp: comment_obj.content_offset_seconds,
            timestamp_str: convertTimestamp(comment_obj.content_offset_seconds),
            name: comment_obj.commenter.name,
            message: comment_obj.message.body,
            user_color: comment_obj.message.user_color
        }
    });

    fs.unlinkSync(temp_chat_path);

    return new_json;
}

async function getTwitchChatByFileID(id, type, user_uid, uuid, sub) {
    const usersFileFolder = config_api.getConfigItem('ytdl_users_base_path');
    const subscriptionsFileFolder = config_api.getConfigItem('ytdl_subscriptions_base_path');
    let file_path = null;

    if (user_uid) {
        if (sub) {
            file_path = path.join(usersFileFolder, user_uid, 'subscriptions', sub.isPlaylist ? 'playlists' : 'channels', sub.name, `${id}.twitch_chat.json`);
        } else {
            file_path = path.join(usersFileFolder, user_uid, type, `${id}.twitch_chat.json`);
        }
    } else {
        if (sub) {
            file_path = path.join(subscriptionsFileFolder, sub.isPlaylist ? 'playlists' : 'channels', sub.name, `${id}.twitch_chat.json`);
        } else {
            const typeFolder = config_api.getConfigItem(`ytdl_${type}_folder_path`);
            file_path = path.join(typeFolder, `${id}.twitch_chat.json`);
        }
    }

    var chat_file = null;
    if (fs.existsSync(file_path)) {
        chat_file = fs.readJSONSync(file_path);
    }

    return chat_file;
}

async function downloadTwitchChatByVODID(vodId, id, type, user_uid, sub, customFileFolderPath = null) {
    const usersFileFolder           = config_api.getConfigItem('ytdl_users_base_path');
    const subscriptionsFileFolder   = config_api.getConfigItem('ytdl_subscriptions_base_path');
    const chat = await getCommentsForVOD(vodId);

    // save file if needed params are included
    let file_path = null;
    if (customFileFolderPath) {
        file_path = path.join(customFileFolderPath, `${id}.twitch_chat.json`)
    } else if (user_uid) {
        if (sub) {
            file_path = path.join(usersFileFolder, user_uid, 'subscriptions', sub.isPlaylist ? 'playlists' : 'channels', sub.name, `${id}.twitch_chat.json`);
        } else {
            file_path = path.join(usersFileFolder, user_uid, type, `${id}.twitch_chat.json`);
        }
    } else {
        if (sub) {
            file_path = path.join(subscriptionsFileFolder, sub.isPlaylist ? 'playlists' : 'channels', sub.name, `${id}.twitch_chat.json`);
        } else {
            file_path = path.join(type, `${id}.twitch_chat.json`);
        }
    }

    if (chat) fs.writeJSONSync(file_path, chat);

    return chat;
}

const convertTimestamp = (timestamp) => moment.duration(timestamp, 'seconds')
                    .toISOString()
                    .replace(/P.*?T(?:(\d+?)H)?(?:(\d+?)M)?(?:(\d+).*?S)?/,
                        (_, ...ms) => {
                            const seg = v => v ? v.padStart(2, '0') : '00';
                            return `${seg(ms[0])}:${seg(ms[1])}:${seg(ms[2])}`;
});

module.exports = {
    getCommentsForVOD: getCommentsForVOD,
    getTwitchChatByFileID: getTwitchChatByFileID,
    downloadTwitchChatByVODID: downloadTwitchChatByVODID
}