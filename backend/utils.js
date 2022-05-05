const fs = require('fs-extra');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const archiver = require('archiver');
const fetch = require('node-fetch');
const ProgressBar = require('progress');

const config_api = require('./config');
const logger = require('./logger');
const CONSTS = require('./consts');

const is_windows = process.platform === 'win32';

// replaces .webm with appropriate extension
function getTrueFileName(unfixed_path, type) {
    let fixed_path = unfixed_path;

    const new_ext = (type === 'audio' ? 'mp3' : 'mp4');
    let unfixed_parts = unfixed_path.split('.');
    const old_ext = unfixed_parts[unfixed_parts.length-1];


    if (old_ext !== new_ext) {
        unfixed_parts[unfixed_parts.length-1] = new_ext;
        fixed_path = unfixed_parts.join('.');
    }
    return fixed_path;
}

async function getDownloadedFilesByType(basePath, type, full_metadata = false) {
    // return empty array if the path doesn't exist
    if (!(await fs.pathExists(basePath))) return [];

    let files = [];
    const ext = type === 'audio' ? 'mp3' : 'mp4';
    var located_files = await recFindByExt(basePath, ext);
    for (let i = 0; i < located_files.length; i++) {
        let file = located_files[i];
        var file_path = file.substring(basePath.includes('\\') ? basePath.length+1 : basePath.length, file.length);

        var stats = await fs.stat(file);

        var id = file_path.substring(0, file_path.length-4);
        var jsonobj = await getJSONByType(type, id, basePath);
        if (!jsonobj) continue;
        if (full_metadata) {
            jsonobj['id'] = id;
            files.push(jsonobj);
            continue;
        }
        var upload_date = formatDateString(jsonobj.upload_date);

        var isaudio = type === 'audio';
        var file_obj = new File(id, jsonobj.title, jsonobj.thumbnail, isaudio, jsonobj.duration, jsonobj.webpage_url, jsonobj.uploader,
                                stats.size, file, upload_date, jsonobj.description, jsonobj.view_count, jsonobj.height, jsonobj.abr);
        files.push(file_obj);
    }
    return files;
}

async function createContainerZipFile(file_name, container_file_objs) {
    const container_files_to_download = [];
    for (let i = 0; i < container_file_objs.length; i++) {
        const container_file_obj = container_file_objs[i];
        container_files_to_download.push(container_file_obj.path);
    }
    return await createZipFile(path.join('appdata', file_name + '.zip'), container_files_to_download);
}

async function createZipFile(zip_file_path, file_paths) {
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
    await wait(100);
    return zip_file_path;
}

