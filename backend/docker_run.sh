#!/bin/sh
chown -R $UID:$GID /app
exec su-exec $UID:$GID /sbin/tini -- node app.js
