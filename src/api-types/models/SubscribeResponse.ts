/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { Subscription } from './Subscription';

export interface SubscribeResponse {
    new_sub: Subscription;
    error?: string;
}