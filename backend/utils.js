const fs = require('fs-extra');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const archiver = require('archiver');
const fetch = require('node-fetch');
const ProgressBar = require('progress');
const winston = require('winston');

const config_api = require('./config');
const logger = require('./logger');
const CONSTS = require('./consts');

const is_windows = process.platform === 'win32';

// replaces .webm with appropriate extension
exports.getTrueFileName = (unfixed_path, type, force_ext = null) => {
    let fixed_path = unfixed_path;

    const new_ext = (type === 'audio' ? 'mp3' : 'mp4');
    let unfixed_parts = unfixed_path.split('.');
    const old_ext = unfixed_parts[unfixed_parts.length-1];


    if (old_ext !== new_ext) {
        unfixed_parts[unfixed_parts.length-1] = force_ext || new_ext;
        fixed_path = unfixed_parts.join('.');
    }
    return fixed_path;
}

exports.getDownloadedFilesByType = async (basePath, type, full_metadata = false) => {
    // return empty array if the path doesn't exist
    if (!(await fs.pathExists(basePath))) return [];

    let files = [];
    const ext = type === 'audio' ? 'mp3' : 'mp4';
    var located_files = await exports.recFindByExt(basePath, ext);
    for (let i = 0; i < located_files.length; i++) {
        let file = located_files[i];
        var file_path = file.substring(basePath.includes('\\') ? basePath.length+1 : basePath.length, file.length);

        var stats = await fs.stat(file);

        var id = file_path.substring(0, file_path.length-4);
        var jsonobj = await exports.getJSONByType(type, id, basePath);
        if (!jsonobj) continue;
        if (full_metadata) {
            jsonobj['id'] = id;
            files.push(jsonobj);
            continue;
        }
        var upload_date = exports.formatDateString(jsonobj.upload_date);

        var isaudio = type === 'audio';
        var file_obj = new exports.File(id, jsonobj.title, jsonobj.thumbnail, isaudio, jsonobj.duration, jsonobj.webpage_url, jsonobj.uploader,
                                stats.size, file, upload_date, jsonobj.description, jsonobj.view_count, jsonobj.height, jsonobj.abr);
        files.push(file_obj);
    }
    return files;
}

exports.createContainerZipFile = async (file_name, container_file_objs) => {
    const container_files_to_download = [];
    for (let i = 0; i < container_file_objs.length; i++) {
        const container_file_obj = container_file_objs[i];
        container_files_to_download.push(container_file_obj.path);
    }
    return await exports.createZipFile(path.join('appdata', file_name + '.zip'), container_files_to_download);
}

exports.createZipFile = async (zip_file_path, file_paths) => {
    let output = fs.createWriteStream(zip_file_path);

    var archive = archiver('zip', {
        gzip: true,
        zlib: { level: 9 } // Sets the compression level.
    });

    archive.on('error', function(err) {
        logger.error(err);
        throw err;
    });

    // pipe archive data to the output file
    archive.pipe(output);

    for (let file_path of file_paths) {
        const file_name = path.parse(file_path).base;
        archive.file(file_path, {name: file_name})
    }

    await archive.finalize();

    // wait a tiny bit for the zip to reload in fs
    await exports.wait(100);
    return zip_file_path;
}

exports.getJSONMp4 = (name, customPath, openReadPerms = false) => {
    var obj = null; // output
    if (!customPath) customPath = config_api.getConfigItem('ytdl_video_folder_path');
    var jsonPath = path.join(customPath, name + ".info.json");
    var alternateJsonPath = path.join(customPath, name + ".mp4.info.json");
    if (fs.existsSync(jsonPath))
    {
        obj = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } else if (fs.existsSync(alternateJsonPath)) {
        obj = JSON.parse(fs.readFileSync(alternateJsonPath, 'utf8'));
    }
    else obj = 0;
    return obj;
}

exports.getJSONMp3 = (name, customPath, openReadPerms = false) => {
    var obj = null;
    if (!customPath) customPath = config_api.getConfigItem('ytdl_audio_folder_path');
    var jsonPath = path.join(customPath, name + ".info.json");
    var alternateJsonPath = path.join(customPath, name + ".mp3.info.json");
    if (fs.existsSync(jsonPath)) {
        obj = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    }
    else if (fs.existsSync(alternateJsonPath)) {
        obj = JSON.parse(fs.readFileSync(alternateJsonPath, 'utf8'));
    }
    else
        obj = 0;

    return obj;
}

