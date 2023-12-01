const fs = require('fs-extra');
const path = require('path');

const youtubedl_api = require('./youtube-dl');
const config_api = require('./config');
const archive_api = require('./archive');
const utils = require('./utils');
const logger = require('./logger');
const CONSTS = require('./consts');

const debugMode = process.env.YTDL_MODE === 'debug';

const db_api = require('./db');
const downloader_api = require('./downloader');

exports.subscribe = async (sub, user_uid = null, skip_get_info = false) => {
    const result_obj = {
        success: false,
        error: ''
    };
    return new Promise(async resolve => {
        // sub should just have url and name. here we will get isPlaylist and path
        sub.isPlaylist = sub.isPlaylist || sub.url.includes('playlist');
        sub.videos = [];

        let url_exists = !!(await db_api.getRecord('subscriptions', {url: sub.url, user_uid: user_uid}));

        if (!sub.name && url_exists) {
            logger.error(`Sub with the same URL "${sub.url}" already exists -- please provide a custom name for this new subscription.`);
            result_obj.error = 'Subcription with URL ' + sub.url + ' already exists! Custom name is required.';
            resolve(result_obj);
            return;
        }

        sub['user_uid'] = user_uid ? user_uid : undefined;
        await db_api.insertRecordIntoTable('subscriptions', JSON.parse(JSON.stringify(sub)));

        let success = skip_get_info ? true : await getSubscriptionInfo(sub);
        exports.writeSubscriptionMetadata(sub);

        if (success) {
            if (!sub.paused) exports.getVideosForSub(sub.id);
        } else {
            logger.error('Subscribe: Failed to get subscription info. Subscribe failed.')
        }

        result_obj.success = success;
        result_obj.sub = sub;
        resolve(result_obj);
    });

}

async function getSubscriptionInfo(sub) {
    // get videos
    let downloadConfig = ['--dump-json', '--playlist-end', '1'];
    let useCookies = config_api.getConfigItem('ytdl_use_cookies');
    if (useCookies) {
        if (await fs.pathExists(path.join(__dirname, 'appdata', 'cookies.txt'))) {
            downloadConfig.push('--cookies', path.join('appdata', 'cookies.txt'));
        } else {
            logger.warn('Cookies file could not be found. You can either upload one, or disable \'use cookies\' in the Advanced tab in the settings.');
        }
    }

    let {callback} = await youtubedl_api.runYoutubeDL(sub.url, downloadConfig);
    const {parsed_output, err} = await callback;
    if (err) {
        logger.error(err.stderr);
        return false;
    }
    logger.verbose('Subscribe: got info for subscription ' + sub.id);
    for (const output_json of parsed_output) {
        if (!output_json) {
            continue;
        }

        if (!sub.name) {
            if (sub.isPlaylist) {
                sub.name = output_json.playlist_title ? output_json.playlist_title : output_json.playlist;
            } else {
                sub.name = output_json.uploader;
            }
            // if it's now valid, update
            if (sub.name) {
                let sub_name = sub.name;
                const sub_name_exists = await db_api.getRecord('subscriptions', {name: sub.name, isPlaylist: sub.isPlaylist, user_uid: sub.user_uid});
                if (sub_name_exists) sub_name += ` - ${sub.id}`;
                await db_api.updateRecord('subscriptions', {id: sub.id}, {name: sub_name});
            }
        }

        return true;
    }

    return false;
}

