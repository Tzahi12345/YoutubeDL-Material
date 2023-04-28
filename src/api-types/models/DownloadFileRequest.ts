/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { FileType } from './FileType';

export type DownloadFileRequest = {
    uid?: string;
    uuid?: string;
    sub_id?: string;
    playlist_id?: string;
    url?: string;
    type?: FileType;
};