exports.getJSON = (file_path, type) => {
    const ext = type === 'audio' ? '.mp3' : '.mp4';
    let obj = null;
    var jsonPath = exports.removeFileExtension(file_path) + '.info.json';
    var alternateJsonPath = exports.removeFileExtension(file_path) + `${ext}.info.json`;
    if (fs.existsSync(jsonPath))
    {
        obj = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } else if (fs.existsSync(alternateJsonPath)) {
        obj = JSON.parse(fs.readFileSync(alternateJsonPath, 'utf8'));
    }
    else obj = 0;
    return obj;
}

exports.getJSONByType = (type, name, customPath, openReadPerms = false) => {
    return type === 'audio' ? exports.getJSONMp3(name, customPath, openReadPerms) : exports.getJSONMp4(name, customPath, openReadPerms)
}

exports.getDownloadedThumbnail = (file_path) => {
    const file_path_no_extension = exports.removeFileExtension(file_path);

    let jpgPath = file_path_no_extension + '.jpg';
    let webpPath = file_path_no_extension + '.webp';
    let pngPath = file_path_no_extension + '.png';

    if (fs.existsSync(jpgPath))
        return jpgPath;
    else if (fs.existsSync(webpPath))
        return webpPath;
    else if (fs.existsSync(pngPath))
        return pngPath;
    else
        return null;
}

exports.getExpectedFileSize = (input_info_jsons) => {
    // treat single videos as arrays to have the file sizes checked/added to. makes the code cleaner
    const info_jsons = Array.isArray(input_info_jsons) ? input_info_jsons : [input_info_jsons];

    let expected_filesize = 0;
    info_jsons.forEach(info_json => {
        const formats = info_json['format_id'].split('+');
        let individual_expected_filesize = 0;
        formats.forEach(format_id => {
            if (info_json.formats !== undefined) {
                info_json.formats.forEach(available_format => {
                  if (available_format.format_id === format_id && (available_format.filesize || available_format.filesize_approx)) {
                    individual_expected_filesize += (available_format.filesize ? available_format.filesize : available_format.filesize_approx);
                  }
                });
            }
        });
        expected_filesize += individual_expected_filesize;
    });

    return expected_filesize;
}

exports.fixVideoMetadataPerms = (file_path, type) => {
    if (is_windows) return;

    const ext = type === 'audio' ? '.mp3' : '.mp4';

    const file_path_no_extension = exports.removeFileExtension(file_path);

    const files_to_fix = [
        // JSONs
        file_path_no_extension + '.info.json',
        file_path_no_extension + ext + '.info.json',
        // Thumbnails
        file_path_no_extension + '.webp',
        file_path_no_extension + '.jpg'
    ];

    for (const file of files_to_fix) {
        if (!fs.existsSync(file)) continue;
        fs.chmodSync(file, 0o644);
    }
}

exports.deleteJSONFile = (file_path, type) => {
    const ext = type === 'audio' ? '.mp3' : '.mp4';

    const file_path_no_extension = exports.removeFileExtension(file_path);

    let json_path = file_path_no_extension + '.info.json';
    let alternate_json_path = file_path_no_extension + ext + '.info.json';

    if (fs.existsSync(json_path)) fs.unlinkSync(json_path);
    if (fs.existsSync(alternate_json_path)) fs.unlinkSync(alternate_json_path);
}

exports.durationStringToNumber = (dur_str) => {
    if (typeof dur_str === 'number') return dur_str;
    let num_sum = 0;
    const dur_str_parts = dur_str.split(':');
    for (let i = dur_str_parts.length-1; i >= 0; i--) {
      num_sum += parseInt(dur_str_parts[i])*(60**(dur_str_parts.length-1-i));
    }
    return num_sum;
}

exports.getMatchingCategoryFiles = (category, files) => {
    return files && files.filter(file => file.category && file.category.uid === category.uid);
}

exports.addUIDsToCategory = (category, files) => {
    const files_that_match = exports.getMatchingCategoryFiles(category, files);
    category['uids'] = files_that_match.map(file => file.uid);
    return files_that_match;
}

exports.recFindByExt = async (base, ext, files, result, recursive = true) => {
    files = files || (await fs.readdir(base))
    result = result || []

    for (const file of files) {
        var newbase = path.join(base,file)
        if ( (await fs.stat(newbase)).isDirectory() )
        {
            if (!recursive) continue;
            result = await exports.recFindByExt(newbase,ext,await fs.readdir(newbase),result)
        }
        else
        {
            if ( file.substr(-1*(ext.length+1)) == '.' + ext )
            {
                result.push(newbase)
            }
        }
    }
    return result
}

