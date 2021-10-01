/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { FileType } from './FileType';

export interface DeletePlaylistRequest {
    playlist_id: string;
    type: FileType;
}