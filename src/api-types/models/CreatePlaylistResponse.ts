/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { Playlist } from './Playlist';

export interface CreatePlaylistResponse {
    new_playlist: Playlist;
    success: boolean;
}