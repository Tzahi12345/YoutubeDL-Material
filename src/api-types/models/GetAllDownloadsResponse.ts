/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { Dictionary } from './Dictionary';
import { Download } from './Download';

export interface GetAllDownloadsResponse {
    /**
     * Map of Session ID to inner map
     */
    downloads?: Dictionary<Dictionary<Download>>;
}
