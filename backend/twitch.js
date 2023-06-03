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

let auth_timeout = null;
let cached_oauth = null;

exports.ensureTwitchAuth = async () => {
    const TIMEOUT_MARGIN_MS = 60*1000;
    const twitch_client_id          = config_api.getConfigItem('ytdl_twitch_client_id');
    const twitch_client_secret      = config_api.getConfigItem('ytdl_twitch_client_secret');
    if (cached_oauth && auth_timeout && (Date.now() - TIMEOUT_MARGIN_MS) < auth_timeout) return cached_oauth;

    const {token, expires_in} = await exports.getTwitchOAuthToken(twitch_client_id, twitch_client_secret);
    cached_oauth = token;
    auth_timeout = Date.now() + expires_in;
    return token;
}

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

exports.getTwitchEmotes = async (file_uid) => {
    const emotes_path = path.join('appdata', 'emotes', file_uid, 'emotes.json')
    if (!fs.existsSync(emotes_path)) return null;
    const emote_objs = fs.readJSONSync(emotes_path);
    // inject custom url
    for (const emote_obj of emote_objs) {
        emote_obj.custom_url = `${utils.getBaseURL()}/api/emote/${file_uid}/${emote_obj.id}.${emote_obj.ext}`
    }
    return emote_objs;
}

exports.downloadTwitchEmotes = async (channel_name, file_uid) => {
    const twitch_client_id          = config_api.getConfigItem('ytdl_twitch_client_id');
    const twitch_client_secret      = config_api.getConfigItem('ytdl_twitch_client_secret');

    const channel_id = await exports.getChannelID(channel_name);

    const fetcher = new EmoteFetcher(twitch_client_id, twitch_client_secret);

    try {
        await Promise.allSettled([
            fetcher.fetchTwitchEmotes(),
            fetcher.fetchTwitchEmotes(channel_id),
            fetcher.fetchBTTVEmotes(),
            fetcher.fetchBTTVEmotes(channel_id),
            fetcher.fetchSevenTVEmotes(),
            fetcher.fetchSevenTVEmotes(channel_id),
            fetcher.fetchFFZEmotes(),
            fetcher.fetchFFZEmotes(channel_id)
        ]);

        const emotes_dir = path.join('appdata', 'emotes', file_uid);
        const emote_json_path = path.join(emotes_dir, `emotes.json`);
        fs.ensureDirSync(emotes_dir);

        const emote_objs = [];
        let failed_emote_count = 0;
        for (const [, emote] of fetcher.emotes) {
            const emote_obj = emote.toObject();

            const ext = emote.imageType;
            const emote_image_path = path.join(emotes_dir, `${emote.id}.${ext}`);
            
            try {
                const link = emote.toLink();
                if (!fs.existsSync(emote_image_path)) await utils.fetchFile(link, emote_image_path);
                emote_obj['ext'] = ext;
                emote_objs.push(emote_obj);
            } catch (err) {
                failed_emote_count++;
            }
        }
        if (failed_emote_count) logger.warn(`${failed_emote_count} emotes failed to download for channel ${channel_name}`);
        await fs.writeJSON(emote_json_path, emote_objs);
        return emote_objs;
    } catch (err) {
        logger.error(err);
        return null;
    }
}

exports.getTwitchOAuthToken = async (client_id, client_secret) => {
    logger.verbose('Generating new Twitch auth token');
    const url = `https://id.twitch.tv/oauth2/token`;
  
    try {
        const response = await axios.post(url, {client_id: client_id, client_secret: client_secret, grant_type: 'client_credentials'});
        const token = response['data']['access_token'];
        const expires_in = response['data']['expires_in'];
        if (token) return {token, expires_in};
    
        logger.error(`Failed to get token.`);
        return null;
    } catch (err) {
        logger.error(`Failed to get token.`);
        logger.error(err);
        return null;
    }
}

exports.getChannelID = async (channel_name) => {
    const twitch_client_id          = config_api.getConfigItem('ytdl_twitch_client_id');
    const token                     = await exports.ensureTwitchAuth();
    const url = `https://api.twitch.tv/helix/users?login=${channel_name}`;
    const headers = {
        'Client-ID': twitch_client_id,
        'Authorization': 'Bearer ' + token,
        // Accept: 'application/vnd.twitchtv.v5+json; charset=UTF-8'
    };
  
    try {
        const response = await axios.get(url, {headers: headers});
        const data = response.data.data;
    
        if (data && data.length > 0) {
            const channelID = data[0].id;
            return channelID;
        }
    
        logger.error(`Failed to get channel ID for user ${channel_name}`);
        if (data.error) logger.error(data.error);
        return null; // User not found
    } catch (err) {
        logger.error(`Failed to get channel ID for user ${channel_name}`);
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
