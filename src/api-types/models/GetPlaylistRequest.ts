/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { FileType } from './FileType';

export type GetPlaylistRequest = {
    playlist_id: string;
    type?: FileType;
    uuid?: string;
    include_file_metadata?: boolean;
};
