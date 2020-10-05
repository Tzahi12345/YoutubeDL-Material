/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { FileType } from './FileType';

export interface DeleteFileRequest {
    fileName: string;
    type: FileType;
}
