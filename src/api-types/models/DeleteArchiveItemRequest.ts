/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { FileType } from './FileType';

export type DeleteArchiveItemRequest = {
    extractor: string;
    id: string;
    type: FileType;
    sub_id?: string;
};
