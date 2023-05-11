/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { DatabaseFile } from './DatabaseFile';
import type { Playlist } from './Playlist';

export type GetPlaylistResponse = {
    playlist: Playlist;
    success: boolean;
    /**
     * File objects for every uid in the playlist's uids property, in the same order
     */
    file_objs?: Array<DatabaseFile>;
};
