const fs = require('fs');

let CONFIG_ITEMS = require('./consts.js')['CONFIG_ITEMS'];

let configPath = 'config/default.json';

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

/*
* Gets config file and returns as a json
*/
function getConfigFile() {
    let raw_data = fs.readFileSync(configPath);
    try {
        let parsed_data = JSON.parse(raw_data);
        return parsed_data;
    } catch(e) {
        console.log('ERROR: Failed to get config file');
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
    if (!CONFIG_ITEMS[key]) console.log('cannot find config with key ' + key);
    let path = CONFIG_ITEMS[key]['path'];
    return Object.byString(config_json, path);
};

function setConfigItem(key, value) {
    let success = false;
    let config_json = getConfigFile();
    let path = CONFIG_ITEMS[key]['path'];
    let parent_path = getParentPath(path);
    let element_name = getElementNameInConfig(path);
    
    let parent_object = Object.byString(config_json, parent_path);
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

module.exports = {
    getConfigItem: getConfigItem,
    setConfigItem: setConfigItem,
    setConfigItems: setConfigItems,
    CONFIG_ITEMS: CONFIG_ITEMS
}