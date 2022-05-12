/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { file } from './file';

export type GetFileFormatsResponse = {
    success: boolean;
    result: (file & {
formats?: Array<any>;
});
};