/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { Subscription } from './Subscription';
import { UserPermission } from './UserPermission';

export interface User {
    uid?: string;
    name?: string;
    passhash?: string;
    files?: {
audio?: Array<File>,
video?: Array<File>,
};
    playlists?: {
audio?: Array<File>,
video?: Array<File>,
};
    subscriptions?: Array<Subscription>;
    created?: number;
    role?: string;
    permissions?: Array<UserPermission>;
    permission_overrides?: Array<UserPermission>;
}