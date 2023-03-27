const fs = require('fs-extra');
const { uuid } = require('uuidv4');
const path = require('path');
const mergeFiles = require('merge-files');
const NodeID3 = require('node-id3')
const Mutex = require('async-mutex').Mutex;

const youtubedl = require('youtube-dl');

const logger = require('./logger');
const config_api = require('./config');
const twitch_api = require('./twitch');
const { create } = require('xmlbuilder2');
const categories_api = require('./categories');
const utils = require('./utils');
const db_api = require('./db');
const notifications_api = require('./notifications');
const archive_api = require('./archive');

const mutex = new Mutex();
let should_check_downloads = true;

if (db_api.database_initialized) {
    setupDownloads();
} else {
    db_api.database_initialized_bs.subscribe(init => {
        if (init) setupDownloads();
    });
}

exports.createDownload = async (url, type, options, user_uid = null, sub_id = null, sub_name = null, prefetched_info = null) => {
    return await mutex.runExclusive(async () => {
        const download = {
            url: url,
            type: type,
            title: '',
            user_uid: user_uid,
            sub_id: sub_id,
            sub_name: sub_name,
            prefetched_info: prefetched_info,
            options: options,
            uid: uuid(),
            step_index: 0,
            paused: false,
            running: false,
            finished_step: true,
            error: null,
            percent_complete: null,
            finished: false,
            timestamp_start: Date.now()
        };
        await db_api.insertRecordIntoTable('download_queue', download);
    
        should_check_downloads = true;
        return download;
    });
}

exports.pauseDownload = async (download_uid) => {
    const download = await db_api.getRecord('download_queue', {uid: download_uid});
    if (download['paused']) {
        logger.warn(`Download ${download_uid} is already paused!`);
        return false;
    } else if (download['finished']) {
        logger.info(`Download ${download_uid} could not be paused before completing.`);
        return false;
    }

    return await db_api.updateRecord('download_queue', {uid: download_uid}, {paused: true, running: false});
}

exports.resumeDownload = async (download_uid) => {
    return await mutex.runExclusive(async () => {
        const download = await db_api.getRecord('download_queue', {uid: download_uid});
        if (!download['paused']) {
            logger.warn(`Download ${download_uid} is not paused!`);
            return false;
        }

        const success = db_api.updateRecord('download_queue', {uid: download_uid}, {paused: false});
        should_check_downloads = true;
        return success;
    })
}

exports.restartDownload = async (download_uid) => {
    const download = await db_api.getRecord('download_queue', {uid: download_uid});
    await exports.clearDownload(download_uid);
    const new_download = await exports.createDownload(download['url'], download['type'], download['options'], download['user_uid']);
    
    should_check_downloads = true;
    return new_download;
}

exports.cancelDownload = async (download_uid) => {
    const download = await db_api.getRecord('download_queue', {uid: download_uid});
    if (download['cancelled']) {
        logger.warn(`Download ${download_uid} is already cancelled!`);
        return false;
    } else if (download['finished']) {
        logger.info(`Download ${download_uid} could not be cancelled before completing.`);
        return false;
    }
    return await db_api.updateRecord('download_queue', {uid: download_uid}, {cancelled: true, running: false});
}

exports.clearDownload = async (download_uid) => {
    return await db_api.removeRecord('download_queue', {uid: download_uid});
}

async function handleDownloadError(download, error_message, error_type = null) {
    if (!download || !download['uid']) return;
    notifications_api.sendDownloadErrorNotification(download, download['user_uid'], error_type);
    await db_api.updateRecord('download_queue', {uid: download['uid']}, {error: error_message, finished: true, running: false, error_type: error_type});
}

async function setupDownloads() {
    await fixDownloadState();
    setInterval(checkDownloads, 1000);
}

async function fixDownloadState() {
    const downloads = await db_api.getRecords('download_queue');
    downloads.sort((download1, download2) => download1.timestamp_start - download2.timestamp_start);
    const running_downloads = downloads.filter(download => !download['finished'] && !download['error']);
    for (let i = 0; i < running_downloads.length; i++) {
        const running_download = running_downloads[i];
        const update_obj = {finished_step: true, paused: true, running: false};
        if (running_download['step_index'] > 0) {
            update_obj['step_index'] = running_download['step_index'] - 1;
        }
        await db_api.updateRecord('download_queue', {uid: running_download['uid']}, update_obj);
    }
}

