/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

export type Schedule = {
    type: Schedule.type;
    data: {
dayOfWeek?: Array<number>;
hour?: number;
minute?: number;
timestamp?: number;
tz?: string;
};
};

export namespace Schedule {

    export enum type {
        TIMESTAMP = 'timestamp',
        RECURRING = 'recurring',
    }


}
