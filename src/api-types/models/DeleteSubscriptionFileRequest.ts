/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

export type DeleteSubscriptionFileRequest = {
    file_uid: string;
    /**
     * If true, does not remove id from archive. Only valid if youtube-dl archive is enabled in settings.
     */
    deleteForever?: boolean;
};
