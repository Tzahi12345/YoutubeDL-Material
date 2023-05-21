/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { TaskType } from './TaskType';

export type UpdateTaskDataRequest = {
    task_key: TaskType;
    new_data: any;
};
