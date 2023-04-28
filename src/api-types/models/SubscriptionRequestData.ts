/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { FileType } from './FileType';

export type SubscriptionRequestData = {
    name: string;
    id: string;
    type?: FileType;
    isPlaylist?: boolean;
    archive?: string;
};
