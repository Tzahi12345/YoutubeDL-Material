/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { FileTypeFilter } from './FileTypeFilter';
import type { Sort } from './Sort';

export type GetAllFilesRequest = {
    sort?: Sort;
    range?: Array<number>;
    /**
     * Filter files by title
     */
    text_search?: string;
    file_type_filter?: FileTypeFilter;
    /**
     * If set to true, only gets favorites
     */
    favorite_filter?: boolean;
    /**
     * Include if you want to filter by subscription
     */
    sub_id?: string;
};