function getJSONMp4(name, customPath, openReadPerms = false) {
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

function getJSONMp3(name, customPath, openReadPerms = false) {
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

function getJSON(file_path, type) {
    const ext = type === 'audio' ? '.mp3' : '.mp4';
    let obj = null;
    var jsonPath = removeFileExtension(file_path) + '.info.json';
    var alternateJsonPath = removeFileExtension(file_path) + `${ext}.info.json`;
    if (fs.existsSync(jsonPath))
    {
        obj = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } else if (fs.existsSync(alternateJsonPath)) {
        obj = JSON.parse(fs.readFileSync(alternateJsonPath, 'utf8'));
    }
    else obj = 0;
    return obj;
}

function getJSONByType(type, name, customPath, openReadPerms = false) {
    return type === 'audio' ? getJSONMp3(name, customPath, openReadPerms) : getJSONMp4(name, customPath, openReadPerms)
}

function getDownloadedThumbnail(file_path) {
    const file_path_no_extension = removeFileExtension(file_path);

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

function getExpectedFileSize(input_info_jsons) {
    // treat single videos as arrays to have the file sizes checked/added to. makes the code cleaner
    const info_jsons = Array.isArray(input_info_jsons) ? input_info_jsons : [input_info_jsons];

    let expected_filesize = 0;
    info_jsons.forEach(info_json => {
        const formats = info_json['format_id'].split('+');
        let individual_expected_filesize = 0;
        formats.forEach(format_id => {
            info_json.formats.forEach(available_format => {
                if (available_format.format_id === format_id && available_format.filesize) {
                    individual_expected_filesize += available_format.filesize;
                }
            });
        });
        expected_filesize += individual_expected_filesize;
    });

    return expected_filesize;
}

function fixVideoMetadataPerms(file_path, type) {
    if (is_windows) return;

    const ext = type === 'audio' ? '.mp3' : '.mp4';

    const file_path_no_extension = removeFileExtension(file_path);

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

function deleteJSONFile(file_path, type) {
    const ext = type === 'audio' ? '.mp3' : '.mp4';

    const file_path_no_extension = removeFileExtension(file_path);
    
    let json_path = file_path_no_extension + '.info.json';
    let alternate_json_path = file_path_no_extension + ext + '.info.json';

    if (fs.existsSync(json_path)) fs.unlinkSync(json_path);
    if (fs.existsSync(alternate_json_path)) fs.unlinkSync(alternate_json_path);
}

async function removeIDFromArchive(archive_path, id) {
    let data = await fs.readFile(archive_path, {encoding: 'utf-8'});
    if (!data) {
        logger.error('Archive could not be found.');
        return;
    }

    let dataArray = data.split('\n'); // convert file data in an array
    const searchKeyword = id; // we are looking for a line, contains, key word id in the file
    let lastIndex = -1; // let say, we have not found the keyword

    for (let index=0; index<dataArray.length; index++) {
        if (dataArray[index].includes(searchKeyword)) { // check if a line contains the id keyword
            lastIndex = index; // found a line includes a id keyword
            break;
        }
    }

    const line = dataArray.splice(lastIndex, 1); // remove the keyword id from the data Array

    // UPDATE FILE WITH NEW DATA
    const updatedData = dataArray.join('\n');
    await fs.writeFile(archive_path, updatedData);
    if (line) return line;
}

function durationStringToNumber(dur_str) {
    if (typeof dur_str === 'number') return dur_str;
    let num_sum = 0;
    const dur_str_parts = dur_str.split(':');
    for (let i = dur_str_parts.length-1; i >= 0; i--) {
      num_sum += parseInt(dur_str_parts[i])*(60**(dur_str_parts.length-1-i));
    }
    return num_sum;
}

function getMatchingCategoryFiles(category, files) {
    return files && files.filter(file => file.category && file.category.uid === category.uid);
}

function addUIDsToCategory(category, files) {
    const files_that_match = getMatchingCategoryFiles(category, files);
    category['uids'] = files_that_match.map(file => file.uid);
    return files_that_match;
}

function getCurrentDownloader() {
    const details_json = fs.readJSONSync(CONSTS.DETAILS_BIN_PATH);
    return details_json['downloader'];
}

async function recFindByExt(base, ext, files, result, recursive = true)
{
    files = files || (await fs.readdir(base))
    result = result || []

    for (const file of files) {
        var newbase = path.join(base,file)
        if ( (await fs.stat(newbase)).isDirectory() )
        {
            if (!recursive) continue;
            result = await recFindByExt(newbase,ext,await fs.readdir(newbase),result)
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

function removeFileExtension(filename) {
    const filename_parts = filename.split('.');
    filename_parts.splice(filename_parts.length - 1);
    return filename_parts.join('.');
}

function formatDateString(date_string) {
    return date_string ? `${date_string.substring(0, 4)}-${date_string.substring(4, 6)}-${date_string.substring(6, 8)}` : 'N/A';
}

function createEdgeNGrams(str) {
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

async function cropFile(file_path, start, end, ext) {
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
 async function wait(ms) {
    await new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

async function checkExistsWithTimeout(filePath, timeout) {
    return new Promise(function (resolve, reject) {

        var timer = setTimeout(function () {
            if (watcher) watcher.close();
            reject(new Error('File did not exists and was not created during the timeout.'));
        }, timeout);

        fs.access(filePath, fs.constants.R_OK, function (err) {
            if (!err) {
                clearTimeout(timer);
                if (watcher) watcher.close();
                resolve();
            }
        });

        var dir = path.dirname(filePath);
        var basename = path.basename(filePath);
        var watcher = fs.watch(dir, function (eventType, filename) {
            if (eventType === 'rename' && filename === basename) {
                clearTimeout(timer);
                if (watcher) watcher.close();
                resolve();
            }
        });
    });
}

// helper function to download file using fetch
async function fetchFile(url, path, file_label) {
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

async function restartServer(is_update = false) {
    logger.info(`${is_update ? 'Update complete! ' : ''}Restarting server...`);

    // the following line restarts the server through nodemon
    fs.writeFileSync(`restart${is_update ? '_update' : '_general'}.json`, 'internal use only');
    process.exit(1);
}

// adds or replaces args according to the following rules:
//  - if it already exists and has value, then replace both arg and value
//  - if already exists and doesn't have value, ignore
//  - if it doesn't exist and has value, add both arg and value
//  - if it doesn't exist and doesn't have value, add arg
function injectArgs(original_args, new_args) {
    const updated_args = original_args.slice();
    try {
        for (let i = 0; i < new_args.length; i++) {
            const new_arg = new_args[i];
            if (!new_arg.startsWith('-') && !new_arg.startsWith('--') && i > 0 && original_args.includes(new_args[i - 1])) continue;
            
            if (CONSTS.YTDL_ARGS_WITH_VALUES.has(new_arg)) {
                if (original_args.includes(new_arg)) {
                    const original_index = original_args.indexOf(new_arg);
                    original_args.splice(original_index, 2);
                }

                updated_args.push(new_arg, new_args[i + 1]);
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
}

module.exports = {
    getJSONMp3: getJSONMp3,
    getJSONMp4: getJSONMp4,
    getJSON: getJSON,
    getTrueFileName: getTrueFileName,
    getDownloadedThumbnail: getDownloadedThumbnail,
    getExpectedFileSize: getExpectedFileSize,
    fixVideoMetadataPerms: fixVideoMetadataPerms,
    deleteJSONFile: deleteJSONFile,
    removeIDFromArchive: removeIDFromArchive,
    getDownloadedFilesByType: getDownloadedFilesByType,
    createContainerZipFile: createContainerZipFile,
    durationStringToNumber: durationStringToNumber,
    getMatchingCategoryFiles: getMatchingCategoryFiles,
    addUIDsToCategory: addUIDsToCategory,
    getCurrentDownloader: getCurrentDownloader,
    recFindByExt: recFindByExt,
    removeFileExtension: removeFileExtension,
    formatDateString: formatDateString,
    cropFile: cropFile,
    createEdgeNGrams: createEdgeNGrams,
    wait: wait,
    checkExistsWithTimeout: checkExistsWithTimeout,
    fetchFile: fetchFile,
    restartServer: restartServer,
    injectArgs: injectArgs,
    File: File
}
