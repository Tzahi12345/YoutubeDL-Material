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
    data: any;
    error: string;
    schedule: any;
};