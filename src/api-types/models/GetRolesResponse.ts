/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { UserPermission } from './UserPermission';

export interface GetRolesResponse {
    roles: {
admin?: {
permissions?: Array<UserPermission>,
},
user?: {
permissions?: Array<UserPermission>,
},
};
}