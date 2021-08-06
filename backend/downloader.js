const fs = require('fs-extra');
const { uuid } = require('uuidv4');
const path = require('path');
const queue = require('queue');

const youtubedl = require('youtube-dl');
const config_api = require('./config');
const twitch_api = require('./twitch');
const utils = require('./utils');

let db_api = null;
let logger = null;

function setDB(input_db_api) { db_api = input_db_api }
function setLogger(input_logger) { logger = input_logger; }

exports.initialize = (input_db_api, input_logger) => {
    setDB(input_db_api);
    setLogger(input_logger);
}

exports.pauseDownload = () => {

}

async function checkDownloads() {
    const downloads = await db_api.getRecords('download_queue');
    downloads.sort((download1, download2) => download1.timestamp_start - download2.timestamp_start);
    downloads = downloads.filter(download => !download.paused);
    for (let i = 0; i < downloads.length; i++) {
        if (i === config_api.getConfigItem('ytdl_'))
    }
}

async function createDownload(url, type, options) {
    const download = {url: url, type: type, options: options, uid: uuid()};
    await db_api.insertRecord(download);
    return download;
}

async function collectInfo(download_uid) {
    const download = db_api.getRecord('download_queue', {uid: download_uid});

    const url = download['url'];
    const type = download['type'];
    const options = download['options'];
    const args = download['args'];

    // get video info prior to download
    const info = await getVideoInfoByURL(url, args);

    if (!info) {
        // info failed, record error and pause download
    }

    // check if it fits into a category. If so, then get info again using new args
    if (!Array.isArray(info) || config_api.getConfigItem('ytdl_allow_playlist_categorization')) category = await categories_api.categorize(info);

    // set custom output if the category has one and re-retrieve info so the download manager has the right file name
    if (category && category['custom_output']) {
        options.customOutput = category['custom_output'];
        options.noRelativePath = true;
        args = await generateArgs(url, type, options);
        info = await getVideoInfoByURL(url, args);

        // must update args
        await db_api.updateRecord('download_queue', {uid: download_uid}, {args: args});
    }

    await db_api.updateRecord('download_queue', {uid: download_uid}, {remote_metadata: info});
}

async function downloadQueuedFile(url, type, options) {

}

