/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { FileType } from './FileType';

export interface DownloadFileRequest {
    fileNames: ;
    zip_mode?: boolean;
    type: FileType;
    outputName?: string;
    fullPathProvided?: boolean;
    uuid?: string;
    uid?: string;
    id?: string;
    /**
     * Only used for subscriptions
     */
    subscriptionName?: string;
    /**
     * Only used for subscriptions
     */
    subPlaylist?: boolean;
}
