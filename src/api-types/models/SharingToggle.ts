/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { FileType } from './FileType';

export interface SharingToggle {
    uid: string;
    type: FileType;
    is_playlist?: boolean;
}
