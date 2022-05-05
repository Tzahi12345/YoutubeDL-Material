/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { DatabaseFile } from './DatabaseFile';

export interface GetFileResponse {
    success: boolean;
    file?: DatabaseFile;
}