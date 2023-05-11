/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { Subscription } from './Subscription';

export type SubscribeResponse = {
    new_sub: Subscription;
    error?: string;
};
