/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { FileType } from './FileType';

export interface GetPlaylistRequest {
    playlistID: string;
    type?: FileType;
    uuid?: string;
}
