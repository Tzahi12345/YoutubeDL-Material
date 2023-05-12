/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { DatabaseFile } from './DatabaseFile';
import type { Playlist } from './Playlist';

export type GetMp3sResponse = {
    mp3s: Array<DatabaseFile>;
    /**
     * All audio playlists
     */
    playlists: Array<Playlist>;
};
