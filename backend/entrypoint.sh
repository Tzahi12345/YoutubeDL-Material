#!/bin/sh
set -eu

CMD="node app.js"

# if the first arg starts with "-" pass it to program
if [ "${1#-}" != "$1" ]; then
  set -- "$CMD" "$@"
fi

# chown current working directory to current user
if [ "$*" = "$CMD" ] && [ "$(id -u)" = "0" ]; then
  find . \! -user "$UID" -exec chown "$UID:$GID" -R '{}' + || echo "WARNING! Could not change directory ownership. If you manage permissions externally this is fine, otherwise you may experience issues when downloading or deleting videos."
  exec su-exec "$UID:$GID" "$0" "$@"
fi

exec "$@"
