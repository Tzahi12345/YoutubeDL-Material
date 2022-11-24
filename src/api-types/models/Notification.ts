/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { NotificationAction } from './NotificationAction';

export type Notification = {
    type: string;
    text: string;
    uid: string;
    action?: NotificationAction;
    read: boolean;
    data?: any;
};