exports.unsubscribe = async (sub_id, deleteMode, user_uid = null) => {
    const sub = await exports.getSubscription(sub_id);
    let basePath = null;
    if (user_uid)
        basePath = path.join(config_api.getConfigItem('ytdl_users_base_path'), user_uid, 'subscriptions');
    else
        basePath = config_api.getConfigItem('ytdl_subscriptions_base_path');

    let id = sub.id;

    const sub_files = await db_api.getRecords('files', {sub_id: id});
    for (let i = 0; i < sub_files.length; i++) {
        const sub_file = sub_files[i];
        if (config_api.descriptors[sub_file['uid']]) {
            try {
                for (let i = 0; i < config_api.descriptors[sub_file['uid']].length; i++) {
                    config_api.descriptors[sub_file['uid']][i].destroy();
                }
            } catch(e) {
                continue;
            }
        }
    }

    await killSubDownloads(sub_id, true);
    await db_api.removeRecord('subscriptions', {id: id});
    await db_api.removeAllRecords('files', {sub_id: id});

    // failed subs have no name, on unsubscribe they shouldn't error
    if (!sub.name) {
        return;
    }

    const appendedBasePath = getAppendedBasePath(sub, basePath);
    if (deleteMode && (await fs.pathExists(appendedBasePath))) {
        await fs.remove(appendedBasePath);
    }

    await db_api.removeAllRecords('archives', {sub_id: sub.id});
}

exports.deleteSubscriptionFile = async (sub, file, deleteForever, file_uid = null, user_uid = null) => {
    if (typeof sub === 'string') {
        // TODO: fix bad workaround where sub is a sub_id
        sub = await db_api.getRecord('subscriptions', {sub_id: sub});
    }
    // TODO: combine this with deletefile
    let basePath = null;
    basePath = user_uid ? path.join(config_api.getConfigItem('ytdl_users_base_path'), user_uid, 'subscriptions')
                        : config_api.getConfigItem('ytdl_subscriptions_base_path');
    const appendedBasePath = getAppendedBasePath(sub, basePath);
    const name = file;
    let retrievedID = null;
    let retrievedExtractor = null;

    await db_api.removeRecord('files', {uid: file_uid});

    let filePath = appendedBasePath;
    const ext = (sub.type && sub.type === 'audio') ? '.mp3' : '.mp4'
    var jsonPath = path.join(__dirname,filePath,name+'.info.json');
    var videoFilePath = path.join(__dirname,filePath,name+ext);
    var imageFilePath = path.join(__dirname,filePath,name+'.jpg');
    var altImageFilePath = path.join(__dirname,filePath,name+'.webp');

    const [jsonExists, videoFileExists, imageFileExists, altImageFileExists] = await Promise.all([
        fs.pathExists(jsonPath),
        fs.pathExists(videoFilePath),
        fs.pathExists(imageFilePath),
        fs.pathExists(altImageFilePath),
    ]);

    if (jsonExists) {
        const info_json = fs.readJSONSync(jsonPath);
        retrievedID = info_json['id'];
        retrievedExtractor = info_json['extractor'];
        await fs.unlink(jsonPath);
    }

    if (imageFileExists) {
        await fs.unlink(imageFilePath);
    }

    if (altImageFileExists) {
        await fs.unlink(altImageFilePath);
    }

    if (videoFileExists) {
        await fs.unlink(videoFilePath);
        if ((await fs.pathExists(jsonPath)) || (await fs.pathExists(videoFilePath))) {
            return false;
        } else {
            // check if the user wants the video to be redownloaded (deleteForever === false)
            if (deleteForever) {
                // ensure video is in the archives
                const exists_in_archive = await archive_api.existsInArchive(retrievedExtractor, retrievedID, sub.type, user_uid, sub.id);
                if (!exists_in_archive) {
                    await archive_api.addToArchive(retrievedExtractor, retrievedID, sub.type, file.title, user_uid, sub.id);
                }
            } else {
                await archive_api.removeFromArchive(retrievedExtractor, retrievedID, sub.type, user_uid, sub.id);
            }
            return true;
        }
    } else {
        // TODO: tell user that the file didn't exist
        return true;
    }
}

let current_sub_index = 0; // To keep track of the current subscription
exports.watchSubscriptionsInterval = async () => {
    const subscriptions_check_interval = config_api.getConfigItem('ytdl_subscriptions_check_interval');
    let parent_interval = setInterval(() => watchSubscriptions(), subscriptions_check_interval*1000);
    watchSubscriptions();
    config_api.config_updated.subscribe(change => {
        if (!change) return;
        if (change['key'] === 'ytdl_subscriptions_check_interval' || change['key'] === 'ytdl_multi_user_mode') {
            current_sub_index = 0; // TODO: start after the last sub check
            logger.verbose('Resetting sub check schedule due to config change');
            clearInterval(parent_interval);
            const new_interval = config_api.getConfigItem('ytdl_subscriptions_check_interval');
            parent_interval = setInterval(() => watchSubscriptions(), new_interval*1000);
            watchSubscriptions();
        }
    });
}

