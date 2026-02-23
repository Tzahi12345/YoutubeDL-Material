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
    const safeVodId = path.basename(vodId);

    const is_windows = process.platform === 'win32';
    const cliExt = is_windows ? '.exe' : ''
    const cliPath = `TwitchDownloaderCLI${cliExt}`

    if (!commandExistsSync(cliPath)) {
        logger.error(`${cliPath} does not exist. Twitch chat download failed! Get it here: https://github.com/lay295/TwitchDownloader`);
        return null;
    }

    const result = await exec(`${cliPath} chatdownload -u ${safeVodId} -o appdata/${safeVodId}.json`, {stdio:[0,1,2]});

    if (result['stderr']) {
        logger.error(`Failed to download twitch comments for ${safeVodId}`);
        logger.error(result['stderr']);
        return null;
    }

    const temp_chat_path = path.join('appdata', `${safeVodId}.json`);
    const appdataBasePath = path.resolve('appdata');
    const resolvedTempChatPath = path.resolve(temp_chat_path);
    const relativeTempChatPath = path.relative(appdataBasePath, resolvedTempChatPath);
    if (relativeTempChatPath.startsWith('..') || path.isAbsolute(relativeTempChatPath)) {
        logger.error(`Refusing to access temporary twitch chat file outside appdata for ${safeVodId}`);
        return null;
    }

    const raw_json = fs.readJSONSync(resolvedTempChatPath);
    const new_json = raw_json.comments.map(comment_obj => {
        return {
            timestamp: comment_obj.content_offset_seconds,
            timestamp_str: convertTimestamp(comment_obj.content_offset_seconds),
            name: comment_obj.commenter.name,
            message: comment_obj.message.body,
            user_color: comment_obj.message.user_color
        }
    });

    fs.unlinkSync(resolvedTempChatPath);

    return new_json;
}

async function getTwitchChatByFileID(id, type, user_uid, uuid, sub) {
    const usersFileFolder = config_api.getConfigItem('ytdl_users_base_path');
    const subscriptionsFileFolder = config_api.getConfigItem('ytdl_subscriptions_base_path');
    let file_path = null;
    let base_path = null;
    const safeType = type === 'audio' || type === 'video' ? type : null;

    if (user_uid) {
        if (sub) {
            base_path = path.join(usersFileFolder, user_uid, 'subscriptions', sub.isPlaylist ? 'playlists' : 'channels');
            file_path = path.join(usersFileFolder, user_uid, 'subscriptions', sub.isPlaylist ? 'playlists' : 'channels', sub.name, `${id}.twitch_chat.json`);
        } else {
            if (!safeType) return null;
            base_path = path.join(usersFileFolder, user_uid, safeType);
            file_path = path.join(usersFileFolder, user_uid, safeType, `${id}.twitch_chat.json`);
        }
    } else {
        if (sub) {
            base_path = path.join(subscriptionsFileFolder, sub.isPlaylist ? 'playlists' : 'channels');
            file_path = path.join(subscriptionsFileFolder, sub.isPlaylist ? 'playlists' : 'channels', sub.name, `${id}.twitch_chat.json`);
        } else {
            if (!safeType) return null;
            const typeFolder = config_api.getConfigItem(`ytdl_${safeType}_folder_path`);
            base_path = typeFolder;
            file_path = path.join(typeFolder, `${id}.twitch_chat.json`);
        }
    }

    var chat_file = null;
    if (file_path && base_path) {
        const resolvedBasePath = path.resolve(base_path);
        const resolvedFilePath = path.resolve(file_path);
        const relativeFilePath = path.relative(resolvedBasePath, resolvedFilePath);
        if (relativeFilePath.startsWith('..') || path.isAbsolute(relativeFilePath)) {
            logger.error(`Refusing to read twitch chat outside expected directory for file id '${id}'.`);
            return null;
        }

        if (fs.existsSync(resolvedFilePath)) {
            chat_file = fs.readJSONSync(resolvedFilePath);
        }
    }

    return chat_file;
}

async function downloadTwitchChatByVODID(vodId, id, type, user_uid, sub, customFileFolderPath = null) {
    const usersFileFolder           = config_api.getConfigItem('ytdl_users_base_path');
    const subscriptionsFileFolder   = config_api.getConfigItem('ytdl_subscriptions_base_path');
    const chat = await getCommentsForVOD(vodId);

    // save file if needed params are included
    let file_path = null;
    let base_path = null;
    const safeType = type === 'audio' || type === 'video' ? type : null;
    if (customFileFolderPath) {
        base_path = customFileFolderPath;
        file_path = path.join(customFileFolderPath, `${id}.twitch_chat.json`)
    } else if (user_uid) {
        if (sub) {
            base_path = path.join(usersFileFolder, user_uid, 'subscriptions', sub.isPlaylist ? 'playlists' : 'channels');
            file_path = path.join(usersFileFolder, user_uid, 'subscriptions', sub.isPlaylist ? 'playlists' : 'channels', sub.name, `${id}.twitch_chat.json`);
        } else {
            if (!safeType) return null;
            base_path = path.join(usersFileFolder, user_uid, safeType);
            file_path = path.join(usersFileFolder, user_uid, safeType, `${id}.twitch_chat.json`);
        }
    } else {
        if (sub) {
            base_path = path.join(subscriptionsFileFolder, sub.isPlaylist ? 'playlists' : 'channels');
            file_path = path.join(subscriptionsFileFolder, sub.isPlaylist ? 'playlists' : 'channels', sub.name, `${id}.twitch_chat.json`);
        } else {
            if (!safeType) return null;
            const typeFolder = config_api.getConfigItem(`ytdl_${safeType}_folder_path`);
            base_path = typeFolder;
            file_path = path.join(typeFolder, `${id}.twitch_chat.json`);
        }
    }

    if (chat && file_path && base_path) {
        const resolvedBasePath = path.resolve(base_path);
        const resolvedFilePath = path.resolve(file_path);
        const relativeFilePath = path.relative(resolvedBasePath, resolvedFilePath);
        if (relativeFilePath.startsWith('..') || path.isAbsolute(relativeFilePath)) {
            logger.error(`Refusing to write twitch chat outside expected directory for file id '${id}'.`);
            return null;
        }
        fs.writeJSONSync(resolvedFilePath, chat);
    }

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
