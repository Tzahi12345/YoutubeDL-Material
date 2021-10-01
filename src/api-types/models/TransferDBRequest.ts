/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */


export interface TransferDBRequest {
    /**
     * True if transfering DB from Local to MongoDB, false if transferring DB from MongoDB to Local
     */
    local_to_remote: boolean;
}