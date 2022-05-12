/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { FileType } from './FileType';
import type { Playlist } from './Playlist';

export type GetPlaylistResponse = {
    playlist: Playlist;
    type: FileType;
    success: boolean;
};