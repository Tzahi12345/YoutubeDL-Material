/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { UserPermission } from './UserPermission';
import { YesNo } from './YesNo';

export interface BaseChangePermissionsRequest {
    permission: UserPermission;
    new_value: YesNo;
}