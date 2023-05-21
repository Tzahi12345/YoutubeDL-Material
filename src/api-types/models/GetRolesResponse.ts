/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { UserPermission } from './UserPermission';

export type GetRolesResponse = {
    roles: {
admin?: {
permissions?: Array<UserPermission>;
};
user?: {
permissions?: Array<UserPermission>;
};
};
};
