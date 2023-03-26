/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

export type DBBackup = {
    name: string;
    timestamp: number;
    size: number;
    source: DBBackup.source;
};

export namespace DBBackup {

    export enum source {
        LOCAL = 'local',
        REMOTE = 'remote',
    }


}
