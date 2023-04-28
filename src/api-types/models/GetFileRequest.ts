/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { FileType } from './FileType';

export type GetFileRequest = {
    /**
     * Video UID
     */
    uid: string;
    type?: FileType;
    /**
     * User UID
     */
    uuid?: string;
};
