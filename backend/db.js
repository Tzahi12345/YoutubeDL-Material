var logger = null;
var db = null;
var users_db = null;
function setDB(input_db, input_users_db) { db = input_db; users_db = input_users_db } 
function setLogger(input_logger) { logger = input_logger; }

function initialize(input_db, input_users_db, input_logger) {
    setDB(input_db, input_users_db);
    setLogger(input_logger);
}

function registerFileDB(file_path, type, multiUserMode = null, sub = null) {
    const file_id = file_path.substring(0, file_path.length-4);
    const file_object = generateFileObject(file_id, type, multiUserMode && multiUserMode.file_path);
    if (!file_object) {
        logger.error(`Could not find associated JSON file for ${type} file ${file_id}`);
        return false;
    }

    // add additional info
    file_object['uid'] = uuid();
    file_object['registered'] = Date.now();
    path_object = path.parse(file_object['path']);
    file_object['path'] = path.format(path_object);

    if (multiUserMode) {
        if (!sub) {
            const user_uid = multiUserMode.user;
            users_db.get('users').find({uid: user_uid}).get(`files.${type}`)
                .remove({
                    path: file_object['path']
                }).write();

            users_db.get('users').find({uid: user_uid}).get(`files.${type}`)
                .push(file_object)
                .write();
        } else {
            
        }
    } else if (!sub) {
        // remove existing video if overwriting
        db.get(`files.${type}`)
        .remove({
            path: file_object['path']
        }).write();

        db.get(`files.${type}`)
            .push(file_object)
            .write();
    } else if (sub) {
        if (multi)
    } else {
        // this should never be used
        logger.error('Failed to determine file type during video DB registration.');
        return null;
    }

    return file_object['uid'];
}

function generateFileObject(id, type, customPath = null) {
    var jsonobj = (type === 'audio') ? getJSONMp3(id, customPath, true) : getJSONMp4(id, customPath, true);
    if (!jsonobj) {
        return null;
    }
    const ext = (type === 'audio') ? '.mp3' : '.mp4'
    const file_path = getTrueFileName(jsonobj['_filename'], type); // path.join(type === 'audio' ? audioFolderPath : videoFolderPath, id + ext);
    // console.
    var stats = fs.statSync(path.join(__dirname, file_path));

    var title = jsonobj.title;
    var url = jsonobj.webpage_url;
    var uploader = jsonobj.uploader;
    var upload_date = jsonobj.upload_date;
    upload_date = upload_date ? `${upload_date.substring(0, 4)}-${upload_date.substring(4, 6)}-${upload_date.substring(6, 8)}` : 'N/A';

    var size = stats.size;

    var thumbnail = jsonobj.thumbnail;
    var duration = jsonobj.duration;
    var isaudio = type === 'audio';
    var file_obj = new File(id, title, thumbnail, isaudio, duration, url, uploader, size, file_path, upload_date);
    return file_obj;
}

module.exports = {
    initialize: initialize,
    registerFileDB: registerFileDB
}