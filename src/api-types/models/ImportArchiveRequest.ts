/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { FileType } from './FileType';

export type ImportArchiveRequest = {
    archive: Blob;
    type: FileType;
    sub_id?: string;
};
