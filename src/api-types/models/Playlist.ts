/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { FileType } from './FileType';

export type Playlist = {
    name: string;
    uids: Array<string>;
    id: string;
    thumbnailURL: string;
    type: FileType;
    registered: number;
    duration: number;
    user_uid?: string;
    auto?: boolean;
    sharingEnabled?: boolean;
};