async function watchSubscriptions() {
    const subscription_ids = await getValidSubscriptionsToCheck();
    if (subscription_ids.length === 0) {
        logger.info('Skipping subscription check as no valid subscriptions exist.');
        return;
    }
    checkSubscription(subscription_ids[current_sub_index]);
    current_sub_index = (current_sub_index + 1) % subscription_ids.length;
}

async function checkSubscription(sub_id) {
    let sub = await exports.getSubscription(sub_id);

    // don't check the sub if the last check for the same subscription has not completed
    if (sub.downloading) {
        logger.verbose(`Subscription: skipped checking ${sub.name} as it's downloading videos.`);
        return;
    }

    if (!sub.name) {
        logger.verbose(`Subscription: skipped check for subscription with uid ${sub.id} as name has not been retrieved yet.`);
        return;
    }

    await exports.getVideosForSub(sub.id);
}

async function getValidSubscriptionsToCheck() {
    const subscriptions = await exports.getAllSubscriptions();

    if (!subscriptions) return;

    // auto pause deprecated streamingOnly mode
    const streaming_only_subs = subscriptions.filter(sub => sub.streamingOnly);
    exports.updateSubscriptionPropertyMultiple(streaming_only_subs, {paused: true});

    const valid_subscription_ids = subscriptions.filter(sub => !sub.paused && !sub.streamingOnly).map(sub => sub.id);
    return valid_subscription_ids;
}

exports.getVideosForSub = async (sub_id) => {
    const sub = await exports.getSubscription(sub_id);
    if (!sub || sub['downloading']) {
        return false;
    }

    _getVideosForSub(sub);
    return true;
}

async function _getVideosForSub(sub) {
    const user_uid = sub['user_uid'];
    updateSubscriptionProperty(sub, {downloading: true}, user_uid);

    // get basePath
    let basePath = null;
    if (user_uid)
        basePath = path.join(config_api.getConfigItem('ytdl_users_base_path'), user_uid, 'subscriptions');
    else
        basePath = config_api.getConfigItem('ytdl_subscriptions_base_path');

    let appendedBasePath = getAppendedBasePath(sub, basePath);
    fs.ensureDirSync(appendedBasePath);

    const downloadConfig = await generateArgsForSubscription(sub, user_uid);

    // get videos
    logger.verbose(`Subscription: getting list of videos to download for ${sub.name} with args: ${downloadConfig.join(',')}`);

    let {child_process, callback} = await youtubedl_api.runYoutubeDL(sub.url, downloadConfig);
    updateSubscriptionProperty(sub, {child_process: child_process}, user_uid);
    const {parsed_output, err} = await callback;
    updateSubscriptionProperty(sub, {downloading: false, child_process: null}, user_uid);
    if (!parsed_output) {
        logger.error('Subscription check failed!');
        if (err) logger.error(err);
        return null;
    }

    // remove temporary archive file if it exists
    const archive_path = path.join(appendedBasePath, 'archive.txt');
    const archive_exists = await fs.pathExists(archive_path);
    if (archive_exists) {
        await fs.unlink(archive_path);
    }

    logger.verbose('Subscription: finished check for ' + sub.name);
    const files_to_download = await handleOutputJSON(parsed_output, sub, user_uid);
    return files_to_download;
}

