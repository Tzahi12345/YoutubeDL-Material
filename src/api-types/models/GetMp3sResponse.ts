/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { DatabaseFile } from './DatabaseFile';
import { Playlist } from './Playlist';

export interface GetMp3sResponse {
    mp3s: Array<DatabaseFile>;
    /**
     * All audio playlists
     */
    playlists: Array<Playlist>;
}