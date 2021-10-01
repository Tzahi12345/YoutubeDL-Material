/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { BaseChangePermissionsRequest } from './BaseChangePermissionsRequest';

export interface ChangeRolePermissionsRequest extends BaseChangePermissionsRequest {
    role: string;
}