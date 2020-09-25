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
    /**
     * Only used for subscriptions
     */
    subscriptionName?: boolean;
    /**
     * Only used for subscriptions
     */
    subPlaylist?: boolean;
}
