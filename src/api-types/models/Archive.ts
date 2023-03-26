/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { FileType } from './FileType';

export type Archive = {
    extractor: string;
    id: string;
    type: FileType;
    title: string;
    user_uid?: string;
    sub_id?: string;
    timestamp: number;
    uid: string;
};