async function checkDownloads() {
    if (!should_check_downloads) return;

    const downloads = await db_api.getRecords('download_queue');
    downloads.sort((download1, download2) => download1.timestamp_start - download2.timestamp_start);

    await mutex.runExclusive(async () => {
        // avoid checking downloads unnecessarily, but double check that should_check_downloads is still true
        const running_downloads = downloads.filter(download => !download['paused'] && !download['finished']);
        if (running_downloads.length === 0) {
            should_check_downloads = false;
            logger.verbose('Disabling checking downloads as none are available.');
        }
        return;
    });

    let running_downloads_count = downloads.filter(download => download['running']).length;
    const waiting_downloads = downloads.filter(download => !download['paused'] && download['finished_step'] && !download['finished']);
    for (let i = 0; i < waiting_downloads.length; i++) {
        const waiting_download = waiting_downloads[i];
        const max_concurrent_downloads = config_api.getConfigItem('ytdl_max_concurrent_downloads');
        if (max_concurrent_downloads < 0 || running_downloads_count >= max_concurrent_downloads) break;

        if (waiting_download['finished_step'] && !waiting_download['finished']) {
            if (waiting_download['sub_id']) {
                const sub_missing = !(await db_api.getRecord('subscriptions', {id: waiting_download['sub_id']}));
                if (sub_missing) {
                    handleDownloadError(waiting_download, `Download failed as subscription with id '${waiting_download['sub_id']}' is missing!`, 'sub_id_missing');
                    continue;
                }
            }
            // move to next step
            running_downloads_count++;
            if (waiting_download['step_index'] === 0) {
                collectInfo(waiting_download['uid']);
            } else if (waiting_download['step_index'] === 1) {
                downloadQueuedFile(waiting_download['uid']);
            }
        }
    }
}

async function collectInfo(download_uid) {
    const download = await db_api.getRecord('download_queue', {uid: download_uid});
    if (download['paused']) {
        return;
    }
    logger.verbose(`Collecting info for download ${download_uid}`);
    await db_api.updateRecord('download_queue', {uid: download_uid}, {step_index: 1, finished_step: false, running: true});

    const url = download['url'];
    const type = download['type'];
    const options = download['options'];

    if (download['user_uid'] && !options.customFileFolderPath) {
        let usersFileFolder = config_api.getConfigItem('ytdl_users_base_path');
        const user_path = path.join(usersFileFolder, download['user_uid'], type);
        options.customFileFolderPath = user_path + path.sep;
    }

    let args = await exports.generateArgs(url, type, options, download['user_uid']);

    // get video info prior to download
    let info = download['prefetched_info'] ? download['prefetched_info'] : await exports.getVideoInfoByURL(url, args, download_uid);

    if (!info) {
        // info failed, error presumably already recorded
        return;
    }

    const useYoutubeDLArchive = config_api.getConfigItem('ytdl_use_youtubedl_archive');
    if (useYoutubeDLArchive && !options.ignoreArchive) {
        const exists_in_archive = await archive_api.existsInArchive(info['extractor'], info['id'], type, download['user_uid'], download['sub_id']);
        if (exists_in_archive) {
            const error = `File '${info['title']}' already exists in archive! Disable the archive or override to continue downloading.`;
            logger.warn(error);
            if (download_uid) {
                const download = await db_api.getRecord('download_queue', {uid: download_uid});
                await handleDownloadError(download, error, 'exists_in_archive');
                return;
            }
        }
    }

    let category = null;

    // check if it fits into a category. If so, then get info again using new args
    if (!Array.isArray(info) || config_api.getConfigItem('ytdl_allow_playlist_categorization')) category = await categories_api.categorize(info);

    // set custom output if the category has one and re-retrieve info so the download manager has the right file name
    if (category && category['custom_output']) {
        options.customOutput = category['custom_output'];
        options.noRelativePath = true;
        args = await exports.generateArgs(url, type, options, download['user_uid']);
        args = utils.filterArgs(args, ['--no-simulate']);
        info = await exports.getVideoInfoByURL(url, args, download_uid);
    }

    download['category'] = category;

    // setup info required to calculate download progress

    const expected_file_size = utils.getExpectedFileSize(info);

    const files_to_check_for_progress = [];

    // store info in download for future use
    if (Array.isArray(info)) {
        for (let info_obj of info) files_to_check_for_progress.push(utils.removeFileExtension(info_obj['_filename']));
    } else {
        files_to_check_for_progress.push(utils.removeFileExtension(info['_filename']));
    }

    const playlist_title = Array.isArray(info) ? info[0]['playlist_title'] || info[0]['playlist'] : null;
    await db_api.updateRecord('download_queue', {uid: download_uid}, {args: args,
                                                                    finished_step: true,
                                                                    running: false,
                                                                    options: options,
                                                                    files_to_check_for_progress: files_to_check_for_progress,
                                                                    expected_file_size: expected_file_size,
                                                                    title: playlist_title ? playlist_title : info['title'],
                                                                    prefetched_info: null
                                                                });
}

