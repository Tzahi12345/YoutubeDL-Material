/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { FileType } from './FileType';
import type { Subscription } from './Subscription';

export type GetFullTwitchChatRequest = {
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
};
