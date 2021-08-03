

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

async function downloadFileByURL_exec(url, type, options) {
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
        multiUserMode = {
            user: options.user,
            file_path: fileFolderPath
        }
        options.customFileFolderPath = fileFolderPath;
    }

}

async function downloadFileByURL_exec_old(url, type, options, sessionID = null) {
    return new Promise(async resolve => {
        var date = Date.now();

        // audio / video specific vars
        var is_audio = type === 'audio';
        var ext = is_audio ? '.mp3' : '.mp4';
        var fileFolderPath = type === 'audio' ? audioFolderPath : videoFolderPath;
        let category = null;

        // prepend with user if needed
        let multiUserMode = null;
        if (options.user) {
            let usersFileFolder = config_api.getConfigItem('ytdl_users_base_path');
            const user_path = path.join(usersFileFolder, options.user, type);
            fs.ensureDirSync(user_path);
            fileFolderPath = user_path + path.sep;
            options.customFileFolderPath = fileFolderPath;
        }

        options.downloading_method = 'exec';
        let downloadConfig = await generateArgs(url, type, options);

        // adds download to download helper
        const download_uid = uuid();
        const session = sessionID ? sessionID : 'undeclared';
        let session_downloads = downloads.find(potential_session_downloads => potential_session_downloads['session_id'] === session);
        if (!session_downloads) {
            session_downloads = {session_id: session};
            downloads.push(session_downloads);
        }
        session_downloads[download_uid] = {
            uid: download_uid,
            ui_uid: options.ui_uid,
            downloading: true,
            complete: false,
            url: url,
            type: type,
            percent_complete: 0,
            is_playlist: url.includes('playlist'),
            timestamp_start: Date.now(),
            filesize: null
        };
        const download = session_downloads[download_uid];
        updateDownloads();

        let download_checker = null;

        // get video info prior to download
        let info = await getVideoInfoByURL(url, downloadConfig, download);
        if (!info && url.includes('youtu')) {
            resolve(false);
            return;
        } else if (info) {
            // check if it fits into a category. If so, then get info again using new downloadConfig
            if (!Array.isArray(info) || config_api.getConfigItem('ytdl_allow_playlist_categorization')) category = await categories_api.categorize(info);

            // set custom output if the category has one and re-retrieve info so the download manager has the right file name
            if (category && category['custom_output']) {
                options.customOutput = category['custom_output'];
                options.noRelativePath = true;
                downloadConfig = await generateArgs(url, type, options);
                info = await getVideoInfoByURL(url, downloadConfig, download);
            }

            // store info in download for future use
            if (Array.isArray(info)) {
                download['fileNames'] = [];
                for (let info_obj of info) download['fileNames'].push(info_obj['_filename']);
            } else {
                download['_filename'] = info['_filename'];
            }
            download['filesize'] = utils.getExpectedFileSize(info);
            download_checker = setInterval(() => checkDownloadPercent(download), 1000);
        }

        // download file
        youtubedl.exec(url, downloadConfig, {maxBuffer: Infinity}, async function(err, output) {
            if (download_checker) clearInterval(download_checker); // stops the download checker from running as the download finished (or errored)

            download['downloading'] = false;
            download['timestamp_end'] = Date.now();
            var file_objs = [];
            let new_date = Date.now();
            let difference = (new_date - date)/1000;
            logger.debug(`${is_audio ? 'Audio' : 'Video'} download delay: ${difference} seconds.`);
            if (err) {
                logger.error(err.stderr);

                download['error'] = err.stderr;
                updateDownloads();
                resolve(false);
                return;
            } else if (output) {
                if (output.length === 0 || output[0].length === 0) {
                    download['error'] = 'No output. Check if video already exists in your archive.';
                    logger.warn(`No output received for video download, check if it exists in your archive.`)
                    updateDownloads();

                    resolve(false);
                    return;
                }
                var file_names = [];
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

                    const file_path = options.noRelativePath ? path.basename(full_file_path) : full_file_path.substring(fileFolderPath.length, full_file_path.length);
                    const customPath = options.noRelativePath ? path.dirname(full_file_path).split(path.sep).pop() : null;

                    if (options.cropFileSettings) {
                        await cropFile(full_file_path, options.cropFileSettings.cropFileStart, options.cropFileSettings.cropFileEnd, ext);
                    }

                    // registers file in DB
                    const file_obj = await db_api.registerFileDB2(full_file_path, type, options.user, category, null, options.cropFileSettings);

                    // TODO: remove the following line
                    if (file_name) file_names.push(file_name);

                    file_objs.push(file_obj);
                }

                let is_playlist = file_names.length > 1;

                if (options.merged_string !== null && options.merged_string !== undefined) {
                    let current_merged_archive = fs.readFileSync(path.join(fileFolderPath, `merged_${type}.txt`), 'utf8');
                    let diff = current_merged_archive.replace(options.merged_string, '');
                    const archive_path = options.user ? path.join(fileFolderPath, 'archives', `archive_${type}.txt`) : path.join(archivePath, `archive_${type}.txt`);
                    fs.appendFileSync(archive_path, diff);
                }

                download['complete'] = true;
                download['fileNames'] = is_playlist ? file_names : [full_file_path]
                updateDownloads();

                let container = null;

                if (file_objs.length > 1) {
                    // create playlist
                    const playlist_name = file_objs.map(file_obj => file_obj.title).join(', ');
                    const duration = file_objs.reduce((a, b) => a + utils.durationStringToNumber(b.duration), 0);
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