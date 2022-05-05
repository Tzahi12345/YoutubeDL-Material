/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { FileType } from './FileType';
import { Subscription } from './Subscription';

export interface GetFullTwitchChatRequest {
    /**
     * File ID
     */
    id: string;
    type: FileType;
    /**
     * User UID
     */
    uuid?: string;
    sub?: Subscription;
}