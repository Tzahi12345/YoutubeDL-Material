var moment = require('moment');
var Axios = require('axios');
var fs = require('fs-extra')
var path = require('path');
const config_api = require('./config');

async function getCommentsForVOD(clientID, vodId) {
    let url = `https://api.twitch.tv/v5/videos/${vodId}/comments?content_offset_seconds=0`,
        batch,
        cursor;

    let comments = null;

    try {
        do {
            batch = (await Axios.get(url, {
                headers: {
                    'Client-ID': clientID,
                    Accept: 'application/vnd.twitchtv.v5+json; charset=UTF-8',
                    'Content-Type': 'application/json; charset=UTF-8',
                }
            })).data;

            const str = batch.comments.map(c => {
                let {
                        created_at: msgCreated,
                        content_offset_seconds: timestamp,
                        commenter: {
                            name,
                            _id,
                            created_at: acctCreated
                        },
                        message: {
                            body: msg,
                            user_color: user_color
                        }
                    } = c;

                const timestamp_str = moment.duration(timestamp, 'seconds')
                    .toISOString()
                    .replace(/P.*?T(?:(\d+?)H)?(?:(\d+?)M)?(?:(\d+).*?S)?/,
                        (_, ...ms) => {
                            const seg = v => v ? v.padStart(2, '0') : '00';
                            return `${seg(ms[0])}:${seg(ms[1])}:${seg(ms[2])}`;
                        });

                acctCreated = moment(acctCreated).utc();
                msgCreated = moment(msgCreated).utc();

                if (!comments) comments = [];

                comments.push({
                    timestamp: timestamp,
                    timestamp_str: timestamp_str,
                    name: name,
                    message: msg,
                    user_color: user_color
                });
                // let line = `${timestamp},${msgCreated.format(tsFormat)},${name},${_id},"${msg.replace(/"/g, '""')}",${acctCreated.format(tsFormat)}`;
                // return line;
            }).join('\n');

            cursor = batch._next;
            url = `https://api.twitch.tv/v5/videos/${vodId}/comments?cursor=${cursor}`;
            await new Promise(res => setTimeout(res, 300));
        } while (cursor);
    } catch (err) {
        console.error(err);
    }

    return comments;
}

async function getTwitchChatByFileID(id, type, user_uid, uuid, sub) {
    let file_path = null;

    if (user_uid) {
        if (sub) {
            file_path = path.join('users', user_uid, 'subscriptions', sub.isPlaylist ? 'playlists' : 'channels', sub.name, id + '.twitch_chat.json');
        } else {
            file_path = path.join('users', user_uid, type, id + '.twitch_chat.json');
        }
    } else {
        if (sub) {
            file_path = path.join('subscriptions', sub.isPlaylist ? 'playlists' : 'channels', sub.name, id + '.twitch_chat.json');
        } else {
            file_path = path.join(type, id + '.twitch_chat.json');
        }
    }

    var chat_file = null;
    if (fs.existsSync(file_path)) {
        chat_file = fs.readJSONSync(file_path);
    }

    return chat_file;
}

async function downloadTwitchChatByVODID(vodId, id, type, user_uid, sub) {
    const twitch_api_key = config_api.getConfigItem('ytdl_twitch_api_key');
    const chat = await getCommentsForVOD(twitch_api_key, vodId);

    // save file if needed params are included
    let file_path = null;
    if (user_uid) {
        if (sub) {
            file_path = path.join('users', user_uid, 'subscriptions', sub.isPlaylist ? 'playlists' : 'channels', sub.name, id + '.twitch_chat.json');
        } else {
            file_path = path.join('users', user_uid, type, id + '.twitch_chat.json');
        }
    } else {
        if (sub) {
            file_path = path.join('subscriptions', sub.isPlaylist ? 'playlists' : 'channels', sub.name, id + '.twitch_chat.json');
        } else {
            file_path = path.join(type, id + '.twitch_chat.json');
        }
    }

    if (chat) fs.writeJSONSync(file_path, chat);

    return chat;
}

module.exports = {
    getCommentsForVOD: getCommentsForVOD,
    getTwitchChatByFileID: getTwitchChatByFileID,
    downloadTwitchChatByVODID: downloadTwitchChatByVODID
}