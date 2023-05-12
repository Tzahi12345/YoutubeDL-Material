/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { DatabaseFile } from './DatabaseFile';
import type { Playlist } from './Playlist';

export type GetAllFilesResponse = {
    files: Array<DatabaseFile>;
    /**
     * All video playlists
     */
    playlists: Array<Playlist>;
};