async function downloadQueuedFile(download_uid) {
    const download = await db_api.getRecord('download_queue', {uid: download_uid});
    if (download['paused']) {
        return;
    }
    logger.verbose(`Downloading ${download_uid}`);
    return new Promise(async resolve => {
        const audioFolderPath = config_api.getConfigItem('ytdl_audio_folder_path');
        const videoFolderPath = config_api.getConfigItem('ytdl_video_folder_path');
        const usersFolderPath = config_api.getConfigItem('ytdl_users_base_path');
        await db_api.updateRecord('download_queue', {uid: download_uid}, {step_index: 2, finished_step: false, running: true});

        const url = download['url'];
        const type = download['type'];
        const options = download['options'];
        const args = download['args'];
        const category = download['category'];
        let fileFolderPath = type === 'audio' ? audioFolderPath : videoFolderPath;
        if (options.customFileFolderPath) {
            fileFolderPath = options.customFileFolderPath;
        } else if (download['user_uid']) {
            fileFolderPath = path.join(usersFolderPath, download['user_uid'], type);
        }
        fs.ensureDirSync(fileFolderPath);

        const start_time = Date.now();

        const download_checker = setInterval(() => checkDownloadPercent(download['uid']), 1000);

        // download file
        youtubedl.exec(url, args, {maxBuffer: Infinity}, async function(err, output) {
            const file_objs = [];
            let end_time = Date.now();
            let difference = (end_time - start_time)/1000;
            logger.debug(`${type === 'audio' ? 'Audio' : 'Video'} download delay: ${difference} seconds.`);
            clearInterval(download_checker);
            if (err) {
                logger.error(err.stderr);
                await handleDownloadError(download, err.stderr);
                resolve(false);
                return;
            } else if (output) {
                if (output.length === 0 || output[0].length === 0) {
                    // ERROR!
                    const error_message = `No output received for video download, check if it exists in your archive.`;
                    await handleDownloadError(download, error_message, 'no_output');
                    logger.warn(error_message);
                    resolve(false);
                    return;
                }

                for (let i = 0; i < output.length; i++) {
                    let output_json = null;
                    try {
                        // we have to do this because sometimes there will be leading characters before the actual json
                        const start_idx = output[i].indexOf('{"');
                        const clean_output = output[i].slice(start_idx, output[i].length);
                        output_json = JSON.parse(clean_output);
                    } catch(e) {
                        output_json = null;
                    }

                    if (!output_json) {
                        continue;
                    }

                    // get filepath with no extension
                    const filepath_no_extension = utils.removeFileExtension(output_json['_filename']);

                    const ext = type === 'audio' ? '.mp3' : '.mp4';
                    var full_file_path = filepath_no_extension + ext;
                    var file_name = filepath_no_extension.substring(fileFolderPath.length, filepath_no_extension.length);

                    if (type === 'video' && url.includes('twitch.tv/videos/') && url.split('twitch.tv/videos/').length > 1
                        && config_api.getConfigItem('ytdl_use_twitch_api') && config_api.getConfigItem('ytdl_twitch_auto_download_chat')) {
                            let vodId = url.split('twitch.tv/videos/')[1];
                            vodId = vodId.split('?')[0];
                            twitch_api.downloadTwitchChatByVODID(vodId, file_name, type, download['user_uid']);
                    }

                    // renames file if necessary due to bug
                    if (!fs.existsSync(output_json['_filename']) && fs.existsSync(output_json['_filename'] + '.webm')) {
                        try {
                            fs.renameSync(output_json['_filename'] + '.webm', output_json['_filename']);
                            logger.info('Renamed ' + file_name + '.webm to ' + file_name);
                        } catch(e) {
                            logger.error(`Failed to rename file ${output_json['_filename']} to its appropriate extension.`);
                        }
                    }

                    if (type === 'audio') {
                        let tags = {
                            title: output_json['title'],
                            artist: output_json['artist'] ? output_json['artist'] : output_json['uploader']
                        }
                        let success = NodeID3.write(tags, utils.removeFileExtension(output_json['_filename']) + '.mp3');
                        if (!success) logger.error('Failed to apply ID3 tag to audio file ' + output_json['_filename']);
                    }

                    if (config_api.getConfigItem('ytdl_generate_nfo_files')) {
                        exports.generateNFOFile(output_json, `${filepath_no_extension}.nfo`);
                    }

                    if (options.cropFileSettings) {
                        await utils.cropFile(full_file_path, options.cropFileSettings.cropFileStart, options.cropFileSettings.cropFileEnd, ext);
                    }

                    // registers file in DB
                    const file_obj = await db_api.registerFileDB(full_file_path, type, download['user_uid'], category, download['sub_id'] ? download['sub_id'] : null, options.cropFileSettings);

                    const useYoutubeDLArchive = config_api.getConfigItem('ytdl_use_youtubedl_archive');
                    if (useYoutubeDLArchive && !options.ignoreArchive) await archive_api.addToArchive(output_json['extractor'], output_json['id'], type, output_json['title'], download['user_uid'], download['sub_id']);

                    notifications_api.sendDownloadNotification(file_obj, download['user_uid']);

                    file_objs.push(file_obj);
                }

                let container = null;

                if (file_objs.length > 1) {
                    // create playlist
                    const playlist_name = file_objs.map(file_obj => file_obj.title).join(', ');
                    container = await db_api.createPlaylist(playlist_name, file_objs.map(file_obj => file_obj.uid), download['user_uid']);
                } else if (file_objs.length === 1) {
                    container = file_objs[0];
                } else {
                    const error_message = 'Downloaded file failed to result in metadata object.';
                    logger.error(error_message);
                    await handleDownloadError(download, error_message, 'no_metadata');
                }

                const file_uids = file_objs.map(file_obj => file_obj.uid);
                await db_api.updateRecord('download_queue', {uid: download_uid}, {finished_step: true, finished: true, running: false, step_index: 3, percent_complete: 100, file_uids: file_uids, container: container});
                resolve();
            }
        });
    });
}

