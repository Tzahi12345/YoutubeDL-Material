/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { BaseDownloadRequest } from './BaseDownloadRequest';

export interface Mp4DownloadRequest extends BaseDownloadRequest {
    /**
     * Height of the video, if known
     */
    selectedHeight?: string;
}
