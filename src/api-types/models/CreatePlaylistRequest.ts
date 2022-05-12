/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { FileType } from './FileType';

export type CreatePlaylistRequest = {
    playlistName: string;
    uids: Array<string>;
    type: FileType;
    thumbnailURL: string;
};