/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { SuccessObject } from './SuccessObject';

export type RestartDownloadResponse = (SuccessObject & {
new_download_uid?: string;
});
