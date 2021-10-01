/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */


export interface SubscribeRequest {
    name: string;
    url: string;
    timerange?: string;
    audioOnly?: boolean;
    customArgs?: string;
    customFileOutput?: string;
    maxQuality?: string;
}