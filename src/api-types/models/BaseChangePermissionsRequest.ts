/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { UserPermission } from './UserPermission';
import type { YesNo } from './YesNo';

export type BaseChangePermissionsRequest = {
    permission: UserPermission;
    new_value: YesNo;
};
