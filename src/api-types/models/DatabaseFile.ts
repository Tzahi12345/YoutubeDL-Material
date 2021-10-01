/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */


export interface DatabaseFile {
    id: string;
    title: string;
    thumbnailURL: string;
    isAudio: boolean;
    /**
     * In seconds
     */
    duration: number;
    url: string;
    uploader: string;
    size: number;
    path: string;
    upload_date: string;
    uid: string;
    sharingEnabled?: boolean;
}