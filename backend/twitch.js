const config_api = require('./config');
const logger = require('./logger');
const utils = require('./utils');

const moment = require('moment');
const fs = require('fs-extra')
const axios = require('axios');
const { EmoteFetcher } = require('@tzahi12345/twitch-emoticons');
const path = require('path');
const { promisify } = require('util');
const child_process = require('child_process');
const commandExistsSync = require('command-exists').sync;

exports.getCommentsForVOD = async (vodId) => {
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

exports.getTwitchChatByFileID = async (id, type, user_uid, uuid, sub) => {
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

exports.downloadTwitchChatByVODID = async (vodId, id, type, user_uid, sub, customFileFolderPath = null) => {
    const usersFileFolder           = config_api.getConfigItem('ytdl_users_base_path');
    const subscriptionsFileFolder   = config_api.getConfigItem('ytdl_subscriptions_base_path');
    const chat = await exports.getCommentsForVOD(vodId);

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

exports.downloadTwitchEmotes = async (channel_id, channel_name) => {
    const twitch_client_id          = config_api.getConfigItem('ytdl_twitch_client_id');
    const twitch_client_secret      = config_api.getConfigItem('ytdl_twitch_client_secret');

    const fetcher = new EmoteFetcher(twitch_client_id, twitch_client_secret);

    try {
        await Promise.all([
            fetcher.fetchTwitchEmotes(),
            fetcher.fetchTwitchEmotes(channel_id),
            fetcher.fetchBTTVEmotes(),
            fetcher.fetchBTTVEmotes(channel_id),
            // fetcher.fetchSevenTVEmotes(),
            // fetcher.fetchSevenTVEmotes(channel_id),
            fetcher.fetchFFZEmotes(),
            fetcher.fetchFFZEmotes(channel_id)
        ]);

        const channel_dir = path.join('appdata', 'emotes', channel_id);
        fs.ensureDirSync(channel_dir);
        
        const emotesJSON = [];
        let failed_emote_count = 0;
        for (const [, emote] of fetcher.emotes) {
            const emoteJSON = emote.toJSON();

            const ext = emote.imageType;
            const emote_path = path.join(channel_dir, `${emote.id}.${ext}`);

            if (fs.existsSync(emote_path)) continue;
            
            try {
                const link = emote.toLink();
                await utils.fetchFile(link, emote_path);
                emotesJSON.push(emoteJSON);
            } catch (err) {
                failed_emote_count++;
            }
        }
        if (failed_emote_count) logger.warn(`${failed_emote_count} emotes failed to download for channel ${channel_name}`);
        return emotesJSON;
    } catch (err) {
        logger.error(err);
        return null;
    }
}

exports.getTwitchOAuthToken = async (client_id, client_secret) => {
    const url = `https://id.twitch.tv/oauth2/token`;
  
    try {
        const response = await axios.post(url, {client_id: client_id, client_secret: client_secret, grant_type: 'client_credentials'});
        const token = response['data']['access_token'];
        if (token) return token;
    
        logger.error(`Failed to get token.`);
        return null;
    } catch (err) {
        logger.error(`Failed to get token.`);
        logger.error(err);
        return null;
    }
}

exports.getChannelID = async (username, client_id, oauth_token) => {
    const url = `https://api.twitch.tv/helix/users?login=${username}`;
    const headers = {
        'Client-ID': client_id,
        'Authorization': 'Bearer ' + oauth_token,
        Accept: 'application/vnd.twitchtv.v5+json; charset=UTF-8'
    };
  
    try {
        const response = await axios.get(url, {headers: headers});
        const data = response.data.data;
    
        if (data && data.length > 0) {
            const channelID = data[0].id;
            return channelID;
        }
    
        logger.error(`Failed to get channel ID for user ${username}`);
        if (data.error) logger.error(data.error);
        return null; // User not found
    } catch (err) {
        logger.error(`Failed to get channel ID for user ${username}`);
        logger.error(err);
    }
}

const convertTimestamp = (timestamp) => moment.duration(timestamp, 'seconds')
                    .toISOString()
                    .replace(/P.*?T(?:(\d+?)H)?(?:(\d+?)M)?(?:(\d+).*?S)?/,
                        (_, ...ms) => {
                            const seg = v => v ? v.padStart(2, '0') : '00';
                            return `${seg(ms[0])}:${seg(ms[1])}:${seg(ms[2])}`;
});
