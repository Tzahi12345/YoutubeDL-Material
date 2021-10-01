/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */


export interface TwitchChatMessage {
    created_at?: string;
    content_offset_seconds?: number;
    commenter?: {
name?: string,
_id?: string,
created_at?: string,
};
    message?: {
body?: string,
user_color?: string,
};
}