/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { SubscriptionRequestData } from './SubscriptionRequestData';

export interface UnsubscribeRequest {
    sub: SubscriptionRequestData;
    /**
     * Defaults to false
     */
    deleteMode?: boolean;
}