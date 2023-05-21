/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { FileType } from './FileType';

export type Subscription = {
    name: string;
    url: string;
    id: string;
    type: FileType;
    user_uid: string | null;
    isPlaylist: boolean;
    archive?: string;
    timerange?: string;
    custom_args?: string;
    custom_output?: string;
    videos: Array<Record<string, any>>;
};
