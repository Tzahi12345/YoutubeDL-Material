/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { BaseDownloadRequest } from './BaseDownloadRequest';

export interface Mp3DownloadRequest extends BaseDownloadRequest {
    /**
     * Specify ffmpeg/avconv audio quality
     */
    maxBitrate?: string;
}
