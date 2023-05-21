/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { Schedule } from './Schedule';
import type { TaskType } from './TaskType';

export type Task = {
    key: TaskType;
    title?: string;
    last_ran: number;
    last_confirmed: number;
    running: boolean;
    confirming: boolean;
    data: any;
    error: string;
    schedule: Schedule;
    options?: any;
};
