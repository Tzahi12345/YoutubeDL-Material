/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { FileType } from './FileType';
import { Playlist } from './Playlist';

export interface GetPlaylistResponse {
    playlist: Playlist;
    type: FileType;
    success: boolean;
}