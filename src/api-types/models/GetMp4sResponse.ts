/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { DatabaseFile } from './DatabaseFile';
import type { Playlist } from './Playlist';

export type GetMp4sResponse = {
    mp4s: Array<DatabaseFile>;
    /**
     * All video playlists
     */
    playlists: Array<Playlist>;
};
