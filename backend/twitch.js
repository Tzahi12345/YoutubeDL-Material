var moment = require('moment');
var Axios = require('axios');

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

module.exports = {
    getCommentsForVOD: getCommentsForVOD
}