/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { FileType } from './FileType';

export interface Playlist {
    name: string;
    fileNames: Array<string>;
    id: string;
    thumbnailURL: string;
    type: FileType;
    registered: number;
    duration: number;
}
