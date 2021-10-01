/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */


export interface DownloadFileRequest {
    uid: string;
    uuid?: string;
    sub_id?: string;
    /**
     * Only used for subscriptions
     */
    is_playlist?: boolean;
}