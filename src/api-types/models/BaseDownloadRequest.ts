/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */


export interface BaseDownloadRequest {
    url: string;
    /**
     * Video format code. Overrides other quality options.
     */
    customQualityConfiguration?: string;
    /**
     * Custom command-line arguments for youtubedl. Overrides all other options, except url.
     */
    customArgs?: string;
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
    ui_uid?: string | null;
}
