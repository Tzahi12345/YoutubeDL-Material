/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { ConcurrentStream } from './ConcurrentStream';

export interface UpdateConcurrentStreamRequest extends ConcurrentStream {
    /**
     * Concurrent stream UID
     */
    uid: string;
}