async function handleOutputJSON(output_jsons, sub, user_uid) {
    if (config_api.getConfigItem('ytdl_subscriptions_redownload_fresh_uploads')) {
        await setFreshUploads(sub, user_uid);
        checkVideosForFreshUploads(sub, user_uid);
    }

    if (output_jsons.length === 0 || (output_jsons.length === 1 && output_jsons[0] === '')) {
        logger.verbose('No additional videos to download for ' + sub.name);
        return [];
    }

    const files_to_download = await getFilesToDownload(sub, output_jsons);
    const base_download_options = exports.generateOptionsForSubscriptionDownload(sub, user_uid);

    for (let j = 0; j < files_to_download.length; j++) {
        const file_to_download = files_to_download[j];
        file_to_download['formats'] = utils.stripPropertiesFromObject(file_to_download['formats'], ['format_id', 'filesize', 'filesize_approx']);  // prevent download object from blowing up in size
        await downloader_api.createDownload(file_to_download['webpage_url'], sub.type || 'video', base_download_options, user_uid, sub.id, sub.name, [file_to_download]);
    }

    return files_to_download;
}

exports.generateOptionsForSubscriptionDownload = (sub, user_uid) => {
    let basePath = null;
    if (user_uid)
        basePath = path.join(config_api.getConfigItem('ytdl_users_base_path'), user_uid, 'subscriptions');
    else
        basePath = config_api.getConfigItem('ytdl_subscriptions_base_path');

    let default_output = config_api.getConfigItem('ytdl_default_file_output') ? config_api.getConfigItem('ytdl_default_file_output') : '%(title)s';

    const base_download_options = {
        maxHeight: sub.maxQuality && sub.maxQuality !== 'best' ? sub.maxQuality : null,
        customFileFolderPath: getAppendedBasePath(sub, basePath),
        customOutput: sub.custom_output ? `${sub.custom_output}` : `${default_output}`,
        customArchivePath: path.join(basePath, 'archives', sub.name),
        additionalArgs: sub.custom_args
    }

    return base_download_options;
}

async function generateArgsForSubscription(sub, user_uid, redownload = false, desired_path = null) {
    // get basePath
    let basePath = null;
    if (user_uid)
        basePath = path.join(config_api.getConfigItem('ytdl_users_base_path'), user_uid, 'subscriptions');
    else
        basePath = config_api.getConfigItem('ytdl_subscriptions_base_path');

    let appendedBasePath = getAppendedBasePath(sub, basePath);

    const file_output = config_api.getConfigItem('ytdl_default_file_output') ? config_api.getConfigItem('ytdl_default_file_output') : '%(title)s';

    let fullOutput = `"${appendedBasePath}/${file_output}.%(ext)s"`;
    if (desired_path) {
        fullOutput = `"${desired_path}.%(ext)s"`;
    } else if (sub.custom_output) {
        fullOutput = `"${appendedBasePath}/${sub.custom_output}.%(ext)s"`;
    }

    let downloadConfig = ['--dump-json', '-o', fullOutput, !redownload ? '-ciw' : '-ci', '--write-info-json', '--print-json'];

    let qualityPath = null;
    if (sub.type && sub.type === 'audio') {
        qualityPath = ['-f', 'bestaudio']
        qualityPath.push('-x');
        qualityPath.push('--audio-format', 'mp3');
    } else {
        if (!sub.maxQuality || sub.maxQuality === 'best') qualityPath = ['-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4'];
        else qualityPath = ['-f', `bestvideo[height<=${sub.maxQuality}]+bestaudio/best[height<=${sub.maxQuality}]`, '--merge-output-format', 'mp4'];
    }

    downloadConfig.push(...qualityPath)

    // skip videos that are in the archive. otherwise sub download can be permanently slow (vs. just the first time)
    const archive_text = await archive_api.generateArchive(sub.type, sub.user_uid, sub.id);
    const archive_count = archive_text.split('\n').length - 1;
    if (archive_count > 0) {
        logger.verbose(`Generating temporary archive file for subscription ${sub.name} with ${archive_count} entries.`)
        const archive_path = path.join(appendedBasePath, 'archive.txt');
        await fs.writeFile(archive_path, archive_text);
        downloadConfig.push('--download-archive', archive_path);
    }

    if (sub.custom_args) {
        const customArgsArray = sub.custom_args.split(',,');
        if (customArgsArray.indexOf('-f') !== -1) {
            // if custom args has a custom quality, replce the original quality with that of custom args
            const original_output_index = downloadConfig.indexOf('-f');
            downloadConfig.splice(original_output_index, 2);
        }
        downloadConfig.push(...customArgsArray);
    }

    if (sub.timerange && !redownload) {
        downloadConfig.push('--dateafter', sub.timerange);
    }

    let useCookies = config_api.getConfigItem('ytdl_use_cookies');
    if (useCookies) {
        if (await fs.pathExists(path.join(__dirname, 'appdata', 'cookies.txt'))) {
            downloadConfig.push('--cookies', path.join('appdata', 'cookies.txt'));
        } else {
            logger.warn('Cookies file could not be found. You can either upload one, or disable \'use cookies\' in the Advanced tab in the settings.');
        }
    }

    if (config_api.getConfigItem('ytdl_include_thumbnail')) {
        downloadConfig.push('--write-thumbnail');
    }

    const rate_limit = config_api.getConfigItem('ytdl_download_rate_limit');
    if (rate_limit && downloadConfig.indexOf('-r') === -1 && downloadConfig.indexOf('--limit-rate') === -1) {
        downloadConfig.push('-r', rate_limit);
    }

    const default_downloader = config_api.getConfigItem('ytdl_default_downloader');
    if (default_downloader === 'yt-dlp') {
        downloadConfig.push('--no-clean-info-json');
    }

    downloadConfig = utils.filterArgs(downloadConfig, ['--write-comments']);

    return downloadConfig;
}