// helper functions

exports.generateArgs = async (url, type, options, user_uid = null, simulated = false) => {
    const default_downloader = utils.getCurrentDownloader() || config_api.getConfigItem('ytdl_default_downloader');

    const audioFolderPath = config_api.getConfigItem('ytdl_audio_folder_path');
    const videoFolderPath = config_api.getConfigItem('ytdl_video_folder_path');
    const usersFolderPath = config_api.getConfigItem('ytdl_users_base_path');

    const videopath = config_api.getConfigItem('ytdl_default_file_output') ? config_api.getConfigItem('ytdl_default_file_output') : '%(title)s';
    const globalArgs = config_api.getConfigItem('ytdl_custom_args');
    const useCookies = config_api.getConfigItem('ytdl_use_cookies');
    const is_audio = type === 'audio';

    let fileFolderPath = type === 'audio' ? audioFolderPath : videoFolderPath; // TODO: fix
    if (options.customFileFolderPath) {
        fileFolderPath = options.customFileFolderPath;
    } else if (user_uid) {
        fileFolderPath = path.join(usersFolderPath, user_uid, fileFolderPath);
    }

    if (options.customFileFolderPath) fileFolderPath = options.customFileFolderPath;

    const customArgs = options.customArgs;
    let customOutput = options.customOutput;
    const customQualityConfiguration = options.customQualityConfiguration;

    // video-specific args
    const selectedHeight = options.selectedHeight;
    const maxHeight = options.maxHeight;
    const heightParam = selectedHeight || maxHeight;

    // audio-specific args
    const maxBitrate = options.maxBitrate;

    const youtubeUsername = options.youtubeUsername;
    const youtubePassword = options.youtubePassword;

    let downloadConfig = null;
    let qualityPath = (is_audio && !options.skip_audio_args) ? ['-f', 'bestaudio'] : ['-f', 'bestvideo+bestaudio', '--merge-output-format', 'mp4'];
    const is_youtube = url.includes('youtu');
    if (!is_audio && !is_youtube) {
        // tiktok videos fail when using the default format
        qualityPath = null;
    }

    if (customArgs) {
        downloadConfig = customArgs.split(',,');
    } else {
        if (customQualityConfiguration) {
            qualityPath = ['-f', customQualityConfiguration, '--merge-output-format', 'mp4'];
        } else if (heightParam && heightParam !== '' && !is_audio) {
            const heightFilter = (maxHeight && default_downloader === 'yt-dlp') ? ['-S', `res:${heightParam}`] : ['-f', `best[height${maxHeight ? '<' : ''}=${heightParam}]+bestaudio`]
            qualityPath = [...heightFilter, '--merge-output-format', 'mp4'];
        } else if (is_audio) {
            qualityPath = ['--audio-quality', maxBitrate ? maxBitrate : '0']
        }

        if (customOutput) {
            customOutput = options.noRelativePath ? customOutput : path.join(fileFolderPath, customOutput);
            downloadConfig = ['-o', `${customOutput}.%(ext)s`, '--write-info-json', '--print-json'];
        } else {
            downloadConfig = ['-o', path.join(fileFolderPath, videopath + (is_audio ? '.%(ext)s' : '.mp4')), '--write-info-json', '--print-json'];
        }

        if (qualityPath) downloadConfig.push(...qualityPath);

        if (is_audio && !options.skip_audio_args) {
            downloadConfig.push('-x');
            downloadConfig.push('--audio-format', 'mp3');
        }

        if (youtubeUsername && youtubePassword) {
            downloadConfig.push('--username', youtubeUsername, '--password', youtubePassword);
        }

        if (useCookies) {
            if (await fs.pathExists(path.join(__dirname, 'appdata', 'cookies.txt'))) {
                downloadConfig.push('--cookies', path.join('appdata', 'cookies.txt'));
            } else {
                logger.warn('Cookies file could not be found. You can either upload one, or disable \'use cookies\' in the Advanced tab in the settings.');
            }
        }

        const useDefaultDownloadingAgent = config_api.getConfigItem('ytdl_use_default_downloading_agent');
        const customDownloadingAgent = config_api.getConfigItem('ytdl_custom_downloading_agent');
        if (!useDefaultDownloadingAgent && customDownloadingAgent) {
            downloadConfig.splice(0, 0, '--external-downloader', customDownloadingAgent);
        }

        if (config_api.getConfigItem('ytdl_include_thumbnail')) {
            downloadConfig.push('--write-thumbnail');
        }

        if (globalArgs && globalArgs !== '') {
            // adds global args
            if (downloadConfig.indexOf('-o') !== -1 && globalArgs.split(',,').indexOf('-o') !== -1) {
                // if global args has an output, replce the original output with that of global args
                const original_output_index = downloadConfig.indexOf('-o');
                downloadConfig.splice(original_output_index, 2);
            }
            downloadConfig = downloadConfig.concat(globalArgs.split(',,'));
        }

        if (options.additionalArgs && options.additionalArgs !== '') {
            downloadConfig = utils.injectArgs(downloadConfig, options.additionalArgs.split(',,'));
        }

        const rate_limit = config_api.getConfigItem('ytdl_download_rate_limit');
        if (rate_limit && downloadConfig.indexOf('-r') === -1 && downloadConfig.indexOf('--limit-rate') === -1) {
            downloadConfig.push('-r', rate_limit);
        }
        
        if (default_downloader === 'yt-dlp') {
            downloadConfig = utils.filterArgs(downloadConfig, ['--print-json']);

            // in yt-dlp -j --no-simulate is preferable
            downloadConfig.push('--no-clean-info-json', '-j', '--no-simulate');
        }

    }

    // filter out incompatible args
    downloadConfig = filterArgs(downloadConfig, is_audio);

    if (!simulated) logger.verbose(`${default_downloader} args being used: ${downloadConfig.join(',')}`);
    return downloadConfig;
}

