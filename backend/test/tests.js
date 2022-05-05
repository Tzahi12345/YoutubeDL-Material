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
      new winston.transports.Console({level: 'debug', name: 'console'})
    ]
});

var auth_api = require('../authentication/auth');
var db_api = require('../db');
const utils = require('../utils');
const subscriptions_api = require('../subscriptions');
const fs = require('fs-extra');
const { uuid } = require('uuidv4');

db_api.initialize(db, users_db);


describe('Database', async function() {
    describe('Import', async function() {
        it('Migrate', async function() {
            await db_api.connectToDB();
            await db_api.removeAllRecords();
            const success = await db_api.importJSONToDB(db.value(), users_db.value());
            assert(success);
        });

        it('Transfer to remote', async function() {
            await db_api.removeAllRecords('test');
            await db_api.insertRecordIntoTable('test', {test: 'test'});

            await db_api.transferDB(true);
            const success = await db_api.getRecord('test', {test: 'test'});
            assert(success);
        });

        it('Transfer to local', async function() {
            await db_api.connectToDB();
            await db_api.removeAllRecords('test');
            await db_api.insertRecordIntoTable('test', {test: 'test'});

            await db_api.transferDB(false);
            const success = await db_api.getRecord('test', {test: 'test'});
            assert(success);
        });

        it('Restore db', async function() {
            const db_stats = await db_api.getDBStats();
            
            const file_name = await db_api.backupDB();
            await db_api.restoreDB(file_name);

            const new_db_stats = await db_api.getDBStats();

            assert(JSON.stringify(db_stats), JSON.stringify(new_db_stats));
        });
    });

    describe('Export', function() {

    });


    describe('Basic functions', async function() {
        beforeEach(async function() {
            await db_api.connectToDB();
            await db_api.removeAllRecords('test');
        });
        it('Add and read record', async function() {
            this.timeout(120000);
            await db_api.insertRecordIntoTable('test', {test_add: 'test', test_undefined: undefined, test_null: undefined});
            const added_record = await db_api.getRecord('test', {test_add: 'test', test_undefined: undefined, test_null: null});
            assert(added_record['test_add'] === 'test');
            await db_api.removeRecord('test', {test_add: 'test'});
        });

        it('Find duplicates by key', async function() {
            const test_duplicates = [
                {
                    test: 'testing',
                    key: '1'
                },
                {
                    test: 'testing',
                    key: '2'
                },
                {
                    test: 'testing_missing',
                    key: '3'
                },
                {
                    test: 'testing',
                    key: '4'
                }
            ];
            await db_api.insertRecordsIntoTable('test', test_duplicates);
            const duplicates = await db_api.findDuplicatesByKey('test', 'test');
            console.log(duplicates);
        });

        it('Update record', async function() {
            await db_api.insertRecordIntoTable('test', {test_update: 'test'});
            await db_api.updateRecord('test', {test_update: 'test'}, {added_field: true});
            const updated_record = await db_api.getRecord('test', {test_update: 'test'});
            assert(updated_record['added_field']);
            await db_api.removeRecord('test', {test_update: 'test'});
        });

        it('Remove record', async function() {
            await db_api.insertRecordIntoTable('test', {test_remove: 'test'});
            const delete_succeeded = await db_api.removeRecord('test', {test_remove: 'test'});
            assert(delete_succeeded);
            const deleted_record = await db_api.getRecord('test', {test_remove: 'test'});
            assert(!deleted_record);
        });

        it('Push to record array', async function() {
            await db_api.insertRecordIntoTable('test', {test: 'test', test_array: []});
            await db_api.pushToRecordsArray('test', {test: 'test'}, 'test_array', 'test_item');
            const record = await db_api.getRecord('test', {test: 'test'});
            assert(record);
            assert(record['test_array'].length === 1);
        });

        it('Pull from record array', async function() {
            await db_api.insertRecordIntoTable('test', {test: 'test', test_array: ['test_item']});
            await db_api.pullFromRecordsArray('test', {test: 'test'}, 'test_array', 'test_item');
            const record = await db_api.getRecord('test', {test: 'test'});
            assert(record);
            assert(record['test_array'].length === 0);
        });

        it('Bulk add', async function() {
            this.timeout(120000);
            const NUM_RECORDS_TO_ADD = 2002; // max batch ops is 1000
            const test_records = [];
            for (let i = 0; i < NUM_RECORDS_TO_ADD; i++) {
                test_records.push({
                    uid: uuid()
                });
            }
            const succcess = await db_api.bulkInsertRecordsIntoTable('test', test_records);

            const received_records = await db_api.getRecords('test');
            assert(succcess && received_records && received_records.length === NUM_RECORDS_TO_ADD);
        });

        it('Bulk update', async function() {
            // bulk add records
            const NUM_RECORDS_TO_ADD = 100; // max batch ops is 1000
            const test_records = [];
            const update_obj = {};
            for (let i = 0; i < NUM_RECORDS_TO_ADD; i++) {
                const test_uid =  uuid();
                test_records.push({
                    uid: test_uid
                });
                update_obj[test_uid] = {added_field: true};
            }
            let success = await db_api.bulkInsertRecordsIntoTable('test', test_records);
            assert(success);

            // makes sure they are added
            const received_records = await db_api.getRecords('test');
            assert(received_records && received_records.length === NUM_RECORDS_TO_ADD);

            success = await db_api.bulkUpdateRecords('test', 'uid', update_obj);
            assert(success);

            const received_updated_records = await db_api.getRecords('test');
            for (let i = 0; i < received_updated_records.length; i++) {
                success &= received_updated_records[i]['added_field'];
            }
            assert(success);
        });

        it('Stats', async function() {
            const stats = await db_api.getDBStats();
            assert(stats);
        });

        it('Query speed', async function() {
            this.timeout(120000); 
            const NUM_RECORDS_TO_ADD = 300004; // max batch ops is 1000
            const test_records = [];
            let random_uid = '06241f83-d1b8-4465-812c-618dfa7f2943';
            for (let i = 0; i < NUM_RECORDS_TO_ADD; i++) {
                const uid = uuid();
                if (i === NUM_RECORDS_TO_ADD/2) random_uid = uid;
                test_records.push({"id":"A$AP Mob - Yamborghini High (Official Music Video) ft. Juicy J","title":"A$AP Mob - Yamborghini High (Official Music Video) ft. Juicy J","thumbnailURL":"https://i.ytimg.com/vi/tt7gP_IW-1w/maxresdefault.jpg","isAudio":true,"duration":312,"url":"https://www.youtube.com/watch?v=tt7gP_IW-1w","uploader":"asapmobVEVO","size":5060157,"path":"audio\\A$AP Mob - Yamborghini High (Official Music Video) ft. Juicy J.mp3","upload_date":"2016-05-11","description":"A$AP Mob ft. Juicy J  - \"Yamborghini High\" Get it now on:\niTunes: http://smarturl.it/iYAMH?IQid=yt\nListen on Spotify: http://smarturl.it/sYAMH?IQid=yt\nGoogle Play: http://smarturl.it/gYAMH?IQid=yt\nAmazon:  http://smarturl.it/aYAMH?IQid=yt\n\nFollow A$AP Mob:\nhttps://www.facebook.com/asapmobofficial\nhttps://twitter.com/ASAPMOB\nhttp://instagram.com/asapmob \nhttp://www.asapmob.com/\n\n#AsapMob #YamborghiniHigh #Vevo #HipHop #OfficialMusicVideo #JuicyJ","view_count":118689353,"height":null,"abr":160,"uid": uid,"registered":1626672120632});
            }
            const insert_start = Date.now();
            let success = await db_api.bulkInsertRecordsIntoTable('test', test_records);
            const insert_end = Date.now();

            console.log(`Insert time: ${(insert_end - insert_start)/1000}s`);

            const query_start = Date.now();
            const random_record = await db_api.getRecord('test', {uid: random_uid});
            const query_end = Date.now();

            console.log(random_record)

            console.log(`Query time: ${(query_end - query_start)/1000}s`);

            success = !!random_record;

            assert(success);
        });
    });
});