async function getFilesToDownload(sub, output_jsons) {
    const files_to_download = [];
    for (let i = 0; i < output_jsons.length; i++) {
        const output_json = output_jsons[i];
        const file_missing = !(await db_api.getRecord('files', {sub_id: sub.id, url: output_json['webpage_url']})) && !(await db_api.getRecord('download_queue', {sub_id: sub.id, url: output_json['webpage_url'], error: null, finished: false}));
        if (file_missing) {
            const file_with_path_exists = await db_api.getRecord('files', {sub_id: sub.id, path: output_json['_filename']});
            if (file_with_path_exists) {
                // or maybe just overwrite???
                logger.info(`Skipping adding file ${output_json['_filename']} for subscription ${sub.name} as a file with that path already exists.`)
                continue;
            }
            const exists_in_archive = await archive_api.existsInArchive(output_json['extractor'], output_json['id'], sub.type, sub.user_uid, sub.id);
            if (exists_in_archive) continue;

            files_to_download.push(output_json);
        }
    }
    return files_to_download;
}

exports.cancelCheckSubscription = async (sub_id) => {
    const sub = await exports.getSubscription(sub_id);
    if (!sub['downloading'] && !sub['child_process']) {
        logger.error('Failed to cancel subscription check, verify that it is still running!');
        return false;
    }

    // if check is ongoing
    if (sub['child_process']) {
        const child_process = sub['child_process'];
        youtubedl_api.killYoutubeDLProcess(child_process);
    }

    // cancel activate video downloads
    await killSubDownloads(sub_id);

    return true;
}

async function killSubDownloads(sub_id, remove_downloads = false) {
    const sub_downloads = await db_api.getRecords('download_queue', {sub_id: sub_id});
    for (const sub_download of sub_downloads) {
        if (sub_download['running'])
            await downloader_api.cancelDownload(sub_download['uid']);
        if (remove_downloads)
            await db_api.removeRecord('download_queue', {uid: sub_download['uid']});
    }
}

exports.getSubscriptions = async (user_uid = null) => {
    // TODO: fix issue where the downloading property may not match getSubscription()
    return await db_api.getRecords('subscriptions', {user_uid: user_uid});
}

exports.getAllSubscriptions = async () => {
    const all_subs = await db_api.getRecords('subscriptions');
    const multiUserMode = config_api.getConfigItem('ytdl_multi_user_mode');
    return all_subs.filter(sub => !!(sub.user_uid) === !!multiUserMode);
}

