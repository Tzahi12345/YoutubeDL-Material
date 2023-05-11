/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { BaseChangePermissionsRequest } from './BaseChangePermissionsRequest';

export type ChangeRolePermissionsRequest = (BaseChangePermissionsRequest & {
role: string;
});
