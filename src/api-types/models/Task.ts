/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

export type Task = {
    key: string;
    title?: string;
    last_ran: number;
    last_confirmed: number;
    running: boolean;
    confirming: boolean;
    data: Record<string, any>;
    error: string;
    schedule: Record<string, any>;
    options?: Record<string, any>;
};
