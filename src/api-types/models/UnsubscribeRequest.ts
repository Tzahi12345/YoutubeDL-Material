/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { SubscriptionRequestData } from './SubscriptionRequestData';

export type UnsubscribeRequest = {
    sub: SubscriptionRequestData;
    /**
     * Defaults to false
     */
    deleteMode?: boolean;
};