async function downloadFileByURL_exec(url, type, options) {
    return new Promise(resolve => {
        const download = db_api.getRecord('download_queue', {uid: download_uid});

        const url = download['url'];
        const type = download['type'];
        const options = download['options'];
        const args = download['args'];
        const category = download['category'];
        let fileFolderPath = type === 'audio' ? audioFolderPath : videoFolderPath; // TODO: fix
        if (options.user) {
            let usersFileFolder = config_api.getConfigItem('ytdl_users_base_path');
            const user_path = path.join(usersFileFolder, options.user, type);
            fs.ensureDirSync(user_path);
            fileFolderPath = user_path + path.sep;
            options.customFileFolderPath = fileFolderPath;
        }

        // download file
        youtubedl.exec(url, args, {maxBuffer: Infinity}, async function(err, output) {
            const file_objs = [];
            let new_date = Date.now();
            let difference = (new_date - date)/1000;
            logger.debug(`${is_audio ? 'Audio' : 'Video'} download delay: ${difference} seconds.`);
            if (err) {
                logger.error(err.stderr);

                resolve(false);
                return;
            } else if (output) {
                if (output.length === 0 || output[0].length === 0) {
                    // ERROR!
                    logger.warn(`No output received for video download, check if it exists in your archive.`)

                    resolve(false);
                    return;
                }

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

                    // get filepath with no extension
                    const filepath_no_extension = utils.removeFileExtension(output_json['_filename']);

                    var full_file_path = filepath_no_extension + ext;
                    var file_name = filepath_no_extension.substring(fileFolderPath.length, filepath_no_extension.length);

                    if (type === 'video' && url.includes('twitch.tv/videos/') && url.split('twitch.tv/videos/').length > 1
                        && config.getConfigItem('ytdl_use_twitch_api') && config.getConfigItem('ytdl_twitch_auto_download_chat')) {
                            let vodId = url.split('twitch.tv/videos/')[1];
                            vodId = vodId.split('?')[0];
                            twitch_api.downloadTwitchChatByVODID(vodId, file_name, type, options.user);
                    }

                    // renames file if necessary due to bug
                    if (!fs.existsSync(output_json['_filename'] && fs.existsSync(output_json['_filename'] + '.webm'))) {
                        try {
                            fs.renameSync(output_json['_filename'] + '.webm', output_json['_filename']);
                            logger.info('Renamed ' + file_name + '.webm to ' + file_name);
                        } catch(e) {
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

                    if (options.cropFileSettings) {
                        await cropFile(full_file_path, options.cropFileSettings.cropFileStart, options.cropFileSettings.cropFileEnd, ext);
                    }

                    // registers file in DB
                    const file_obj = await db_api.registerFileDB2(full_file_path, type, options.user, category, null, options.cropFileSettings);

                    file_objs.push(file_obj);
                }

                if (options.merged_string !== null && options.merged_string !== undefined) {
                    let current_merged_archive = fs.readFileSync(path.join(fileFolderPath, `merged_${type}.txt`), 'utf8');
                    let diff = current_merged_archive.replace(options.merged_string, '');
                    const archive_path = options.user ? path.join(fileFolderPath, 'archives', `archive_${type}.txt`) : path.join(archivePath, `archive_${type}.txt`);
                    fs.appendFileSync(archive_path, diff);
                }

                let container = null;

                if (file_objs.length > 1) {
                    // create playlist
                    const playlist_name = file_objs.map(file_obj => file_obj.title).join(', ');
                    container = await db_api.createPlaylist(playlist_name, file_objs.map(file_obj => file_obj.uid), type, options.user);
                } else if (file_objs.length === 1) {
                    container = file_objs[0];
                } else {
                    logger.error('Downloaded file failed to result in metadata object.');
                }

                resolve({
                    file_uids: file_objs.map(file_obj => file_obj.uid),
                    container: container
                });
            }
        });
    });
}

// helper functions

async function generateArgs(url, type, options) {
    const videopath = config_api.getConfigItem('ytdl_default_file_output') ? config_api.getConfigItem('ytdl_default_file_output') : '%(title)s';
    const globalArgs = config_api.getConfigItem('ytdl_custom_args');
    const useCookies = config_api.getConfigItem('ytdl_use_cookies');
    const is_audio = type === 'audio';

    const fileFolderPath = is_audio ? audioFolderPath : videoFolderPath;

    if (options.customFileFolderPath) fileFolderPath = options.customFileFolderPath;

    const customArgs = options.customArgs;
    const customOutput = options.customOutput;
    const customQualityConfiguration = options.customQualityConfiguration;

    // video-specific args
    const selectedHeight = options.selectedHeight;

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
    } else if (!is_audio && !is_youtube && (url.includes('reddit') || url.includes('pornhub'))) {
        qualityPath = ['-f', 'bestvideo+bestaudio']
    }

    if (customArgs) {
        downloadConfig = customArgs.split(',,');
    } else {
        if (customQualityConfiguration) {
            qualityPath = ['-f', customQualityConfiguration];
        } else if (selectedHeight && selectedHeight !== '' && !is_audio) {
            qualityPath = ['-f', `'(mp4)[height=${selectedHeight}'`];
        } else if (is_audio) {
            qualityPath = ['--audio-quality', maxBitrate ? maxBitrate : '0']
        }

        if (customOutput) {
            customOutput = options.noRelativePath ? customOutput : path.join(fileFolderPath, customOutput);
            downloadConfig = ['-o', `${customOutput}.%(ext)s`, '--write-info-json', '--print-json'];
        } else {
            downloadConfig = ['-o', path.join(fileFolderPath, videopath + (is_audio ? '.%(ext)s' : '.mp4')), '--write-info-json', '--print-json'];
        }

        if (qualityPath && options.downloading_method === 'exec') downloadConfig.push(...qualityPath);

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

        if (!useDefaultDownloadingAgent && customDownloadingAgent) {
            downloadConfig.splice(0, 0, '--external-downloader', customDownloadingAgent);
        }

        let useYoutubeDLArchive = config_api.getConfigItem('ytdl_use_youtubedl_archive');
        if (useYoutubeDLArchive) {
            const archive_folder = options.user ? path.join(fileFolderPath, 'archives') : archivePath;
            const archive_path = path.join(archive_folder, `archive_${type}.txt`);

            await fs.ensureDir(archive_folder);
            await fs.ensureFile(archive_path);

            let blacklist_path = options.user ? path.join(fileFolderPath, 'archives', `blacklist_${type}.txt`) : path.join(archivePath, `blacklist_${type}.txt`);
            await fs.ensureFile(blacklist_path);

            let merged_path = path.join(fileFolderPath, `merged_${type}.txt`);
            await fs.ensureFile(merged_path);
            // merges blacklist and regular archive
            let inputPathList = [archive_path, blacklist_path];
            let status = await mergeFiles(inputPathList, merged_path);

            options.merged_string = await fs.readFile(merged_path, "utf8");

            downloadConfig.push('--download-archive', merged_path);
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

        const rate_limit = config_api.getConfigItem('ytdl_download_rate_limit');
        if (rate_limit && downloadConfig.indexOf('-r') === -1 && downloadConfig.indexOf('--limit-rate') === -1) {
            downloadConfig.push('-r', rate_limit);
        }
        
        const default_downloader = utils.getCurrentDownloader() || config_api.getConfigItem('ytdl_default_downloader');
        if (default_downloader === 'yt-dlp') {
            downloadConfig.push('--no-clean-infojson');
        }

    }

    // filter out incompatible args
    downloadConfig = filterArgs(downloadConfig, is_audio);

    logger.verbose(`youtube-dl args being used: ${downloadConfig.join(',')}`);
    return downloadConfig;
}

async function getVideoInfoByURL(url, args = [], download = null) {
    return new Promise(resolve => {
        // remove bad args
        const new_args = [...args];

        const archiveArgIndex = new_args.indexOf('--download-archive');
        if (archiveArgIndex !== -1) {
            new_args.splice(archiveArgIndex, 2);
        }

        // actually get info
        youtubedl.getInfo(url, new_args, (err, output) => {
            if (output) {
                resolve(output);
            } else {
                logger.error(`Error while retrieving info on video with URL ${url} with the following message: ${err}`);
                if (err.stderr) {
                    logger.error(`${err.stderr}`)
                }
                if (download) {
                    download['error'] = `Failed pre-check for video info: ${err}`;
                    updateDownloads();
                }
                resolve(null);
            }
        });
    });
}
