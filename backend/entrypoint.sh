#!/bin/sh
set -eu

CMD="pm2-runtime pm2.config.js"

# chown current working directory to current user
if [ "$*" = "$CMD" ] && [ "$(id -u)" = "0" ]; then
  find . \! -user "$UID" -exec chown "$UID:$GID" -R '{}' + || echo "WARNING! Could not change directory ownership. If you manage permissions externally this is fine, otherwise you may experience issues when downloading or deleting videos."
  su -c "$0" "$(id -un $UID)" "$@"
fi

exec "$@"
