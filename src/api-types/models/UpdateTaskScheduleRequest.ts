/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { Schedule } from './Schedule';
import type { TaskType } from './TaskType';

export type UpdateTaskScheduleRequest = {
    task_key: TaskType;
    new_schedule: Schedule;
};
