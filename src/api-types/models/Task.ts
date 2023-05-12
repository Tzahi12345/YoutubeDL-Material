/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { Schedule } from './Schedule';

export type Task = {
    key: string;
    title?: string;
    last_ran: number;
    last_confirmed: number;
    running: boolean;
    confirming: boolean;
    data: Record<string, any>;
    error: string;
    schedule: Schedule;
    options?: Record<string, any>;
};