describe('Multi User', async function() {
    let user = null;
    const user_to_test = 'admin';
    const sub_to_test = 'dc834388-3454-41bf-a618-e11cb8c7de1c';
    const playlist_to_test = 'ysabVZz4x';
    beforeEach(async function() {
        await db_api.connectToDB();
        auth_api.initialize(db_api, logger);
        subscriptions_api.initialize(db_api, logger);
        user = await auth_api.login('admin', 'pass');
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
            const sub = await subscriptions_api.getSubscription(sub_to_test, user_to_test);
            const sub_videos = await db_api.getRecords('files', {sub_id: sub.id});
            assert(sub);
            const sub_files_to_download = [];
            for (let i = 0; i < sub_videos.length; i++) {
                const sub_file = sub_videos[i];
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
    
describe('Downloader', function() {
    const downloader_api = require('../downloader');
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const sub_id = 'dc834388-3454-41bf-a618-e11cb8c7de1c';
    const options = {
        ui_uid: uuid(),
        user: 'admin'
    }

    beforeEach(async function() {
        await db_api.connectToDB();
        await db_api.removeAllRecords('download_queue');
    });

    it('Get file info', async function() {

    });

    it('Download file', async function() {
        this.timeout(300000); 
        const returned_download = await downloader_api.createDownload(url, 'video', options);
        console.log(returned_download);
        await utils.wait(20000);

    });

    it('Queue file', async function() {
        this.timeout(300000); 
        const returned_download = await downloader_api.createDownload(url, 'video', options);
        console.log(returned_download);
        await utils.wait(20000);
    });

    it('Pause file', async function() {

    });

    it('Generate args', async function() {
        const args = await downloader_api.generateArgs(url, 'video', options);
        console.log(args);
    });

    it('Generate args - subscription', async function() {
        subscriptions_api.initialize(db_api, logger);
        const sub = await subscriptions_api.getSubscription(sub_id);
        const sub_options = subscriptions_api.generateOptionsForSubscriptionDownload(sub, 'admin');
        const args = await downloader_api.generateArgs(url, 'video', sub_options, 'admin');
        console.log(args);
    });

    it('Generate kodi NFO file', async function() {
        const nfo_file_path = './test/sample.nfo';
        if (fs.existsSync(nfo_file_path)) {
            fs.unlinkSync(nfo_file_path);
        }
        const sample_json = fs.readJSONSync('./test/sample.info.json');
        downloader_api.generateNFOFile(sample_json, nfo_file_path);
        assert(fs.existsSync(nfo_file_path), true);
        fs.unlinkSync(nfo_file_path);
    });

    it('Inject args', async function() {
        const original_args1 = ['--no-resize-buffer', '-o', '%(title)s', '--no-mtime'];
        const new_args1 = ['--age-limit', '25', '--yes-playlist', '--abort-on-error', '-o', '%(id)s'];
        const updated_args1 = utils.injectArgs(original_args1, new_args1);
        const expected_args1 = ['--no-resize-buffer', '--no-mtime', '--age-limit', '25', '--yes-playlist', '--abort-on-error', '-o', '%(id)s'];
        assert(JSON.stringify(updated_args1), JSON.stringify(expected_args1));

        const original_args2 = ['-o', '%(title)s.%(ext)s', '--write-info-json', '--print-json', '--audio-quality', '0', '-x', '--audio-format', 'mp3'];
        const new_args2 =  ['--add-metadata', '--embed-thumbnail', '--convert-thumbnails', 'jpg'];
        const updated_args2 = utils.injectArgs(original_args2, new_args2);
        const expected_args2 =  ['-o', '%(title)s.%(ext)s', '--write-info-json', '--print-json', '--audio-quality', '0', '-x', '--audio-format', 'mp3', '--add-metadata', '--embed-thumbnail', '--convert_thumbnails', 'jpg'];
        console.log(updated_args2);
        assert(JSON.stringify(updated_args2), JSON.stringify(expected_args2));
    });
});

describe('Tasks', function() {
    const tasks_api = require('../tasks');
    beforeEach(async function() {
        await db_api.connectToDB();
        await db_api.removeAllRecords('tasks');

        const dummy_task = {
            run: async () => { await utils.wait(500); return true; },
            confirm: async () => { await utils.wait(500); return true; },
            title: 'Dummy task',
            job: null
        };
        tasks_api.TASKS['dummy_task'] = dummy_task;

        await tasks_api.initialize();
    });
    it('Backup db', async function() {
        const backups_original = await utils.recFindByExt('appdata', 'bak');
        const original_length = backups_original.length;
        await tasks_api.executeTask('backup_local_db');
        const backups_new = await utils.recFindByExt('appdata', 'bak');
        const new_length = backups_new.length;
        assert(original_length, new_length-1);
    });

    it('Check for missing files', async function() {
        await db_api.removeAllRecords('files', {uid: 'test'});
        const test_missing_file = {uid: 'test', path: 'test/missing_file.mp4'};
        await db_api.insertRecordIntoTable('files', test_missing_file);
        await tasks_api.executeTask('missing_files_check');
        const task_obj = await db_api.getRecord('tasks', {key: 'missing_files_check'});
        assert(task_obj['data'] && task_obj['data']['uids'] && task_obj['data']['uids'].length >= 1, true);
    });

    it('Check for duplicate files', async function() {
        this.timeout(300000);
        await db_api.removeAllRecords('files', {uid: 'test1'});
        await db_api.removeAllRecords('files', {uid: 'test2'});
        const test_duplicate_file1 = {uid: 'test1', path: 'test/missing_file.mp4'};
        const test_duplicate_file2 = {uid: 'test2', path: 'test/missing_file.mp4'};
        const test_duplicate_file3 = {uid: 'test3', path: 'test/missing_file.mp4'};
        await db_api.insertRecordIntoTable('files', test_duplicate_file1);
        await db_api.insertRecordIntoTable('files', test_duplicate_file2);
        await db_api.insertRecordIntoTable('files', test_duplicate_file3);
        await tasks_api.executeTask('duplicate_files_check');
        const task_obj = await db_api.getRecord('tasks', {key: 'duplicate_files_check'});
        const duplicated_record_count = await db_api.getRecords('files', {path: 'test/missing_file.mp4'}, true);
        assert(task_obj['data'] && task_obj['data']['uids'] && task_obj['data']['uids'].length >= 1, true);
        assert(duplicated_record_count == 1, true);
    });

    it('Import unregistered files', async function() {
        this.timeout(300000);

        // pre-test cleanup
        await db_api.removeAllRecords('files', {title: 'Sample File'});
        if (fs.existsSync('video/sample.info.json')) fs.unlinkSync('video/sample.info.json');
        if (fs.existsSync('video/sample.mp4'))       fs.unlinkSync('video/sample.mp4');

        // copies in files
        fs.copyFileSync('test/sample.info.json', 'video/sample.info.json');
        fs.copyFileSync('test/sample.mp4', 'video/sample.mp4');
        await tasks_api.executeTask('missing_db_records');
        const imported_file = await db_api.getRecord('files', {title: 'Sample File'});
        assert(!!imported_file, true);
        
        // post-test cleanup
        if (fs.existsSync('video/sample.info.json')) fs.unlinkSync('video/sample.info.json');
        if (fs.existsSync('video/sample.mp4'))       fs.unlinkSync('video/sample.mp4');
    });

    it('Schedule and cancel task', async function() {
        const today_4_hours = new Date();
        today_4_hours.setHours(today_4_hours.getHours() + 4);
        await tasks_api.updateTaskSchedule('dummy_task', today_4_hours);
        assert(!!tasks_api.TASKS['dummy_task']['job'], true);
        await tasks_api.updateTaskSchedule('dummy_task', null);
        assert(!!tasks_api.TASKS['dummy_task']['job'], false);
    });

    it('Schedule and run task', async function() {
        this.timeout(5000);
        const today_1_second = new Date();
        today_1_second.setSeconds(today_1_second.getSeconds() + 1);
        await tasks_api.updateTaskSchedule('dummy_task', today_1_second);
        assert(!!tasks_api.TASKS['dummy_task']['job'], true);
        await utils.wait(2000);
        const dummy_task_obj = await db_api.getRecord('tasks', {key: 'dummy_task'});
        assert(dummy_task_obj['data'], true);
    });
});