#!/bin/sh
set -eu

CMD="node app.js"

# if the first arg starts with "-" pass it to program
if [ "${1#-}" != "$1" ]; then
  set -- "$CMD" "$@"
fi

# chown current working directory to current user
if [ "$*" = "$CMD" ] && [ "$(id -u)" = "0" ]; then
  find . \! -user "$UID" -exec chown "$UID:$GID" -R '{}' + || true
  exec su-exec "$UID:$GID" "$0" "$@"
fi

exec "$@"
