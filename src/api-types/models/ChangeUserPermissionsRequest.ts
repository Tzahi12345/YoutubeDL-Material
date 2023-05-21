/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { BaseChangePermissionsRequest } from './BaseChangePermissionsRequest';

export type ChangeUserPermissionsRequest = (BaseChangePermissionsRequest & {
user_uid: string;
});