exports.removeFileExtension = (filename) => {
    const filename_parts = filename.split('.');
    filename_parts.splice(filename_parts.length - 1);
    return filename_parts.join('.');
}

exports.formatDateString = (date_string) => {
    return date_string ? `${date_string.substring(0, 4)}-${date_string.substring(4, 6)}-${date_string.substring(6, 8)}` : 'N/A';
}

exports.createEdgeNGrams = (str) => {
    if (str && str.length > 3) {
        const minGram = 3
        const maxGram = str.length

        return str.split(" ").reduce((ngrams, token) => {
            if (token.length > minGram) {
                for (let i = minGram; i <= maxGram && i <= token.length; ++i) {
                    ngrams = [...ngrams, token.substr(0, i)]
                }
            } else {
                ngrams = [...ngrams, token]
            }
            return ngrams
        }, []).join(" ")
    }

    return str
}

// ffmpeg helper functions

exports.cropFile = async (file_path, start, end, ext) => {
    return new Promise(resolve => {
        const temp_file_path = `${file_path}.cropped${ext}`;
        let base_ffmpeg_call = ffmpeg(file_path);
        if (start) {
            base_ffmpeg_call = base_ffmpeg_call.seekOutput(start);
        }
        if (end) {
            base_ffmpeg_call = base_ffmpeg_call.duration(end - start);
        }
        base_ffmpeg_call
            .on('end', () => {
                logger.verbose(`Cropping for '${file_path}' complete.`);
                fs.unlinkSync(file_path);
                fs.moveSync(temp_file_path, file_path);
                resolve(true);
            })
            .on('error', (err) => {
                logger.error(`Failed to crop ${file_path}.`);
                logger.error(err);
                resolve(false);
            }).save(temp_file_path);
    });
}

/**
 * setTimeout, but its a promise.
 * @param {number} ms
 */
