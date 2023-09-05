const fs = require('fs-extra');
const fetch = require('node-fetch');
const execa = require('execa');
const kill = require('tree-kill');

const logger = require('./logger');
const utils = require('./utils');
const CONSTS = require('./consts');
const config_api = require('./config.js');
const youtubedl = require('youtube-dl');

const is_windows = process.platform === 'win32';

exports.youtubedl_forks = {
    'youtube-dl': {
        'download_url': 'https://github.com/ytdl-org/youtube-dl/releases/latest/download/youtube-dl',
        'tags_url': 'https://api.github.com/repos/ytdl-org/youtube-dl/tags'
    },
    'youtube-dlc': {
        'download_url': 'https://github.com/blackjack4494/yt-dlc/releases/latest/download/youtube-dlc',
        'tags_url': 'https://api.github.com/repos/blackjack4494/yt-dlc/tags'
    },
    'yt-dlp': {
        'download_url': 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp',
        'tags_url': 'https://api.github.com/repos/yt-dlp/yt-dlp/tags'
    }
}

exports.runYoutubeDL = async (url, args, downloadMethod = null) => {
    let callback = null;
    let child_process = null;
    if (downloadMethod) {
        callback = exports.runYoutubeDLMain(url, args, downloadMethod);
    } else {
        ({callback, child_process} = await runYoutubeDLProcess(url, args));
    }

    return {child_process, callback};
}

// Run youtube-dl in a main thread (with possible downloadMethod)
exports.runYoutubeDLMain = async (url, args, downloadMethod = youtubedl.exec) => {
    return new Promise(resolve => {
        downloadMethod(url, args, {maxBuffer: Infinity}, async function(err, output) {
            const parsed_output = utils.parseOutputJSON(output, err);
            resolve({parsed_output, err});
        });
    });
}

// Run youtube-dl in a subprocess
const runYoutubeDLProcess = async (url, args) => {
    const child_process = execa(await getYoutubeDLPath(), [url, ...args], {maxBuffer: Infinity});
    const callback = new Promise(async resolve => {
        try {
            const {stdout, stderr} = await child_process;
            const parsed_output = utils.parseOutputJSON(stdout.trim().split(/\r?\n/), stderr);
            resolve({parsed_output, err: stderr});
        } catch (e) {
            resolve({parsed_output: null, err: e})
        }
    });
    return {child_process, callback}
}

async function getYoutubeDLPath() {
    const guessed_base_path = 'node_modules/youtube-dl/bin/';
    return guessed_base_path + 'youtube-dl' + (is_windows ? '.exe' : '');
}

exports.killYoutubeDLProcess = async (child_process) => {
    kill(child_process.pid, 'SIGKILL');
}

exports.checkForYoutubeDLUpdate = async () => {
    const default_downloader = config_api.getConfigItem('ytdl_default_downloader');
    // get current version
    let current_app_details_exists = fs.existsSync(CONSTS.DETAILS_BIN_PATH);
    if (!current_app_details_exists) {
        logger.warn(`Failed to get youtube-dl binary details at location '${CONSTS.DETAILS_BIN_PATH}'. Generating file...`);
        fs.writeJSONSync(CONSTS.DETAILS_BIN_PATH, {"version": CONSTS.OUTDATED_YOUTUBEDL_VERSION, "downloader": default_downloader});
    }
    let current_app_details = JSON.parse(fs.readFileSync(CONSTS.DETAILS_BIN_PATH));
    let current_version = current_app_details['version'];
    let current_downloader = current_app_details['downloader'];
    let stored_binary_path = current_app_details['path'];
    if (!stored_binary_path || typeof stored_binary_path !== 'string') {
        // logger.info(`INFO: Failed to get youtube-dl binary path at location: ${CONSTS.DETAILS_BIN_PATH}, attempting to guess actual path...`);
        const guessed_base_path = 'node_modules/youtube-dl/bin/';
        const guessed_file_path = guessed_base_path + 'youtube-dl' + (is_windows ? '.exe' : '');
        if (fs.existsSync(guessed_file_path)) {
            stored_binary_path = guessed_file_path;
            // logger.info('INFO: Guess successful! Update process continuing...')
        } else {
            logger.error(`Guess '${guessed_file_path}' is not correct. Cancelling update check. Verify that your youtube-dl binaries exist by running npm install.`);
            return null;
        }
    }

    // got version, now let's check the latest version from the youtube-dl API
    return await getLatestUpdateVersion(default_downloader, current_downloader, current_version)
}

exports.updateYoutubeDL = async (latest_update_version, custom_output_path = null) => {
    const default_downloader = config_api.getConfigItem('ytdl_default_downloader');
    await downloadLatestYoutubeDLBinaryGeneric(default_downloader, latest_update_version, custom_output_path);
}

exports.verifyBinaryExists = () => {
    const details_json = fs.readJSONSync(CONSTS.DETAILS_BIN_PATH);
    if (!is_windows && details_json && (!details_json['path'] || details_json['path'].includes('.exe'))) {
        details_json['path'] = 'node_modules/youtube-dl/bin/youtube-dl';
        details_json['exec'] = 'youtube-dl';
        details_json['version'] = CONSTS.OUTDATED_YOUTUBEDL_VERSION;
        fs.writeJSONSync(CONSTS.DETAILS_BIN_PATH, details_json);

        utils.restartServer();
    }
}

async function downloadLatestYoutubeDLBinaryGeneric(youtubedl_fork, new_version, custom_output_path = null) {
    const file_ext = is_windows ? '.exe' : '';

    // build the URL
    const download_url = `${exports.youtubedl_forks[youtubedl_fork]['download_url']}${file_ext}`;
    const output_path = custom_output_path || `node_modules/youtube-dl/bin/youtube-dl${file_ext}`;

    await utils.fetchFile(download_url, output_path, `youtube-dl ${new_version}`);

    updateDetailsJSON(new_version, youtubedl_fork);
}

const getLatestUpdateVersion = async (youtubedl_fork, current_downloader, current_version) => {
    const tags_url = exports.youtubedl_forks[youtubedl_fork]['tags_url'];
    return new Promise(resolve => {
        fetch(tags_url, {method: 'Get'})
        .then(async res => res.json())
        .then(async (json) => {
            // check if the versions are different
            if (!json || !json[0]) {
                logger.error(`Failed to check ${youtubedl_fork} version for an update.`)
                resolve(null);
                return;
            }
            const latest_update_version = json[0]['name'];
            if (current_version !== latest_update_version ||
                youtubedl_fork !== current_downloader) {
                // versions different or different downloader is being used, download new update
                resolve(latest_update_version);
            } else {
                resolve(null);
            }
            return;
        })
        .catch(err => {
            logger.error(`Failed to check ${youtubedl_fork} version for an update.`)
            logger.error(err);
            resolve(null);
            return;
        });
    });
}

function updateDetailsJSON(new_version, downloader) {
    const details_json = fs.readJSONSync(CONSTS.DETAILS_BIN_PATH);
    if (new_version) details_json['version'] = new_version;
    details_json['downloader'] = downloader;
    fs.writeJSONSync(CONSTS.DETAILS_BIN_PATH, details_json);
}
