/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { CropFileSettings } from './CropFileSettings';
import type { FileType } from './FileType';

export type DownloadRequest = {
    url: string;
    /**
     * Video format code. Overrides other quality options.
     */
    customQualityConfiguration?: string;
    /**
     * Custom command-line arguments for youtube-dl. Overrides all other options, except url.
     */
    customArgs?: string;
    /**
     * Additional command-line arguments for youtube-dl. Added to whatever args would normally be used.
     */
    additionalArgs?: string;
    /**
     * Custom output filename template.
     */
    customOutput?: string;
    /**
     * Login with this account ID
     */
    youtubeUsername?: string;
    /**
     * Account password
     */
    youtubePassword?: string;
    /**
     * Height of the video, if known
     */
    selectedHeight?: string;
    /**
     * Max height that should be used, useful for playlists. selectedHeight will override this.
     */
    maxHeight?: string;
    /**
     * Specify ffmpeg/avconv audio quality
     */
    maxBitrate?: string;
    type?: FileType;
    cropFileSettings?: CropFileSettings;
    /**
     * If using youtube-dl archive, download will ignore it
     */
    ignoreArchive?: boolean;
};
