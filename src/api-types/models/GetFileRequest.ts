/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { FileType } from './FileType';

export interface GetFileRequest {
    /**
     * Video UID
     */
    uid: string;
    type?: FileType;
    /**
     * User UID
     */
    uuid?: string;
}