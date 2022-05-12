/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { Schedule } from './Schedule';

export type UpdateTaskScheduleRequest = {
    task_key: string;
    new_schedule: Schedule;
};