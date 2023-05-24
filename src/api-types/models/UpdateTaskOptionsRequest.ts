/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { TaskType } from './TaskType';

export type UpdateTaskOptionsRequest = {
    task_key: TaskType;
    new_options: any;
};