exports.wait = async (ms) => {
    await new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

exports.checkExistsWithTimeout = async (filePath, timeout) => {
    return new Promise(function (resolve, reject) {

        var timer = setTimeout(function () {
            if (watcher) watcher.close();
            reject(new Error('File did not exists and was not created during the timeout.'));
        }, timeout);

        fs.access(filePath, fs.constants.R_OK, function (err) {
            if (!err) {
                clearTimeout(timer);
                if (watcher) watcher.close();
                resolve(true);
            }
        });

        var dir = path.dirname(filePath);
        var basename = path.basename(filePath);
        var watcher = fs.watch(dir, function (eventType, filename) {
            if (eventType === 'rename' && filename === basename) {
                clearTimeout(timer);
                if (watcher) watcher.close();
                resolve(true);
            }
        });
    });
}

// helper function to download file using fetch
exports.fetchFile = async (url, path, file_label) => {
    var len = null;
    const res = await fetch(url);

    len = parseInt(res.headers.get("Content-Length"), 10);

    var bar = new ProgressBar(`  Downloading ${file_label} [:bar] :percent :etas`, {
        complete: '=',
        incomplete: ' ',
        width: 20,
        total: len
    });
    const fileStream = fs.createWriteStream(path);
    await new Promise((resolve, reject) => {
        res.body.pipe(fileStream);
        res.body.on("error", (err) => {
          reject(err);
        });
        res.body.on('data', function (chunk) {
            bar.tick(chunk.length);
        });
        fileStream.on("finish", function() {
          resolve();
        });
    });
}

exports.restartServer = async (is_update = false) => {
    logger.info(`${is_update ? 'Update complete! ' : ''}Restarting server...`);

    // the following line restarts the server through pm2
    fs.writeFileSync(`restart${is_update ? '_update' : '_general'}.json`, 'internal use only');
    process.exit(1);
}

// adds or replaces args according to the following rules:
//  - if it already exists and has value, then replace both arg and value
//  - if already exists and doesn't have value, ignore
//  - if it doesn't exist and has value, add both arg and value
//  - if it doesn't exist and doesn't have value, add arg
exports.injectArgs = (original_args, new_args) => {
    const updated_args = original_args.slice();
    try {
        for (let i = 0; i < new_args.length; i++) {
            const new_arg = new_args[i];
            if (!new_arg.startsWith('-') && !new_arg.startsWith('--') && i > 0 && original_args.includes(new_args[i - 1])) continue;

            if (CONSTS.YTDL_ARGS_WITH_VALUES.has(new_arg)) {
                if (original_args.includes(new_arg)) {
                    const original_index = original_args.indexOf(new_arg);
                    updated_args.splice(original_index, 2);
                }

                updated_args.push(new_arg, new_args[i + 1]);
                i++; // we need to skip the arg value on the next loop
            } else {
                if (!original_args.includes(new_arg)) {
                    updated_args.push(new_arg);
                }
            }
        }
    } catch (err) {
        logger.warn(err);
        logger.warn(`Failed to inject args (${new_args}) into (${original_args})`);
    }

    return updated_args;
}

exports.filterArgs = (args, args_to_remove) => {
    return args.filter(x => !args_to_remove.includes(x));
}

exports.searchObjectByString = (o, s) => {
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

exports.stripPropertiesFromObject = (obj, properties, whitelist = false) => {
    if (!whitelist) {
        const new_obj = JSON.parse(JSON.stringify(obj));
        for (let field of properties) {
            delete new_obj[field];
        }
        return new_obj;
    }

    const new_obj = {};
    for (let field of properties) {
        new_obj[field] = obj[field];
    }
    return new_obj;
}

exports.getArchiveFolder = (type, user_uid = null, sub = null) => {
    const usersFolderPath = config_api.getConfigItem('ytdl_users_base_path');
    const subsFolderPath  = config_api.getConfigItem('ytdl_subscriptions_base_path');

    if (user_uid) {
        if (sub) {
            return path.join(usersFolderPath, user_uid, 'subscriptions', 'archives', sub.name);
        } else {
            return path.join(usersFolderPath, user_uid, type, 'archives');
        }
    } else {
        if (sub) {
            return path.join(subsFolderPath, 'archives', sub.name);
        } else {
            return path.join('appdata', 'archives');
        }
    }
}

exports.getBaseURL = () => {
    return `${config_api.getConfigItem('ytdl_url')}:${config_api.getConfigItem('ytdl_port')}`
}

exports.updateLoggerLevel = (new_logger_level) => {
    const possible_levels = ['error', 'warn', 'info', 'verbose', 'debug'];
    if (!possible_levels.includes(new_logger_level)) {
        logger.error(`${new_logger_level} is not a valid logger level! Choose one of the following: ${possible_levels.join(', ')}.`)
        new_logger_level = 'info';
    }
    logger.level = new_logger_level;
    winston.loggers.get('console').level = new_logger_level;
    logger.transports[2].level = new_logger_level;
}

exports.convertFlatObjectToNestedObject = (obj) => {
    const result = {};
    for (const key in obj) {
      const nestedKeys = key.split('.');
      let currentObj = result;
      for (let i = 0; i < nestedKeys.length; i++) {
        if (i === nestedKeys.length - 1) {
          currentObj[nestedKeys[i]] = obj[key];
        } else {
          currentObj[nestedKeys[i]] = currentObj[nestedKeys[i]] || {};
          currentObj = currentObj[nestedKeys[i]];
        }
      }
    }
    return result;
}

exports.getDirectoriesInDirectory = async (basePath) => {
    try {
        const files = await fs.readdir(basePath, { withFileTypes: true });
        return files
            .filter((file) => file.isDirectory())
            .map((file) => path.join(basePath, file.name));
    } catch (err) {
        return [];
    }
}

exports.parseOutputJSON = (output, err) => {
    let split_output = [];
    // const output_jsons = [];
    if (err && !output) {
        if (!err.stderr.includes('This video is unavailable') && !err.stderr.includes('Private video')) {
            return null;
        }
        logger.info('An error was encountered with at least one video, backup method will be used.')
        try {
            split_output = err.stdout.split(/\r\n|\r|\n/);
        } catch (e) {
            logger.error('Backup method failed. See error below:');
            logger.error(e);
            return null;
        }
    } else if (output.length === 0 || (output.length === 1 && output[0].length === 0)) {
        // output is '' or ['']
        return [];
    } else {
        for (const output_item of output) {
            // we have to do this because sometimes there will be leading characters before the actual json
            const start_idx = output_item.indexOf('{"');
            const clean_output = output_item.slice(start_idx, output_item.length);
            split_output.push(clean_output);
        }
    }

    try {
        return split_output.map(split_output_str => JSON.parse(split_output_str));
    } catch(e) {
        return null;
    }
}

// objects

function File(id, title, thumbnailURL, isAudio, duration, url, uploader, size, path, upload_date, description, view_count, height, abr) {
    this.id = id;
    this.title = title;
    this.thumbnailURL = thumbnailURL;
    this.isAudio = isAudio;
    this.duration = duration;
    this.url = url;
    this.uploader = uploader;
    this.size = size;
    this.path = path;
    this.upload_date = upload_date;
    this.description = description;
    this.view_count = view_count;
    this.height = height;
    this.abr = abr;
    this.favorite = false;
}   
exports.File = File;

