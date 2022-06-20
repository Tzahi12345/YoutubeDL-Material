/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { Category } from './Category';

export type DatabaseFile = {
    id: string;
    title: string;
    /**
     * Backup if thumbnailPath is not defined
     */
    thumbnailURL: string;
    thumbnailPath?: string;
    isAudio: boolean;
    /**
     * In seconds
     */
    duration: number;
    url: string;
    uploader: string;
    /**
     * In bytes
     */
    size: number;
    path: string;
    upload_date: string;
    uid: string;
    sharingEnabled?: boolean;
    category?: Category;
    view_count?: number;
    local_view_count?: number;
};