/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { file } from './file';
import type { Subscription } from './Subscription';
import type { UserPermission } from './UserPermission';

export type User = {
    uid?: string;
    name?: string;
    passhash?: string;
    files?: {
audio?: Array<file>;
video?: Array<file>;
};
    playlists?: {
audio?: Array<file>;
video?: Array<file>;
};
    subscriptions?: Array<Subscription>;
    created?: number;
    role?: string;
    permissions?: Array<UserPermission>;
    permission_overrides?: Array<UserPermission>;
};