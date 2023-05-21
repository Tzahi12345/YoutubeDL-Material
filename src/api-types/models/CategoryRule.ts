/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

export type CategoryRule = {
    preceding_operator?: CategoryRule.preceding_operator;
    comparator?: CategoryRule.comparator;
};

export namespace CategoryRule {

    export enum preceding_operator {
        OR = 'or',
        AND = 'and',
    }

    export enum comparator {
        INCLUDES = 'includes',
        NOT_INCLUDES = 'not_includes',
        EQUALS = 'equals',
        NOT_EQUALS = 'not_equals',
    }


}