exports.getVideoInfoByURL = async (url, args = [], download_uid = null) => {
    return new Promise(resolve => {
        // remove bad args
        const new_args = [...args];

        const archiveArgIndex = new_args.indexOf('--download-archive');
        if (archiveArgIndex !== -1) {
            new_args.splice(archiveArgIndex, 2);
        }

        new_args.push('--dump-json');

        youtubedl.exec(url, new_args, {maxBuffer: Infinity}, async (err, output) => {
            if (output) {
                let outputs = [];
                try {
                    for (let i = 0; i < output.length; i++) {
                        let output_json = null;
                        try {
                            output_json = JSON.parse(output[i]);
                        } catch(e) {
                            output_json = null;
                        }
    
                        if (!output_json) {
                            continue;
                        }

                        outputs.push(output_json);
                    }
                    resolve(outputs.length === 1 ? outputs[0] : outputs);
                } catch(e) {
                    const error = `Error while retrieving info on video with URL ${url} with the following message: output JSON could not be parsed. Output JSON: ${output}`;
                    logger.error(error);
                    if (download_uid) {
                        const download = await db_api.getRecord('download_queue', {uid: download_uid});
                        await handleDownloadError(download, error, 'parse_failed');
                    }
                    resolve(null);
                }
            } else {
                let error_message = `Error while retrieving info on video with URL ${url} with the following message: ${err}`;
                if (err.stderr) error_message += `\n\n${err.stderr}`;
                logger.error(error_message);
                if (download_uid) {
                    const download = await db_api.getRecord('download_queue', {uid: download_uid});
                    await handleDownloadError(download, error_message);
                }
                resolve(null);
            }
        });
    });
}

