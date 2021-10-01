/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { DatabaseFile } from './DatabaseFile';
import { Playlist } from './Playlist';

export interface GetAllFilesResponse {
    files: Array<DatabaseFile>;
    /**
     * All video playlists
     */
    playlists: Array<Playlist>;
}