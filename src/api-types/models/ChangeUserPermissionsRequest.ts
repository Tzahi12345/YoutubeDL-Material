/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { BaseChangePermissionsRequest } from './BaseChangePermissionsRequest';

export interface ChangeUserPermissionsRequest extends BaseChangePermissionsRequest {
    user_uid: string;
}