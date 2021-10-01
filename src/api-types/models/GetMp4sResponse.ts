/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { DatabaseFile } from './DatabaseFile';
import { Playlist } from './Playlist';

export interface GetMp4sResponse {
    mp4s: Array<DatabaseFile>;
    /**
     * All video playlists
     */
    playlists: Array<Playlist>;
}