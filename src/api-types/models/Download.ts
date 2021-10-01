/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */


export interface Download {
    uid: string;
    ui_uid?: string;
    running: boolean;
    finished: boolean;
    paused: boolean;
    finished_step: boolean;
    url: string;
    type: string;
    title: string;
    step_index: number;
    percent_complete: number;
    timestamp_start: number;
    /**
     * Error text, set if download fails.
     */
    error?: string | null;
    user_uid?: string;
    sub_id?: string;
    sub_name?: string;
}