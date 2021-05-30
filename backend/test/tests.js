var assert = require('assert');
const low = require('lowdb')
var winston = require('winston');

process.chdir('./backend')

const FileSync = require('lowdb/adapters/FileSync');

const adapter = new FileSync('./appdata/db.json');
const db = low(adapter)

const users_adapter = new FileSync('./appdata/users.json');
const users_db = low(users_adapter);

const defaultFormat = winston.format.printf(({ level, message, label, timestamp }) => {
    return `${timestamp} ${level.toUpperCase()}: ${message}`;
});

let debugMode = process.env.YTDL_MODE === 'debug';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.timestamp(), defaultFormat),
    defaultMeta: {},
    transports: [
      //
      // - Write to all logs with level `info` and below to `combined.log`
      // - Write all logs error (and below) to `error.log`.
      //
      new winston.transports.File({ filename: 'appdata/logs/error.log', level: 'error' }),
      new winston.transports.File({ filename: 'appdata/logs/combined.log' }),
      new winston.transports.Console({level: !debugMode ? 'info' : 'debug', name: 'console'})
    ]
});

var auth_api = require('../authentication/auth');
var db_api = require('../db');
const utils = require('../utils');
const subscriptions_api = require('../subscriptions');
const fs = require('fs-extra');

db_api.initialize(db, users_db, logger);
auth_api.initialize(db, users_db, logger);
subscriptions_api.initialize(db, users_db, logger, db_api);

describe('Multi User', async function() {
    let user = null;
    const user_to_test = 'admin';
    const sub_to_test = 'dc834388-3454-41bf-a618-e11cb8c7de1c';
    const playlist_to_test = 'ysabVZz4x';
    before(async function() {
        user = await auth_api.login('admin', 'pass');
        console.log('hi')
    });
    describe('Authentication', function() {
        it('login', async function() {
            assert(user);
        });
    });
    describe('Video player - normal', function() {
        const video_to_test = 'ebbcfffb-d6f1-4510-ad25-d1ec82e0477e';
        it('Get video', async function() {
            const video_obj = db_api.getVideo(video_to_test, 'admin');
            assert(video_obj);
        });

        it('Video access - disallowed', async function() {
            await db_api.setVideoProperty(video_to_test, {sharingEnabled: false}, user_to_test);
            const video_obj = auth_api.getUserVideo('admin', video_to_test, true);
            assert(!video_obj);
        });

        it('Video access - allowed', async function() {
            await db_api.setVideoProperty(video_to_test, {sharingEnabled: true}, user_to_test);
            const video_obj = auth_api.getUserVideo('admin', video_to_test, true);
            assert(video_obj);
        });
    });
    describe('Zip generators', function() {
        it('Playlist zip generator', async function() {
            const playlist = await db_api.getPlaylist(playlist_to_test, user_to_test);
            assert(playlist);
            const playlist_files_to_download = [];
            for (let i = 0; i < playlist['uids'].length; i++) {
                const uid = playlist['uids'][i];
                const playlist_file = await db_api.getVideo(uid, user_to_test);
                playlist_files_to_download.push(playlist_file);
            }
            const zip_path = await utils.createContainerZipFile(playlist, playlist_files_to_download);
            const zip_exists = fs.pathExistsSync(zip_path);
            assert(zip_exists);
            if (zip_exists) fs.unlinkSync(zip_path);
        });

        it('Subscription zip generator', async function() {
            const sub = subscriptions_api.getSubscription(sub_to_test, user_to_test);
            assert(sub);
            const sub_files_to_download = [];
            for (let i = 0; i < sub['videos'].length; i++) {
                const sub_file = sub['videos'][i];
                sub_files_to_download.push(sub_file);
            }
            const zip_path = await utils.createContainerZipFile(sub, sub_files_to_download);
            const zip_exists = fs.pathExistsSync(zip_path);
            assert(zip_exists);
            if (zip_exists) fs.unlinkSync(zip_path);
        });
    });
    // describe('Video player - subscription', function() {
    //     const sub_to_test = '';
    //     const video_to_test = 'ebbcfffb-d6f1-4510-ad25-d1ec82e0477e';
    //     it('Get video', async function() {
    //         const video_obj = db_api.getVideo(video_to_test, 'admin', );
    //         assert(video_obj);
    //     });

    //     it('Video access - disallowed', async function() {
    //         await db_api.setVideoProperty(video_to_test, {sharingEnabled: false}, user_to_test, sub_to_test);
    //         const video_obj = auth_api.getUserVideo('admin', video_to_test, true);
    //         assert(!video_obj);
    //     });

    //     it('Video access - allowed', async function() {
    //         await db_api.setVideoProperty(video_to_test, {sharingEnabled: true}, user_to_test, sub_to_test);
    //         const video_obj = auth_api.getUserVideo('admin', video_to_test, true);
    //         assert(video_obj);
    //     });
    // });
    
});