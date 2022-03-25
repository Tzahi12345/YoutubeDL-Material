/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { User } from './User';
import { UserPermission } from './UserPermission';

export interface LoginResponse {
    user?: User;
    token?: string;
    permissions?: Array<UserPermission>;
    available_permissions?: Array<UserPermission>;
}