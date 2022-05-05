const fs = require('fs-extra');
const fetch = require('node-fetch');

const logger = require('./logger');
const utils = require('./utils');
const CONSTS = require('./consts');
const config_api = require('./config.js');

const OUTDATED_VERSION = "2020.00.00";

const is_windows = process.platform === 'win32';

const download_sources = {
    'youtube-dl': {
        'tags_url': 'https://api.github.com/repos/ytdl-org/youtube-dl/tags',
        'func': downloadLatestYoutubeDLBinary
    },
    'youtube-dlc': {
        'tags_url': 'https://api.github.com/repos/blackjack4494/yt-dlc/tags',
        'func': downloadLatestYoutubeDLCBinary
    },
    'yt-dlp': {
        'tags_url': 'https://api.github.com/repos/yt-dlp/yt-dlp/tags',
        'func': downloadLatestYoutubeDLPBinary
    }
}

exports.checkForYoutubeDLUpdate = async () => {
    return new Promise(async resolve => {
        const default_downloader = config_api.getConfigItem('ytdl_default_downloader');
        const tags_url = download_sources[default_downloader]['tags_url'];
        // get current version
        let current_app_details_exists = fs.existsSync(CONSTS.DETAILS_BIN_PATH);
        if (!current_app_details_exists) {
            logger.warn(`Failed to get youtube-dl binary details at location '${CONSTS.DETAILS_BIN_PATH}'. Generating file...`);
            fs.writeJSONSync(CONSTS.DETAILS_BIN_PATH, {"version": OUTDATED_VERSION, "downloader": default_downloader});
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
                resolve(null);
                return;
            }
        }

        // got version, now let's check the latest version from the youtube-dl API


        fetch(tags_url, {method: 'Get'})
        .then(async res => res.json())
        .then(async (json) => {
            // check if the versions are different
            if (!json || !json[0]) {
                logger.error(`Failed to check ${default_downloader} version for an update.`)
                resolve(null);
                return;
            }
            const latest_update_version = json[0]['name'];
            if (current_version !== latest_update_version || default_downloader !== current_downloader) {
                // versions different or different downloader is being used, download new update
                resolve(latest_update_version);
            } else {
                resolve(null);
            }
            return;
        })
        .catch(err => {
            logger.error(`Failed to check ${default_downloader} version for an update.`)
            logger.error(err);
            resolve(null);
            return;
        });
    });
}

exports.updateYoutubeDL = async (latest_update_version) => {
    const default_downloader = config_api.getConfigItem('ytdl_default_downloader');
    await download_sources[default_downloader]['func'](latest_update_version);
}

exports.verifyBinaryExistsLinux = () => {
    const details_json = fs.readJSONSync(CONSTS.DETAILS_BIN_PATH);
    if (!is_windows && details_json && details_json['path'] && details_json['path'].includes('.exe')) {
        details_json['path'] = 'node_modules/youtube-dl/bin/youtube-dl';
        details_json['exec'] = 'youtube-dl';
        details_json['version'] = OUTDATED_VERSION;
        fs.writeJSONSync(CONSTS.DETAILS_BIN_PATH, details_json);

        utils.restartServer();
    }
}

async function downloadLatestYoutubeDLBinary(new_version) {
    const file_ext = is_windows ? '.exe' : '';

    const download_url = `https://github.com/ytdl-org/youtube-dl/releases/latest/download/youtube-dl${file_ext}`;
    const output_path = `node_modules/youtube-dl/bin/youtube-dl${file_ext}`;

    await utils.fetchFile(download_url, output_path, `youtube-dl ${new_version}`);

    updateDetailsJSON(new_version, 'youtube-dl');
}

async function downloadLatestYoutubeDLCBinary(new_version) {
    const file_ext = is_windows ? '.exe' : '';

    const download_url = `https://github.com/blackjack4494/yt-dlc/releases/latest/download/youtube-dlc${file_ext}`;
    const output_path = `node_modules/youtube-dl/bin/youtube-dl${file_ext}`;

    await utils.fetchFile(download_url, output_path, `youtube-dlc ${new_version}`);

    updateDetailsJSON(new_version, 'youtube-dlc');
}

async function downloadLatestYoutubeDLPBinary(new_version) {
    const file_ext = is_windows ? '.exe' : '';

    const download_url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp${file_ext}`;
    const output_path = `node_modules/youtube-dl/bin/youtube-dl${file_ext}`;

    await utils.fetchFile(download_url, output_path, `yt-dlp ${new_version}`);

    updateDetailsJSON(new_version, 'yt-dlp');
}

function updateDetailsJSON(new_version, downloader) {
    const details_json = fs.readJSONSync(CONSTS.DETAILS_BIN_PATH);
    if (new_version) details_json['version'] = new_version;
    details_json['downloader'] = downloader;
    fs.writeJSONSync(CONSTS.DETAILS_BIN_PATH, details_json);
}
