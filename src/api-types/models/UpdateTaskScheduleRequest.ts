/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { Schedule } from './Schedule';

export interface UpdateTaskScheduleRequest {
    task_key: string;
    new_schedule: Schedule;
}