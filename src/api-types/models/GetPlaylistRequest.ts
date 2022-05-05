/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { FileType } from './FileType';

export interface GetPlaylistRequest {
    playlist_id: string;
    type?: FileType;
    uuid?: string;
    include_file_metadata?: boolean;
}