/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */


export interface Download {
    uid: string;
    ui_uid: string;
    downloading: boolean;
    complete: boolean;
    url: string;
    type: string;
    percent_complete: number;
    is_playlist: boolean;
    timestamp_start: number;
    timestamp_end?: number;
    filesize?: number | null;
    /**
     * Error text, set if download fails.
     */
    error?: string;
    fileNames?: Array<string>;
}
