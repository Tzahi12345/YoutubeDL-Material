const path = require('path');
const fs = require('fs-extra');
const { v4: uuid } = require('uuid');

const db_api = require('./db');

exports.generateArchive = async (type = null, user_uid = null, sub_id = null) => {
    const filter = {user_uid: user_uid, sub_id: sub_id};
    if (type) filter['type'] = type;
    const archive_items = await db_api.getRecords('archives', filter);
    const archive_item_lines = archive_items.map(archive_item => `${archive_item['extractor']} ${archive_item['id']}`);
    return archive_item_lines.join('\n');
}

exports.addToArchive = async (extractor, id, type, title, user_uid = null, sub_id = null) => {
    const archive_item = createArchiveItem(extractor, id, type, title, user_uid, sub_id);
    const success = await db_api.insertRecordIntoTable('archives', archive_item, {extractor: extractor, id: id, type: type});
    return success;
}

exports.removeFromArchive = async (extractor, id, type, user_uid = null, sub_id = null) => {
    const success = await db_api.removeAllRecords('archives', {extractor: extractor, id: id, type: type, user_uid: user_uid, sub_id: sub_id});
    return success;
}

exports.existsInArchive = async (extractor, id, type, user_uid, sub_id) => {
    const archive_item = await db_api.getRecord('archives', {extractor: extractor, id: id, type: type, user_uid: user_uid, sub_id: sub_id});
    return !!archive_item;
}

exports.importArchiveFile = async (archive_text, type, user_uid = null, sub_id = null) => {
    let archive_import_count = 0;
    const lines = archive_text.split('\n');
    for (let line of lines) {
        const archive_line_parts = line.trim().split(' ');
        // should just be the extractor and the video ID
        if (archive_line_parts.length !== 2) {
            continue;
        }

        const extractor = archive_line_parts[0];
        const id        = archive_line_parts[1];
        if (!extractor || !id) continue;

        // we can't do a bulk write because we need to avoid duplicate archive items existing in db

        const archive_item = createArchiveItem(extractor, id, type, null, user_uid, sub_id);
        await db_api.insertRecordIntoTable('archives', archive_item, {extractor: extractor, id: id, type: type, sub_id: sub_id, user_uid: user_uid});
        archive_import_count++;
    }
    return archive_import_count;
}

exports.importArchives = async () => {
    const imported_archives = [];
    const dirs_to_check = await db_api.getFileDirectoriesAndDBs();

    // run through check list and check each file to see if it's missing from the db
    for (let i = 0; i < dirs_to_check.length; i++) {
        const dir_to_check = dirs_to_check[i];
        if (!dir_to_check['archive_path']) continue;

        const files_to_import = [
            path.join(dir_to_check['archive_path'], `archive_${dir_to_check['type']}.txt`),
            path.join(dir_to_check['archive_path'], `blacklist_${dir_to_check['type']}.txt`)
        ]

        for (const file_to_import of files_to_import) {
            const file_exists = await fs.pathExists(file_to_import);
            if (!file_exists) continue;

            const archive_text = await fs.readFile(file_to_import, 'utf8');
            await exports.importArchiveFile(archive_text, dir_to_check.type, dir_to_check.user_uid, dir_to_check.sub_id);
            imported_archives.push(file_to_import);
        }
    }
    return imported_archives;
}

const createArchiveItem = (extractor, id, type, title = null, user_uid = null, sub_id = null) => {
    return {
        extractor: extractor,
        id: id,
        type: type,
        title: title,
        user_uid: user_uid ? user_uid : null,
        sub_id: sub_id ? sub_id : null,
        timestamp: Date.now() / 1000,
        uid: uuid()
    }
}