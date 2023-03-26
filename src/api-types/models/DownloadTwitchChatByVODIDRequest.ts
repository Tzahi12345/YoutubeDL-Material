/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { FileType } from './FileType';
import type { Subscription } from './Subscription';

export type DownloadTwitchChatByVODIDRequest = {
    /**
     * File ID
     */
    id: string;
    /**
     * ID of the VOD
     */
    vodId: string;
    type: FileType;
    /**
     * User UID
     */
    uuid?: string;
    sub?: Subscription;
};
