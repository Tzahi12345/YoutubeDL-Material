/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { FileType } from './FileType';

export interface UpdatePlaylistFilesRequest {
    playlistID: string;
    fileNames: Array<string>;
    type: FileType;
}
