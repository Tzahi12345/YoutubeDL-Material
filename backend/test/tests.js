/* eslint-disable no-undef */
const assert = require('assert');
const low = require('lowdb')
const winston = require('winston');
const path = require('path');
const util = require('util');
const fs = require('fs-extra');
const { v4: uuid } = require('uuid');
const NodeID3 = require('node-id3');
const exec = util.promisify(require('child_process').exec);

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
const archive_api = require('../archive');
const categories_api = require('../categories');
const files_api = require('../files');
const youtubedl_api = require('../youtube-dl');
const config_api = require('../config');
const CONSTS = require('../consts');

db_api.initialize(db, users_db, 'local_db_test.json');

const sample_video_json = {
    id: "Sample Video",
    title: "Sample Video",
    thumbnailURL: "https://sampleurl.jpg",
    isAudio: false,
    duration: 177.413,
    url: "sampleurl.com",
    uploader: "Sample Uploader",
    size: 2838445,
    path: "users\\admin\\video\\Sample Video.mp4",
    upload_date: "2017-07-28",
    description: null,
    view_count: 230,
    abr: 128,
    thumbnailPath: null,
    user_uid: "admin",
    uid: "1ada04ab-2773-4dd4-bbdd-3e2d40761c50",
    registered: 1628469039377
}