exports.getSubscription = async (subID) => {
    // stringify and parse because we may override the 'downloading' property
    const sub = JSON.parse(JSON.stringify(await db_api.getRecord('subscriptions', {id: subID})));
    // now with the download_queue, we may need to override 'downloading'
    const current_downloads = await db_api.getRecords('download_queue', {running: true, sub_id: subID}, true);
    if (!sub['downloading']) sub['downloading'] = current_downloads > 0;
    return sub;
}

exports.getSubscriptionByName = async (subName, user_uid = null) => {
    return await db_api.getRecord('subscriptions', {name: subName, user_uid: user_uid});
}

exports.updateSubscription = async (sub) => {
    await db_api.updateRecord('subscriptions', {id: sub.id}, sub);
    exports.writeSubscriptionMetadata(sub);
    return true;
}

exports.updateSubscriptionPropertyMultiple = async (subs, assignment_obj) => {
    subs.forEach(async sub => {
        await updateSubscriptionProperty(sub, assignment_obj);
    });
}

async function updateSubscriptionProperty(sub, assignment_obj) {
    // TODO: combine with updateSubscription
    await db_api.updateRecord('subscriptions', {id: sub.id}, assignment_obj);
    return true;
}

exports.writeSubscriptionMetadata = (sub) => {
    let basePath = sub.user_uid ? path.join(config_api.getConfigItem('ytdl_users_base_path'), sub.user_uid, 'subscriptions')
                                : config_api.getConfigItem('ytdl_subscriptions_base_path');
    const appendedBasePath = getAppendedBasePath(sub, basePath);
    const metadata_path = path.join(appendedBasePath, CONSTS.SUBSCRIPTION_BACKUP_PATH);
    
    fs.ensureDirSync(appendedBasePath);
    fs.writeJSONSync(metadata_path, sub);
}

async function setFreshUploads(sub) {
    const sub_files = await db_api.getRecords('files', {sub_id: sub.id});
    if (!sub_files) return;
    const current_date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    sub_files.forEach(async file => {
        if (current_date === file['upload_date'].replace(/-/g, '')) {
            // set upload as fresh
            const file_uid = file['uid'];
            await db_api.setVideoProperty(file_uid, {'fresh_upload': true});
        }
    });
}

async function checkVideosForFreshUploads(sub, user_uid) {
    const sub_files = await db_api.getRecords('files', {sub_id: sub.id});
    const current_date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    sub_files.forEach(async file => {
        if (file['fresh_upload'] && current_date > file['upload_date'].replace(/-/g, '')) {
            await checkVideoIfBetterExists(file, sub, user_uid)
        }
    });
}

async function checkVideoIfBetterExists(file_obj, sub, user_uid) {
    const new_path = file_obj['path'].substring(0, file_obj['path'].length - 4);
    const downloadConfig = await generateArgsForSubscription(sub, user_uid, true, new_path);
    logger.verbose(`Checking if a better version of the fresh upload ${file_obj['id']} exists.`);
    // simulate a download to verify that a better version exists
    
    const info = await downloader_api.getVideoInfoByURL(file_obj['url'], downloadConfig);
    if (info && info.length === 1) {
        const metric_to_compare = sub.type === 'audio' ? 'abr' : 'height';
        if (info[metric_to_compare] > file_obj[metric_to_compare]) {
            // download new video as the simulated one is better
            let {callback} = await youtubedl_api.runYoutubeDL(sub.url, downloadConfig);
            const {parsed_output, err} = await callback;
            if (err) {
                logger.verbose(`Failed to download better version of video ${file_obj['id']}`);
            } else if (parsed_output) {
                logger.verbose(`Successfully upgraded video ${file_obj['id']}'s ${metric_to_compare} from ${file_obj[metric_to_compare]} to ${info[metric_to_compare]}`);
                await db_api.setVideoProperty(file_obj['uid'], {[metric_to_compare]: info[metric_to_compare]});
            }
        } 
    }
    await db_api.setVideoProperty(file_obj['uid'], {'fresh_upload': false});
}

// helper functions

function getAppendedBasePath(sub, base_path) {
    return path.join(base_path, (sub.isPlaylist ? 'playlists/' : 'channels/'), sub.name);
}
