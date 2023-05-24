/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

export enum TaskType {
    BACKUP_LOCAL_DB = 'backup_local_db',
    MISSING_FILES_CHECK = 'missing_files_check',
    MISSING_DB_RECORDS = 'missing_db_records',
    DUPLICATE_FILES_CHECK = 'duplicate_files_check',
    YOUTUBEDL_UPDATE_CHECK = 'youtubedl_update_check',
    DELETE_OLD_FILES = 'delete_old_files',
    IMPORT_LEGACY_ARCHIVES = 'import_legacy_archives',
    REBUILD_DATABASE = 'rebuild_database',
}
