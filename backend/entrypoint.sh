#!/bin/bash
set -eu

# chown current working directory to current user
echo "[entrypoint] setup permission, this may take a while"
find . \! -user "$UID" -and \( \! -path './node_modules*' -and \! -path './.npm*' -and \! -path './fix-scripts*' -and \! -path './public*' -and \! -path './*.js' -or -path './*.config.js' \) -exec chown "$UID:$GID" '{}' + || echo "WARNING! Could not change directory ownership. If you manage permissions externally this is fine, otherwise you may experience issues when downloading or deleting videos."
exec gosu "$UID:$GID" "$@"
