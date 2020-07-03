const fs = require('fs');

let CONFIG_ITEMS = require('./consts.js')['CONFIG_ITEMS'];
const debugMode = process.env.YTDL_MODE === 'debug';

let configPath = debugMode ? '../src/assets/default.json' : 'appdata/default.json';

var logger = null;
function setLogger(input_logger) { logger = input_logger; }

function initialize(input_logger) {
    setLogger(input_logger);
    ensureConfigFileExists();
    ensureConfigItemsExist();
}

function ensureConfigItemsExist() {
    const config_keys = Object.keys(CONFIG_ITEMS);
    for (let i = 0; i < config_keys.length; i++) {
        const config_key = config_keys[i];
        getConfigItem(config_key);
    }
}

function ensureConfigFileExists() {
    if (!fs.existsSync(configPath)) {
        logger.info('Cannot find config file. Creating one with default values...');
        fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
    }
}

// https://stackoverflow.com/questions/6491463/accessing-nested-javascript-objects-with-string-key
Object.byString = function(o, s) {
    s = s.replace(/\[(\w+)\]/g, '.$1'); // convert indexes to properties
    s = s.replace(/^\./, '');           // strip a leading dot
    var a = s.split('.');
    for (var i = 0, n = a.length; i < n; ++i) {
        var k = a[i];
        if (k in o) {
            o = o[k];
        } else {
            return;
        }
    }
    return o;
}

function getParentPath(path) {
    let elements = path.split('.');
    elements.splice(elements.length - 1, 1);
    return elements.join('.');
}

function getElementNameInConfig(path) {
    let elements = path.split('.');
    return elements[elements.length - 1];
}

/**
 * Check if config exists. If not, write default config to config path
 */
function configExistsCheck() {
    let exists = fs.existsSync(configPath);
    if (!exists) {
        setConfigFile(DEFAULT_CONFIG);
    }
}

/*
* Gets config file and returns as a json
*/
function getConfigFile() {
    try {
        let raw_data = fs.readFileSync(configPath);
        let parsed_data = JSON.parse(raw_data);
        return parsed_data;
    } catch(e) {
        logger.error('Failed to get config file');
        return null;
    }
}

function setConfigFile(config) {
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        return true;
    } catch(e) {
        return false;
    }
}

function getConfigItem(key) {
    let config_json = getConfigFile();
    if (!CONFIG_ITEMS[key]) {
        logger.error(`Config item with key '${key}' is not recognized.`);
        return null;
    }
    let path = CONFIG_ITEMS[key]['path'];
    const val = Object.byString(config_json, path);
    if (val === undefined && Object.byString(DEFAULT_CONFIG, path)) {
        logger.warn(`Cannot find config with key '${key}'. Creating one with the default value...`);
        setConfigItem(key, Object.byString(DEFAULT_CONFIG, path));
        return Object.byString(DEFAULT_CONFIG, path);
    }
    return Object.byString(config_json, path);
};

function setConfigItem(key, value) {
    let success = false;
    let config_json = getConfigFile();
    let path = CONFIG_ITEMS[key]['path'];
    let element_name = getElementNameInConfig(path);
    let parent_path = getParentPath(path);
    let parent_object = Object.byString(config_json, parent_path);
    if (!parent_object) {
        let parent_parent_path = getParentPath(parent_path);
        let parent_parent_object = Object.byString(config_json, parent_parent_path);
        let parent_path_arr = parent_path.split('.');
        let parent_parent_single_key = parent_path_arr[parent_path_arr.length-1];
        parent_parent_object[parent_parent_single_key] = {};
        parent_object = Object.byString(config_json, parent_path);
    }

    if (value === 'false' || value === 'true') {
        parent_object[element_name] = (value === 'true');
    } else {
        parent_object[element_name] = value;
    }
    success = setConfigFile(config_json);

    return success;
};

function setConfigItems(items) {
    let success = false;
    let config_json = getConfigFile();
    for (let i = 0; i < items.length; i++) {
        let key = items[i].key;
        let value = items[i].value;

        // if boolean strings, set to booleans again
        if (value === 'false' || value === 'true') {
            value = (value === 'true');
        }

        let item_path = CONFIG_ITEMS[key]['path'];
        let item_parent_path = getParentPath(item_path);
        let item_element_name = getElementNameInConfig(item_path);

        let item_parent_object = Object.byString(config_json, item_parent_path);
        item_parent_object[item_element_name] = value;
    }

    success = setConfigFile(config_json);
    return success;
}

function globalArgsRequiresSafeDownload() {
    const globalArgs = getConfigItem('ytdl_custom_args').split(',,');
    const argsThatRequireSafeDownload = ['--write-sub', '--write-srt'];
    const failedArgs = globalArgs.filter(arg => argsThatRequireSafeDownload.includes(arg));
    return failedArgs && failedArgs.length > 0;
}

module.exports = {
    getConfigItem: getConfigItem,
    setConfigItem: setConfigItem,
    setConfigItems: setConfigItems,
    getConfigFile: getConfigFile,
    setConfigFile: setConfigFile,
    configExistsCheck: configExistsCheck,
    CONFIG_ITEMS: CONFIG_ITEMS,
    initialize: initialize,
    descriptors: {},
    globalArgsRequiresSafeDownload: globalArgsRequiresSafeDownload
}

DEFAULT_CONFIG = {
    "YoutubeDLMaterial": {
      "Host": {
        "url": "http://example.com",
        "port": "17442"
      },
      "Encryption": {
        "use-encryption": false,
        "cert-file-path": "/etc/letsencrypt/live/example.com/fullchain.pem",
        "key-file-path": "/etc/letsencrypt/live/example.com/privkey.pem"
      },
      "Downloader": {
        "path-audio": "audio/",
        "path-video": "video/",
        "use_youtubedl_archive": false,
        "custom_args": "",
        "safe_download_override": false
      },
      "Extra": {
        "title_top": "YoutubeDL-Material",
        "file_manager_enabled": true,
        "allow_quality_select": true,
        "download_only_mode": false,
        "allow_multi_download_mode": true,
        "settings_pin_required": false,
        "enable_downloads_manager": true
      },
      "API": {
        "use_API_key": false,
        "API_key": "",
        "use_youtube_API": false,
        "youtube_API_key": ""
      },
      "Themes": {
        "default_theme": "default",
        "allow_theme_change": true
      },
      "Subscriptions": {
        "allow_subscriptions": true,
        "subscriptions_base_path": "subscriptions/",
        "subscriptions_check_interval": "300",
        "subscriptions_use_youtubedl_archive": true
      },
      "Users": {
        "base_path": "users/",
        "allow_registration": true
      },
      "Advanced": {
        "use_default_downloading_agent": true,
        "custom_downloading_agent": "",
        "multi_user_mode": false,
        "allow_advanced_download": false,
        "use_cookies": false,
        "logger_level": "info"
      }
    }
  }
