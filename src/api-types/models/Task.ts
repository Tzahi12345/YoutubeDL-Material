/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */


export interface Task {
    key: string;
    last_ran: number;
    last_confirmed: number;
    running: boolean;
    confirming: boolean;
    data: any;
    error: string;
    schedule: any;
}