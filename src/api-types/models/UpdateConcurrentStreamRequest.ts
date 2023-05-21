/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ConcurrentStream } from './ConcurrentStream';

export type UpdateConcurrentStreamRequest = (ConcurrentStream & {
/**
 * Concurrent stream UID
 */
uid: string;
});