describe('Database', async function() {
    describe.skip('Import', async function() {
        // it('Migrate', async function() {
        //     // await db_api.connectToDB();
        //     await db_api.removeAllRecords();
        //     const success = await db_api.importJSONToDB(db.value(), users_db.value());
        //     assert(success);
        // });

        it('Transfer to remote', async function() {
            await db_api.removeAllRecords('test');
            await db_api.insertRecordIntoTable('test', {test: 'test'});

            await db_api.transferDB(true);
            const success = await db_api.getRecord('test', {test: 'test'});
            assert(success);
        });

        it('Transfer to local', async function() {
            // await db_api.connectToDB();
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

    describe('Basic functions', async function() {
        
        // test both local_db and remote_db
        const local_db_modes = [false, true];

        for (const local_db_mode of local_db_modes) {
            let use_local_db = local_db_mode;
            const describe_skippable = use_local_db ? describe : describe.skip;
            describe_skippable(`Use local DB - ${use_local_db}`, async function() {
                beforeEach(async function() {
                    if (!use_local_db) {
                        this.timeout(120000);
                        await db_api.connectToDB(0);
                    }
                    await db_api.removeAllRecords('test');
                });
                it('Add and read record', async function() {
                    this.timeout(120000);
                    await db_api.insertRecordIntoTable('test', {test_add: 'test', test_undefined: undefined, test_null: undefined});
                    const added_record = await db_api.getRecord('test', {test_add: 'test', test_undefined: undefined, test_null: null});
                    assert(added_record['test_add'] === 'test');
                    await db_api.removeRecord('test', {test_add: 'test'});
                });
                it('Add and read record - Nested property', async function() {
                    this.timeout(120000);
                    await db_api.insertRecordIntoTable('test', {test_add: 'test', test_nested: {test_key1: 'test1', test_key2: 'test2'}});
                    const added_record = await db_api.getRecord('test', {test_add: 'test', 'test_nested.test_key1': 'test1', 'test_nested.test_key2': 'test2'});
                    const not_added_record = await db_api.getRecord('test', {test_add: 'test', 'test_nested.test_key1': 'test1', 'test_nested.test_key2': 'test3'});
                    assert(added_record['test_add'] === 'test');
                    assert(!not_added_record);
                    await db_api.removeRecord('test', {test_add: 'test'});
                });
                it('Replace filter', async function() {
                    this.timeout(120000);
                    await db_api.insertRecordIntoTable('test', {test_replace_filter: 'test', test_nested: {test_key1: 'test1', test_key2: 'test2'}}, {test_nested: {test_key1: 'test1', test_key2: 'test2'}});
                    await db_api.insertRecordIntoTable('test', {test_replace_filter: 'test', test_nested: {test_key1: 'test1', test_key2: 'test2'}}, {test_nested: {test_key1: 'test1', test_key2: 'test2'}});
                    const count = await db_api.getRecords('test', {test_replace_filter: 'test'}, true);
                    assert(count === 1);
                    await db_api.removeRecord('test', {test_replace_filter: 'test'});
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
                    assert(duplicates && duplicates.length === 2 && duplicates[0]['key'] === '2' && duplicates[1]['key'] === '4')
                });

                it('Update record', async function() {
                    await db_api.insertRecordIntoTable('test', {test_update: 'test'});
                    await db_api.updateRecord('test', {test_update: 'test'}, {added_field: true});
                    const updated_record = await db_api.getRecord('test', {test_update: 'test'});
                    assert(updated_record['added_field']);
                    await db_api.removeRecord('test', {test_update: 'test'});
                });

                it('Update records', async function() {
                    await db_api.insertRecordIntoTable('test', {test_update: 'test', key: 'test1'});
                    await db_api.insertRecordIntoTable('test', {test_update: 'test', key: 'test2'});
                    await db_api.updateRecords('test', {test_update: 'test'}, {added_field: true});
                    const updated_records = await db_api.getRecords('test', {added_field: true});
                    assert(updated_records.length === 2);
                    await db_api.removeRecord('test', {test_update: 'test'});
                });

                it('Remove property from record', async function() {
                    await db_api.insertRecordIntoTable('test', {test_keep: 'test', test_remove: 'test'});
                    await db_api.removePropertyFromRecord('test', {test_keep: 'test'}, {test_remove: true});
                    const updated_record = await db_api.getRecord('test', {test_keep: 'test'});
                    assert(updated_record['test_keep']);
                    assert(!updated_record['test_remove']);
                    await db_api.removeRecord('test', {test_keep: 'test'});
                });

                it('Remove record', async function() {
                    await db_api.insertRecordIntoTable('test', {test_remove: 'test'});
                    const delete_succeeded = await db_api.removeRecord('test', {test_remove: 'test'});
                    assert(delete_succeeded);
                    const deleted_record = await db_api.getRecord('test', {test_remove: 'test'});
                    assert(!deleted_record);
                });

                it('Remove records', async function() {
                    await db_api.insertRecordIntoTable('test', {test_remove: 'test', test_property: 'test'});
                    await db_api.insertRecordIntoTable('test', {test_remove: 'test', test_property: 'test2'});
                    await db_api.insertRecordIntoTable('test', {test_remove: 'test'});
                    const delete_succeeded = await db_api.removeAllRecords('test', {test_remove: 'test'});
                    assert(delete_succeeded);
                    const count = await db_api.getRecords('test', {test_remove: 'test'}, true);
                    assert(count === 0);
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

                    success = await db_api.bulkUpdateRecordsByKey('test', 'uid', update_obj);
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

                it.skip('Query speed', async function() {
                    this.timeout(120000); 
                    const NUM_RECORDS_TO_ADD = 300004; // max batch ops is 1000
                    const test_records = [];
                    let random_uid = '06241f83-d1b8-4465-812c-618dfa7f2943';
                    for (let i = 0; i < NUM_RECORDS_TO_ADD; i++) {
                        const uid = uuid();
                        if (i === NUM_RECORDS_TO_ADD/2) random_uid = uid;
                        test_records.push({"id":"RandomTextRandomText","title":"RandomTextRandomTextRandomTextRandomTextRandomTextRandomTextRandomTextRandomText","thumbnailURL":"https://i.ytimg.com/vi/randomurl/maxresdefault.jpg","isAudio":true,"duration":312,"url":"https://www.youtube.com/watch?v=randomvideo","uploader":"randomUploader","size":5060157,"path":"audio\\RandomTextRandomText.mp3","upload_date":"2016-05-11","description":"RandomTextRandomTextRandomTextRandomTextRandomTextRandomTextRandomTextRandomTextRandomTextRandomTextRandomTextRandomText","view_count":118689353,"height":null,"abr":160,"uid": uid,"registered":1626672120632});
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
        }
    });

    describe('Local DB Filters', async function() {
        it('Basic', async function() {
            const result = db_api.applyFilterLocalDB([{test: 'test'}, {test: 'test1'}], {test: 'test'}, 'find');
            assert(result && result['test'] === 'test');
        });

        it('Regex', async function() {
            const filter = {$regex: `\\w+\\d`, $options: 'i'};
            const result = db_api.applyFilterLocalDB([{test: 'test'}, {test: 'test1'}], {test: filter}, 'find');
            assert(result && result['test'] === 'test1');
        });

        it('Not equals', async function() {
            const filter = {$ne: 'test'};
            const result = db_api.applyFilterLocalDB([{test: 'test'}, {test: 'test1'}], {test: filter}, 'find');
            assert(result && result['test'] === 'test1');
        });

        it('Nested', async function() {
            const result = db_api.applyFilterLocalDB([{test1: {test2: 'test3'}}, {test4: 'test5'}], {'test1.test2': 'test3'}, 'find');
            assert(result && result['test1']['test2'] === 'test3');
        });
    })
});

describe('Multi User', async function() {
    this.timeout(120000);
    const user_to_test = 'test_user';
    const user_password = 'test_pass';
    const sub_to_test = '';
    const playlist_to_test = '';
    beforeEach(async function() {
        // await db_api.connectToDB();
        await auth_api.deleteUser(user_to_test);
    });
    describe('Basic', function() {
        it('Register', async function() {
            const user = await auth_api.registerUser(user_to_test, user_to_test, user_password);
            assert(user);
        });
        it('Login', async function() {
            await auth_api.registerUser(user_to_test, user_to_test, user_password);
            const user = await auth_api.login(user_to_test, user_password);
            assert(user);
        });
    });
    describe('Video player - normal', async function() {
        beforeEach(async function() {
            await db_api.removeRecord('files', {uid: sample_video_json['uid']});
            await db_api.insertRecordIntoTable('files', sample_video_json);
        });
        const video_to_test = sample_video_json['uid'];
        it('Get video', async function() {
            const video_obj = await files_api.getVideo(video_to_test);
            assert(video_obj);
        });

        it('Video access - disallowed', async function() {
            await db_api.setVideoProperty(video_to_test, {sharingEnabled: false});
            const video_obj = await auth_api.getUserVideo(user_to_test, video_to_test, true);
            assert(!video_obj);
        });

        it('Video access - allowed', async function() {
            await db_api.setVideoProperty(video_to_test, {sharingEnabled: true}, user_to_test);
            const video_obj = await auth_api.getUserVideo(user_to_test, video_to_test, true);
            assert(video_obj);
        });
    });
    describe.skip('Zip generators', function() {
        it('Playlist zip generator', async function() {
            const playlist = await files_api.getPlaylist(playlist_to_test, user_to_test);
            assert(playlist);
            const playlist_files_to_download = [];
            for (let i = 0; i < playlist['uids'].length; i++) {
                const uid = playlist['uids'][i];
                const playlist_file = await files_api.getVideo(uid, user_to_test);
                playlist_files_to_download.push(playlist_file);
            }
            const zip_path = await utils.createContainerZipFile(playlist, playlist_files_to_download);
            const zip_exists = fs.pathExistsSync(zip_path);
            assert(zip_exists);
            if (zip_exists) fs.unlinkSync(zip_path);
        });

        it('Subscription zip generator', async function() {
            const sub = await subscriptions_api.getSubscription(sub_to_test.id, user_to_test);
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
    //         const video_obj = files_api.getVideo(video_to_test, 'admin', );
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
    const url = 'https://www.youtube.com/watch?v=hpigjnKl7nI';
    const playlist_url = 'https://www.youtube.com/playlist?list=PLbZT16X07RLhqK-ZgSkRuUyiz9B_WLdNK';
    const sub_id = 'dc834388-3454-41bf-a618-e11cb8c7de1c';
    const options = {
        ui_uid: uuid()
    }

    async function createCategory(url) {
        // get info
        const args = await downloader_api.generateArgs(url, 'video', options, null, true);
        const [info] = await downloader_api.getVideoInfoByURL(url, args);

        // create category
        await db_api.removeAllRecords('categories');
        const new_category = {
            name: 'test_category',
            uid: uuid(),
            rules: [],
            custom_output: ''
        };
        await db_api.insertRecordIntoTable('categories', new_category);
        await db_api.pushToRecordsArray('categories', {name: 'test_category'}, 'rules', {
            preceding_operator: null,
            comparator: 'includes',
            property: 'title',
            value: info['title']
        });
    }

    before(async function() {
        const update_available = await youtubedl_api.checkForYoutubeDLUpdate();
        if (update_available) await youtubedl_api.updateYoutubeDL(update_available);
        config_api.setConfigItem('ytdl_max_concurrent_downloads', 0);
    });

    beforeEach(async function() {
        // await db_api.connectToDB();
        await db_api.removeAllRecords('download_queue');
        config_api.setConfigItem('ytdl_allow_playlist_categorization', true);
    });

    it('Get file info', async function() {
        this.timeout(300000);
        const info = await downloader_api.getVideoInfoByURL(url);
        assert(!!info && info.length > 0);
    });

    it('Download file', async function() {
        this.timeout(300000);
        await downloader_api.setupDownloads();
        const args = await downloader_api.generateArgs(url, 'video', options, null, true);
        const [info] = await downloader_api.getVideoInfoByURL(url, args);
        if (fs.existsSync(info['_filename'])) fs.unlinkSync(info['_filename']);
        const returned_download = await downloader_api.createDownload(url, 'video', options);
        assert(returned_download);
        const custom_download_method = async (url, args, options, callback) => {
            fs.writeJSONSync(utils.getTrueFileName(info['_filename'], 'video', '.info.json'), info);
            await generateEmptyVideoFile(info['_filename']);
            return await callback(null, [JSON.stringify(info)]);
        }
        const success = await downloader_api.downloadQueuedFile(returned_download['uid'], custom_download_method);
        assert(success);
    });

    it('Downloader - categorize', async function() {
        this.timeout(300000);
        await createCategory(url);
        // collect info
        const returned_download = await downloader_api.createDownload(url, 'video', options);
        await downloader_api.collectInfo(returned_download['uid']);
        assert(returned_download['category']);
        assert(returned_download['category']['name'] === 'test_category');
    });

    it('Downloader - categorize playlist', async function() {
        this.timeout(300000);
        await createCategory(playlist_url);
        // collect info
        const returned_download_pass = await downloader_api.createDownload(playlist_url, 'video', options);
        await downloader_api.collectInfo(returned_download_pass['uid']);
        assert(returned_download_pass['category']);
        assert(returned_download_pass['category']['name'] === 'test_category');

        // test with playlist categorization disabled
        config_api.setConfigItem('ytdl_allow_playlist_categorization', false);
        const returned_download_fail = await downloader_api.createDownload(playlist_url, 'video', options);
        await downloader_api.collectInfo(returned_download_fail['uid']);
        assert(!returned_download_fail['category']);
    });

    it('Tag file', async function() {
        const success = await generateEmptyAudioFile('test/sample_mp3.mp3');
        const audio_path = './test/sample_mp3.mp3';
        const sample_json = fs.readJSONSync('./test/sample_mp3.info.json');
        const tags = {
            title: sample_json['title'],
            artist: sample_json['artist'] ? sample_json['artist'] : sample_json['uploader'],
            TRCK: '27'
        }
        NodeID3.write(tags, audio_path);
        const written_tags = NodeID3.read(audio_path);
        assert(success && written_tags['raw']['TRCK'] === '27');
    });

    it('Queue file', async function() {
        this.timeout(300000); 
        const returned_download = await downloader_api.createDownload(url, 'video', options, null, null, null, null, true);
        assert(returned_download);
    });

    it('Pause file', async function() {
        const returned_download = await downloader_api.createDownload(url, 'video', options);
        await downloader_api.pauseDownload(returned_download['uid']);
        const updated_download = await db_api.getRecord('download_queue', {uid: returned_download['uid']});
        assert(updated_download['paused'] && !updated_download['running']);
    });

    it('Generate args', async function() {
        const args = await downloader_api.generateArgs(url, 'video', options);
        assert(args.length > 0);
    });

    it.skip('Generate args - subscription', async function() {
        const sub = await subscriptions_api.getSubscription(sub_id);
        const sub_options = subscriptions_api.generateOptionsForSubscriptionDownload(sub, 'admin');
        const args_normal = await downloader_api.generateArgs(url, 'video', options);
        const args_sub = await downloader_api.generateArgs(url, 'video', sub_options, 'admin');
        console.log(JSON.stringify(args_normal) !== JSON.stringify(args_sub));
    });

    it('Generate kodi NFO file', async function() {
        const nfo_file_path = './test/sample.nfo';
        if (fs.existsSync(nfo_file_path)) {
            fs.unlinkSync(nfo_file_path);
        }
        const sample_json = fs.readJSONSync('./test/sample_mp4.info.json');
        downloader_api.generateNFOFile(sample_json, nfo_file_path);
        assert(fs.existsSync(nfo_file_path), true);
        fs.unlinkSync(nfo_file_path);
    });

    it('Inject args', async function() {
        const original_args1 = ['--no-resize-buffer', '-o', '%(title)s', '--no-mtime'];
        const new_args1 = ['--age-limit', '25', '--yes-playlist', '--abort-on-error', '-o', '%(id)s'];
        const updated_args1 = utils.injectArgs(original_args1, new_args1);
        const expected_args1 = ['--no-resize-buffer', '--no-mtime', '--age-limit', '25', '--yes-playlist', '--abort-on-error', '-o', '%(id)s'];
        assert(JSON.stringify(updated_args1) === JSON.stringify(expected_args1));

        const original_args2 = ['-o', '%(title)s.%(ext)s', '--write-info-json', '--print-json', '--audio-quality', '0', '-x', '--audio-format', 'mp3'];
        const new_args2 =  ['--add-metadata', '--embed-thumbnail', '--convert-thumbnails', 'jpg'];
        const updated_args2 = utils.injectArgs(original_args2, new_args2);
        const expected_args2 =  ['-o', '%(title)s.%(ext)s', '--write-info-json', '--print-json', '--audio-quality', '0', '-x', '--audio-format', 'mp3', '--add-metadata', '--embed-thumbnail', '--convert-thumbnails', 'jpg'];
        assert(JSON.stringify(updated_args2) === JSON.stringify(expected_args2));

        const original_args3 = ['-o', '%(title)s.%(ext)s'];
        const new_args3 =  ['--min-filesize','1'];
        const updated_args3 = utils.injectArgs(original_args3, new_args3);
        const expected_args3 =  ['-o', '%(title)s.%(ext)s', '--min-filesize', '1'];
        assert(JSON.stringify(updated_args3) === JSON.stringify(expected_args3));
    });
    describe('Twitch', async function () {
        const twitch_api = require('../twitch');
        const example_vod = '1790315420';
        it('Download VOD chat', async function() {
            this.timeout(300000);
            if (!fs.existsSync('TwitchDownloaderCLI')) {
                try {
                    await exec('sh ../docker-utils/fetch-twitchdownloader.sh');
                    fs.copyFileSync('../docker-utils/TwitchDownloaderCLI', 'TwitchDownloaderCLI');
                } catch (e) {
                    logger.info('TwitchDownloaderCLI fetch failed, file may exist regardless.');
                }
            }
            const sample_path = path.join('test', 'sample.twitch_chat.json');
            if (fs.existsSync(sample_path)) fs.unlinkSync(sample_path);
            await twitch_api.downloadTwitchChatByVODID(example_vod, 'sample', null, null, null, './test');
            assert(fs.existsSync(sample_path));

            // cleanup
            if (fs.existsSync(sample_path)) fs.unlinkSync(sample_path);
        });
    });
});

describe('youtube-dl', async function() {
    beforeEach(async function () {
        if (fs.existsSync(CONSTS.DETAILS_BIN_PATH)) fs.unlinkSync(CONSTS.DETAILS_BIN_PATH);
        await youtubedl_api.checkForYoutubeDLUpdate();
    });
    it('Check latest version', async function() {
        this.timeout(300000);
        const original_fork = config_api.getConfigItem('ytdl_default_downloader');
        const latest_version = await youtubedl_api.getLatestUpdateVersion(original_fork);
        assert(latest_version > CONSTS.OUTDATED_YOUTUBEDL_VERSION);
    });

    it('Update youtube-dl', async function() {
        this.timeout(300000);
        const original_fork = config_api.getConfigItem('ytdl_default_downloader');
        const binary_path = path.join('test', 'test_binary');
        for (const youtubedl_fork in youtubedl_api.youtubedl_forks) {
            config_api.setConfigItem('ytdl_default_downloader', youtubedl_fork);
            const latest_version = await youtubedl_api.checkForYoutubeDLUpdate();
            await youtubedl_api.updateYoutubeDL(latest_version, binary_path);
            assert(fs.existsSync(binary_path));
            if (fs.existsSync(binary_path)) fs.unlinkSync(binary_path);
        }
        config_api.setConfigItem('ytdl_default_downloader', original_fork);
    });

    it('Run process', async function() {
        this.timeout(300000);
        const downloader_api = require('../downloader');
        const url = 'https://www.youtube.com/watch?v=hpigjnKl7nI';
        const args = await downloader_api.generateArgs(url, 'video', {}, null, true);
        const {child_process} = await youtubedl_api.runYoutubeDL(url, args);
        assert(child_process);
    });
});

describe('Subscriptions', function() {
    const new_sub = {
        name: 'test_sub',
        url: 'https://www.youtube.com/channel/UCzofo-P8yMMCOv8rsPfIR-g',
        maxQuality: null,
        id: uuid(),
        user_uid: null,
        type: 'video',
        paused: true
    };
    beforeEach(async function() {
        await db_api.removeAllRecords('subscriptions');
    });
    it('Subscribe', async function () {
        const success = await subscriptions_api.subscribe(new_sub, null, true);
        assert(success);
        const sub_exists = await db_api.getRecord('subscriptions', {id: new_sub['id']});
        assert(sub_exists);
    });
    it('Unsubscribe', async function () {
        await subscriptions_api.subscribe(new_sub, null, true);
        await subscriptions_api.unsubscribe(new_sub);
        const sub_exists = await db_api.getRecord('subscriptions', {id: new_sub['id']});
        assert(!sub_exists);
    });
    it('Delete subscription file', async function () {
        
    });
    it('Get subscription by name', async function () {
        await subscriptions_api.subscribe(new_sub, null, true);
        const sub_by_name = await subscriptions_api.getSubscriptionByName('test_sub');
        assert(sub_by_name);
    });
    it('Get subscriptions', async function() {
        await subscriptions_api.subscribe(new_sub, null, true);
        const subs = await subscriptions_api.getSubscriptions(null);
        assert(subs && subs.length === 1);
    });
    it('Update subscription', async function () {
        await subscriptions_api.subscribe(new_sub, null, true);
        const sub_update = Object.assign({}, new_sub, {name: 'updated_name'});
        await subscriptions_api.updateSubscription(sub_update);
        const updated_sub = await db_api.getRecord('subscriptions', {id: new_sub['id']});
        assert(updated_sub['name'] === 'updated_name');
    });
    it('Update subscription property', async function () {
        await subscriptions_api.subscribe(new_sub, null, true);
        const sub_update = Object.assign({}, new_sub, {name: 'updated_name'});
        await subscriptions_api.updateSubscriptionPropertyMultiple([sub_update], {name: 'updated_name'});
        const updated_sub = await db_api.getRecord('subscriptions', {id: new_sub['id']});
        assert(updated_sub['name'] === 'updated_name');
    });
    it('Write subscription metadata', async function() {
        const metadata_path = path.join('subscriptions', 'channels', 'test_sub', 'subscription_backup.json');
        if (fs.existsSync(metadata_path)) fs.unlinkSync(metadata_path);
        await subscriptions_api.subscribe(new_sub, null, true);
        assert(fs.existsSync(metadata_path));
    });
    it('Fresh uploads', async function() {

    });
});

describe('Tasks', function() {
    const tasks_api = require('../tasks');
    beforeEach(async function() {
        // await db_api.connectToDB();
        await db_api.removeAllRecords('tasks');

        const dummy_task = {
            run: async () => { await utils.wait(500); return true; },
            confirm: async () => { await utils.wait(500); return true; },
            title: 'Dummy task',
            job: null
        };
        tasks_api.TASKS['dummy_task'] = dummy_task;

        await tasks_api.setupTasks();
    });
    it('Backup db', async function() {
        const backups_original = await utils.recFindByExt('appdata', 'bak');
        const original_length = backups_original.length;
        await tasks_api.executeTask('backup_local_db');
        const backups_new = await utils.recFindByExt('appdata', 'bak');
        const new_length = backups_new.length;
        assert(original_length === new_length-1);
    });

    it('Check for missing files', async function() {
        this.timeout(300000);
        await db_api.removeAllRecords('files', {uid: 'test'});
        const test_missing_file = {uid: 'test', path: 'test/missing_file.mp4'};
        await db_api.insertRecordIntoTable('files', test_missing_file);
        await tasks_api.executeTask('missing_files_check');
        const missing_file_db_record = await db_api.getRecord('files', {uid: 'test'});
        assert(!missing_file_db_record);
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

        await tasks_api.executeRun('duplicate_files_check');
        const task_obj = await db_api.getRecord('tasks', {key: 'duplicate_files_check'});
        assert(task_obj['data'] && task_obj['data']['uids'] && task_obj['data']['uids'].length >= 1, true);

        await tasks_api.executeTask('duplicate_files_check');
        const duplicated_record_count = await db_api.getRecords('files', {path: 'test/missing_file.mp4'}, true);
        assert(duplicated_record_count === 1);
    });

    it('Import unregistered files', async function() {
        this.timeout(300000);

        const success = await generateEmptyVideoFile('test/sample_mp4.mp4');

        // pre-test cleanup
        await db_api.removeAllRecords('files', {path: 'test/missing_file.mp4'});
        if (fs.existsSync('video/sample_mp4.info.json')) fs.unlinkSync('video/sample_mp4.info.json');
        if (fs.existsSync('video/sample_mp4.mp4'))       fs.unlinkSync('video/sample_mp4.mp4');

        // copies in files
        fs.copyFileSync('test/sample_mp4.info.json', 'video/sample_mp4.info.json');
        fs.copyFileSync('test/sample_mp4.mp4', 'video/sample_mp4.mp4');
        await tasks_api.executeTask('missing_db_records');
        const imported_file = await db_api.getRecord('files', {title: 'Sample File'});
        assert(success && !!imported_file);
        
        // post-test cleanup
        if (fs.existsSync('video/sample_mp4.info.json')) fs.unlinkSync('video/sample_mp4.info.json');
        if (fs.existsSync('video/sample_mp4.mp4'))       fs.unlinkSync('video/sample_mp4.mp4');
    });

    it('Schedule and cancel task', async function() {
        this.timeout(5000);
        const today_one_year = new Date();
        today_one_year.setFullYear(today_one_year.getFullYear() + 1);
        const schedule_obj = {
            type: 'timestamp',
            data: { timestamp: today_one_year.getTime() }
        }
        await tasks_api.updateTaskSchedule('dummy_task', schedule_obj);
        const dummy_task = await db_api.getRecord('tasks', {key: 'dummy_task'});
        assert(!!tasks_api.TASKS['dummy_task']['job']);
        assert(!!dummy_task['schedule']);

        await tasks_api.updateTaskSchedule('dummy_task', null);
        const dummy_task_updated = await db_api.getRecord('tasks', {key: 'dummy_task'});
        assert(!tasks_api.TASKS['dummy_task']['job']);
        assert(!dummy_task_updated['schedule']);
    });

    it('Schedule and run task', async function() {
        this.timeout(5000);
        const today_1_second = new Date();
        today_1_second.setSeconds(today_1_second.getSeconds() + 1);
        const schedule_obj = {
            type: 'timestamp',
            data: { timestamp: today_1_second.getTime() }
        }
        await tasks_api.updateTaskSchedule('dummy_task', schedule_obj);
        assert(!!tasks_api.TASKS['dummy_task']['job']);
        await utils.wait(2000);
        const dummy_task_obj = await db_api.getRecord('tasks', {key: 'dummy_task'});
        assert(dummy_task_obj['data']);
    });
});

describe('Archive', async function() {
    beforeEach(async function() {
        // await db_api.connectToDB();
        await db_api.removeAllRecords('archives');
    });

    afterEach(async function() {
        await db_api.removeAllRecords('archives');
    });

    it('Import archive', async function() {
        const archive_text = `
            testextractor1 testing1
            testextractor1 testing2
            testextractor2 testing1
            testextractor1 testing3

        `;
        const count = await archive_api.importArchiveFile(archive_text, 'video', 'test_user', 'test_sub');
        assert(count === 4)
        const archive_items = await db_api.getRecords('archives', {user_uid: 'test_user', sub_id: 'test_sub'});
        assert(archive_items.length === 4);
        assert(archive_items.filter(archive_item => archive_item.extractor === 'testextractor2').length === 1);
        assert(archive_items.filter(archive_item => archive_item.extractor === 'testextractor1').length === 3);

        const success = await db_api.removeAllRecords('archives', {user_uid: 'test_user', sub_id: 'test_sub'});
        assert(success);
    });

    it('Get archive', async function() {
        await archive_api.addToArchive('testextractor1', 'testing1', 'video', 'test_user');
        await archive_api.addToArchive('testextractor2', 'testing1', 'video', 'test_user');

        const archive_item1 = await db_api.getRecord('archives', {extractor: 'testextractor1', id: 'testing1'});
        const archive_item2 = await db_api.getRecord('archives', {extractor: 'testextractor2', id: 'testing1'});

        assert(archive_item1 && archive_item2);
    });

    it('Archive duplicates', async function() {
        await archive_api.addToArchive('testextractor1', 'testing1', 'video', 'test_user');
        await archive_api.addToArchive('testextractor2', 'testing1', 'video', 'test_user');
        await archive_api.addToArchive('testextractor2', 'testing1', 'video', 'test_user');

        await archive_api.addToArchive('testextractor1', 'testing1', 'audio', 'test_user');

        const count = await db_api.getRecords('archives', {id: 'testing1'}, true);
        assert(count === 3);
    });

    it('Remove from archive', async function() {
        await archive_api.addToArchive('testextractor1', 'testing1', 'video', 'test_title', 'test_user');
        await archive_api.addToArchive('testextractor2', 'testing1', 'video', 'test_title', 'test_user');
        await archive_api.addToArchive('testextractor2', 'testing2', 'video', 'test_title', 'test_user');

        const success = await archive_api.removeFromArchive('testextractor2', 'testing1', 'video', 'test_user');
        assert(success);

        const archive_item1 = await db_api.getRecord('archives', {extractor: 'testextractor1', id: 'testing1'});
        assert(!!archive_item1);
        
        const archive_item2 = await db_api.getRecord('archives', {extractor: 'testextractor2', id: 'testing1'});
        assert(!archive_item2);

        const archive_item3 = await db_api.getRecord('archives', {extractor: 'testextractor2', id: 'testing2'});
        assert(!!archive_item3);
    });
});

describe('Utils', async function() {
    it('Strip properties', async function() {
        const test_obj = {test1: 'test1', test2: 'test2', test3: 'test3'};
        const stripped_obj = utils.stripPropertiesFromObject(test_obj, ['test1', 'test3']);
        assert(!stripped_obj['test1'] && stripped_obj['test2'] && !stripped_obj['test3'])
    });

    it('Convert flat object to nested object', async function() {
        // No modfication
        const flat_obj0 = {'test1': {'test_sub': true}, 'test2': {test_sub: true}};
        const nested_obj0 = utils.convertFlatObjectToNestedObject(flat_obj0);
        assert(nested_obj0['test1'] && nested_obj0['test1']['test_sub']);
        assert(nested_obj0['test2'] && nested_obj0['test2']['test_sub']);

        // Standard setup
        const flat_obj1 = {'test1.test_sub': true, 'test2.test_sub': true};
        const nested_obj1 = utils.convertFlatObjectToNestedObject(flat_obj1);
        assert(nested_obj1['test1'] && nested_obj1['test1']['test_sub']);
        assert(nested_obj1['test2'] && nested_obj1['test2']['test_sub']);

        // Nested branches
        const flat_obj2 = {'test1.test_sub': true, 'test1.test2.test_sub': true};
        const nested_obj2 = utils.convertFlatObjectToNestedObject(flat_obj2);
        assert(nested_obj2['test1'] && nested_obj2['test1']['test_sub']);
        assert(nested_obj2['test1'] && nested_obj2['test1']['test2'] && nested_obj2['test1']['test2']['test_sub']);
    });
});

describe('Categories', async function() {
    beforeEach(async function() {
        // await db_api.connectToDB();
        const new_category = {
            name: 'test_category',
            uid: uuid(),
            rules: [],
            custom_output: ''
        };
        await db_api.removeAllRecords('categories', {name: 'test_category'});
        await db_api.insertRecordIntoTable('categories', new_category);
    });

    afterEach(async function() {
        await db_api.removeAllRecords('categories', {name: 'test_category'});
    });

    it('Categorize - includes', async function() {
        await db_api.pushToRecordsArray('categories', {name: 'test_category'}, 'rules', {
            preceding_operator: null,
            comparator: 'includes',
            property: 'title',
            value: 'Sample'
        });

        const category = await categories_api.categorize([sample_video_json]);
        assert(category && category.name === 'test_category');
    });

    it('Categorize - not includes', async function() {
        await db_api.pushToRecordsArray('categories', {name: 'test_category'}, 'rules', {
            preceding_operator: null,
            comparator: 'not_includes',
            property: 'title',
            value: 'Sample'
        });

        const category = await categories_api.categorize([sample_video_json]);
        assert(!category);
    });

    it('Categorize - equals', async function() {
        await db_api.pushToRecordsArray('categories', {name: 'test_category'}, 'rules', {
            preceding_operator: null,
            comparator: 'equals',
            property: 'uploader',
            value: 'Sample Uploader'
        });

        const category = await categories_api.categorize([sample_video_json]);
        assert(category && category.name === 'test_category');
    });

    it('Categorize - not equals', async function() {
        await db_api.pushToRecordsArray('categories', {name: 'test_category'}, 'rules', {
            preceding_operator: null,
            comparator: 'not_equals',
            property: 'uploader',
            value: 'Sample Uploader'
        });

        const category = await categories_api.categorize([sample_video_json]);
        assert(!category);
    });

    it('Categorize - AND', async function() {
        await db_api.pushToRecordsArray('categories', {name: 'test_category'}, 'rules', {
            preceding_operator: null,
            comparator: 'equals',
            property: 'uploader',
            value: 'Sample Uploader'
        });

        await db_api.pushToRecordsArray('categories', {name: 'test_category'}, 'rules', {
            preceding_operator: 'and',
            comparator: 'not_includes',
            property: 'title',
            value: 'Sample'
        });

        const category = await categories_api.categorize([sample_video_json]);
        assert(!category);
    });

    it('Categorize - OR', async function() {
        await db_api.pushToRecordsArray('categories', {name: 'test_category'}, 'rules', {
            preceding_operator: null,
            comparator: 'equals',
            property: 'uploader',
            value: 'Sample Uploader'
        });

        await db_api.pushToRecordsArray('categories', {name: 'test_category'}, 'rules', {
            preceding_operator: 'or',
            comparator: 'not_includes',
            property: 'title',
            value: 'Sample'
        });

        const category = await categories_api.categorize([sample_video_json]);
        assert(category);
    });
});

describe('Config', async function() {
    it('findChangedConfigItems', async function() {
        const old_config = {
            "YoutubeDLMaterial": {
                "test_object1": {
                    "test_prop1": true,
                    "test_prop2": false
                },
                "test_object2": {
                    "test_prop3": {
                        "test_prop3_1": true,
                        "test_prop3_2": false
                    },
                    "test_prop4": false
                },
                "test_object3": {
                    "test_prop5": {
                        "test_prop5_1": true,
                        "test_prop5_2": false
                    },
                    "test_prop6": false
                }
            }
        };

        const new_config = {
            "YoutubeDLMaterial": {
                "test_object1": {
                    "test_prop1": false,
                    "test_prop2": false
                },
                "test_object2": {
                    "test_prop3": {
                        "test_prop3_1": false,
                        "test_prop3_2": false
                    },
                    "test_prop4": true
                },
                "test_object3": {
                    "test_prop5": {
                        "test_prop5_1": true,
                        "test_prop5_2": false
                    },
                    "test_prop6": true
                }
            }
        };

        const changes = config_api.findChangedConfigItems(old_config, new_config);
        assert(changes[0]['key'] === 'test_prop1' && changes[0]['old_value'] === true && changes[0]['new_value'] === false);
        assert(changes[1]['key'] === 'test_prop3' &&
                changes[1]['old_value']['test_prop3_1'] === true &&
                changes[1]['new_value']['test_prop3_1'] === false &&
                changes[1]['old_value']['test_prop3_2'] === false &&
                changes[1]['new_value']['test_prop3_2'] === false);
        assert(changes[2]['key'] === 'test_prop4' && changes[2]['old_value'] === false && changes[2]['new_value'] === true);
        assert(changes[3]['key'] === 'test_prop6' && changes[3]['old_value'] === false && changes[3]['new_value'] === true);
    });
});

const generateEmptyVideoFile = async (file_path) => {
    if (fs.existsSync(file_path)) fs.unlinkSync(file_path);
    return await exec(`ffmpeg -t 1 -f lavfi -i color=c=black:s=640x480 -c:v libx264 -tune stillimage -pix_fmt yuv420p "${file_path}"`);
}

const generateEmptyAudioFile = async (file_path) => {
    if (fs.existsSync(file_path)) fs.unlinkSync(file_path);
    return await exec(`ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 1 -q:a 9 -acodec libmp3lame ${file_path}`);
}