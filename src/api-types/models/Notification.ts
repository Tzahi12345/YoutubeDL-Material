/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { NotificationAction } from './NotificationAction';
import type { NotificationType } from './NotificationType';

export type Notification = {
    type: NotificationType;
    uid: string;
    user_uid?: string;
    action?: Array<NotificationAction>;
    read: boolean;
    data?: any;
    timestamp: number;
};
