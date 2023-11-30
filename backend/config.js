const logger = require('./logger');

const fs = require('fs');
const { BehaviorSubject } = require('rxjs');

exports.CONFIG_ITEMS = require('./consts.js')['CONFIG_ITEMS'];
exports.descriptors = {}; // to get rid of file locks when needed, TODO: move to youtube-dl.js

const debugMode = process.env.YTDL_MODE === 'debug';

let configPath = debugMode ? '../src/assets/default.json' : 'appdata/default.json';
exports.config_updated = new BehaviorSubject();

exports.initialize = () => {
    ensureConfigFileExists();
    ensureConfigItemsExist();
}

function ensureConfigItemsExist() {
    const config_keys = Object.keys(exports.CONFIG_ITEMS);
    for (let i = 0; i < config_keys.length; i++) {
        const config_key = config_keys[i];
        exports.getConfigItem(config_key);
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
exports.configExistsCheck = () => {
    let exists = fs.existsSync(configPath);
    if (!exists) {
        exports.setConfigFile(DEFAULT_CONFIG);
    }
}

/*
* Gets config file and returns as a json
*/
exports.getConfigFile = () => {
    try {
        let raw_data = fs.readFileSync(configPath);
        let parsed_data = JSON.parse(raw_data);
        return parsed_data;
    } catch(e) {
        logger.error('Failed to get config file');
        return null;
    }
}

exports.setConfigFile = (config) => {
    try {
        const old_config = exports.getConfigFile();
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        const changes = exports.findChangedConfigItems(old_config, config);
        if (changes.length > 0) {
            for (const change of changes) exports.config_updated.next(change);
        }
        return true;
    } catch(e) {
        return false;
    }
}

exports.getConfigItem = (key) => {
    let config_json = exports.getConfigFile();
    if (!exports.CONFIG_ITEMS[key]) {
        logger.error(`Config item with key '${key}' is not recognized.`);
        return null;
    }
    let path = exports.CONFIG_ITEMS[key]['path'];
    const val = Object.byString(config_json, path);
    if (val === undefined && Object.byString(DEFAULT_CONFIG, path) !== undefined) {
        logger.warn(`Cannot find config with key '${key}'. Creating one with the default value...`);
        exports.setConfigItem(key, Object.byString(DEFAULT_CONFIG, path));
        return Object.byString(DEFAULT_CONFIG, path);
    }
    return Object.byString(config_json, path);
}

exports.setConfigItem = (key, value) => {
    let success = false;
    let config_json = exports.getConfigFile();
    let path = exports.CONFIG_ITEMS[key]['path'];
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
    if (value === 'false') value = false;
    if (value === 'true') value = true;
    parent_object[element_name] = value;

    success = exports.setConfigFile(config_json);

    return success;
}

exports.setConfigItems = (items) => {
    let success = false;
    let config_json = exports.getConfigFile();
    for (let i = 0; i < items.length; i++) {
        let key = items[i].key;
        let value = items[i].value;

        // if boolean strings, set to booleans again
        if (value === 'false' || value === 'true') {
            value = (value === 'true');
        }

        let item_path = exports.CONFIG_ITEMS[key]['path'];
        let item_parent_path = getParentPath(item_path);
        let item_element_name = getElementNameInConfig(item_path);

        let item_parent_object = Object.byString(config_json, item_parent_path);
        item_parent_object[item_element_name] = value;
    }

    success = exports.setConfigFile(config_json);
    return success;
}

exports.globalArgsRequiresSafeDownload = () => {
    const globalArgs = exports.getConfigItem('ytdl_custom_args').split(',,');
    const argsThatRequireSafeDownload = ['--write-sub', '--write-srt', '--proxy'];
    const failedArgs = globalArgs.filter(arg => argsThatRequireSafeDownload.includes(arg));
    return failedArgs && failedArgs.length > 0;
}

exports.findChangedConfigItems = (old_config, new_config, path = '', changedConfigItems = [], depth = 0) => {
    if (typeof old_config === 'object' && typeof new_config === 'object' && depth < 3) {
        for (const key in old_config) {
            if (Object.prototype.hasOwnProperty.call(new_config, key)) {
                exports.findChangedConfigItems(old_config[key], new_config[key], `${path}${path ? '.' : ''}${key}`, changedConfigItems, depth + 1);
            }
        }
    } else {
        if (JSON.stringify(old_config) !== JSON.stringify(new_config)) {
            const key = getConfigItemKeyByPath(path);
            changedConfigItems.push({
                key: key ? key : path.split('.')[path.split('.').length - 1], // return key in CONFIG_ITEMS or the object key
                old_value: JSON.parse(JSON.stringify(old_config)),
                new_value: JSON.parse(JSON.stringify(new_config))
            });
        }
    }
    return changedConfigItems;
}

function getConfigItemKeyByPath(path) {
    const found_item = Object.values(exports.CONFIG_ITEMS).find(item => item.path === path);
    if (found_item) return found_item['key'];
    else return null;
}

const DEFAULT_CONFIG = {
    "YoutubeDLMaterial": {
      "Host": {
        "url": "http://example.com",
        "port": "17442"
      },
      "Downloader": {
        "path-audio": "audio/",
        "path-video": "video/",
        "default_file_output": "",
        "use_youtubedl_archive": false,
        "custom_args": "",
        "include_thumbnail": true,
        "include_metadata": true,
        "max_concurrent_downloads": 5,
        "download_rate_limit": ""
      },
      "Extra": {
        "title_top": "YoutubeDL-Material",
        "file_manager_enabled": true,
        "allow_quality_select": true,
        "download_only_mode": false,
        "force_autoplay": false,
        "enable_downloads_manager": true,
        "allow_playlist_categorization": true,
        "enable_notifications": true,
        "enable_all_notifications": true,
        "allowed_notification_types": [],
        "enable_rss_feed": false,
      },
      "API": {
        "use_API_key": false,
        "API_key": "",
        "use_youtube_API": false,
        "youtube_API_key": "",
        "twitch_auto_download_chat": false,
        "use_sponsorblock_API": false,
        "generate_NFO_files": false,
        "use_ntfy_API": false,
        "ntfy_topic_URL": "",
        "use_gotify_API": false,
        "gotify_server_URL": "",
        "gotify_app_token": "",
        "use_telegram_API": false,
        "telegram_bot_token": "",
        "telegram_chat_id": "",
        "telegram_webhook_proxy": "",
        "webhook_URL": "",
        "discord_webhook_URL": "",
        "slack_webhook_URL": "",
      },
      "Themes": {
        "default_theme": "default",
        "allow_theme_change": true
      },
      "Subscriptions": {
        "allow_subscriptions": true,
        "subscriptions_base_path": "subscriptions/",
        "subscriptions_check_interval": "86400",
        "redownload_fresh_uploads": false
      },
      "Users": {
        "base_path": "users/",
        "allow_registration": true,
        "auth_method": "internal",
        "ldap_config": {
            "url": "ldap://localhost:389",
            "bindDN": "cn=root",
            "bindCredentials": "secret",
            "searchBase": "ou=passport-ldapauth",
            "searchFilter": "(uid={{username}})"
        }
      },
      "Database": {
        "use_local_db": true,
        "mongodb_connection_string": "mongodb://127.0.0.1:27017/?compressors=zlib"
      },
      "Advanced": {
        "default_downloader": "yt-dlp",
        "use_default_downloading_agent": true,
        "custom_downloading_agent": "",
        "multi_user_mode": false,
        "allow_advanced_download": false,
        "use_cookies": false,
        "jwt_expiration": 86400,
        "logger_level": "info"
      }
    }
  }
