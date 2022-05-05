/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { FileType } from './FileType';
import { Subscription } from './Subscription';

export interface DownloadTwitchChatByVODIDRequest {
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
}