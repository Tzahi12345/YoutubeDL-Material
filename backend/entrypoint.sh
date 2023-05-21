#!/bin/bash
set -euo pipefail

CMD="npm start"

# Disabling this as likely never passing arguments
# if the first arg starts with "-" pass it to program
#if [ "${1#-}" != "$1" ]; then
#  set -- "$CMD" "$@"
#fi

# chown current working directory to current user
if [ "$*" = "$CMD" ] && [ "$(id -u)" = "0" ]; then
  echo "[entrypoint] Setup permission this may take a while depends on number of files"
  find . \! -user "$UID" -exec chown "$UID:$GID" '{}' \+ || echo "WARNING! Could not change directory ownership. If you manage permissions externally this is fine, otherwise you may experience issues when downloading or deleting videos."
  exec gosu "$UID:$GID" "$0" "$@"
fi

exec "$@"
