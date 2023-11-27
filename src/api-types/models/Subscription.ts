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
    child_process?: any;
    archive?: string;
    timerange?: string;
    custom_args?: string;
    custom_output?: string;
    downloading?: boolean;
    paused?: boolean;
    videos: Array<any>;
};
