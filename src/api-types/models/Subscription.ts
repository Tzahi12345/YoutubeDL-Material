/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { FileType } from './FileType';

export interface Subscription {
    name: string;
    url: string;
    id: string;
    type: FileType;
    user_uid: string | null;
    streamingOnly: boolean;
    isPlaylist: boolean;
    archive?: string;
    timerange?: string;
    custom_args?: string;
    custom_output?: string;
    videos: Array<any>;
}