function filterArgs(args, isAudio) {
    const video_only_args = ['--add-metadata', '--embed-subs', '--xattrs'];
    const audio_only_args = ['-x', '--extract-audio', '--embed-thumbnail'];
    return utils.filterArgs(args, isAudio ? video_only_args : audio_only_args);
}

async function checkDownloadPercent(download_uid) {
    /*
    This is more of an art than a science, we're just selecting files that start with the file name,
    thus capturing the parts being downloaded in files named like so: '<video title>.<format>.<ext>.part'.

    Any file that starts with <video title> will be counted as part of the "bytes downloaded", which will
    be divided by the "total expected bytes."
    */

    const download = await db_api.getRecord('download_queue', {uid: download_uid});
    const files_to_check_for_progress = download['files_to_check_for_progress'];
    const resulting_file_size = download['expected_file_size'];

    if (!resulting_file_size) return;

    let sum_size = 0;
    for (let i = 0; i < files_to_check_for_progress.length; i++) {
        const file_to_check_for_progress = files_to_check_for_progress[i];
        const dir = path.dirname(file_to_check_for_progress);
        if (!fs.existsSync(dir)) continue;
        fs.readdir(dir, async (err, files) => {
            for (let j = 0; j < files.length; j++) {
                const file = files[j];
                if (!file.includes(path.basename(file_to_check_for_progress))) continue;
                try {
                    const file_stats = fs.statSync(path.join(dir, file));
                    if (file_stats && file_stats.size) {
                        sum_size += file_stats.size;
                    }
                } catch (e) {}
            }
            
            const percent_complete = (sum_size/resulting_file_size * 100).toFixed(2);
            await db_api.updateRecord('download_queue', {uid: download_uid}, {percent_complete: percent_complete});
        });
    }
}

exports.generateNFOFile = (info, output_path) => {
    const nfo_obj = {
        episodedetails: {
            title: info['fulltitle'],
            episode: info['playlist_index'] ? info['playlist_index'] : undefined,
            premiered: utils.formatDateString(info['upload_date']),
            plot: `${info['uploader_url']}\n${info['description']}\n${info['playlist_title'] ? info['playlist_title'] : ''}`,
            director: info['artist'] ? info['artist'] : info['uploader']
        }
    };
    const doc = create(nfo_obj);
    const xml = doc.end({ prettyPrint: true });
    fs.writeFileSync(output_path, xml);
}
