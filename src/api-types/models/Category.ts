/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import { CategoryRule } from './CategoryRule';

export interface Category {
    name?: string;
    uid?: string;
    rules?: Array<CategoryRule>;
    /**
     * Overrides file output for downloaded files in category
     */
    custom_output?: string;
}