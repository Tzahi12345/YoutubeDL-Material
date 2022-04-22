/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */


export interface Schedule {
    type: Schedule.type;
    data: {
dayOfWeek?: Array<number>,
hour?: number,
minute?: number,
timestamp?: number,
};
}

export namespace Schedule {

    export enum type {
        TIMESTAMP = 'timestamp',
        RECURRING = 'recurring',
    }


}