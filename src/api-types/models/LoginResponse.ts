/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { User } from './User';
import type { UserPermission } from './UserPermission';

export type LoginResponse = {
    user?: User;
    token?: string;
    permissions?: Array<UserPermission>;
    available_permissions?: Array<UserPermission>;
};
