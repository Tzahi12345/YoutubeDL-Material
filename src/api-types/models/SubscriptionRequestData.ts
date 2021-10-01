/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { FileType } from './FileType';

export interface SubscriptionRequestData {
    name: string;
    id: string;
    type?: FileType;
    isPlaylist?: boolean;
    archive?: string;
}