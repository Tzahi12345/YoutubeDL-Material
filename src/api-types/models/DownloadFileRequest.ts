/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { FileType } from './FileType';

export interface DownloadFileRequest {
    uid?: string;
    uuid?: string;
    sub_id?: string;
    playlist_id?: string;
    url?: string;
    type?: FileType;
}