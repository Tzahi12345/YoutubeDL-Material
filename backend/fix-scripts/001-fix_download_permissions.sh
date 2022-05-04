#!/bin/sh

# INTERACTIVE PERMISSIONS FIX SCRIPT FOR YTDL-M
# Date: 2022-05-03

# If you want to run this script on a bare-metal installation instead of within Docker
# make sure that the paths configured below match your paths! (it's wise to use the full paths)
# USAGE: within your container's bash shell:
# chmod -R +x ./fix-scripts/
# ./fix-scripts/001-fix_download_permissions.sh

# User defines / Docker env defaults
PATH_SUBS=/app/subscriptions
PATH_AUDIO=/app/audio
PATH_VIDS=/app/video

clear -x
echo "\n"
printf '%*s\n' "${COLUMNS:-$(tput cols)}" '' | tr ' ' -             # horizontal line
echo "Welcome to the INTERACTIVE PERMISSIONS FIX SCRIPT FOR YTDL-M."
echo "This script will set YTDL-M's download paths' owner to ${USER} (${UID}:${GID})"
echo "and permissions to the default of 644."
printf '%*s\n' "${COLUMNS:-$(tput cols)}" '' | tr ' ' -             # horizontal line
echo "\n"

# check whether dirs exist
i=0
[ -d $PATH_SUBS ] && i=$((i+1)) && echo "✔ (${i}/3) Found Subscriptions directory at ${PATH_SUBS}"
[ -d $PATH_AUDIO ] && i=$((i+1)) && echo "✔ (${i}/3) Found Audio directory at ${PATH_AUDIO}"
[ -d $PATH_VIDS ] && i=$((i+1)) && echo "✔ (${i}/3) Found Video directory at ${PATH_VIDS}"

# Ask to proceed or cancel, exit on missing paths
case $i in
  0)
    echo "\nCouldn't find any download path to fix permissions for! \nPlease edit this script to configure!"
    exit 2;;
  3)
    echo "\nFound all download paths to fix permissions for. \nProceed? (Y/N)";;
  *)
    echo "\nOnly found ${i} out of 3 download paths! Something about this script's config must be wrong. \nProceed anyways? (Y/N)";;
esac
old_stty_cfg=$(stty -g)
stty raw -echo ; answer=$(head -c 1) ; stty $old_stty_cfg # Careful playing with stty
if echo "$answer" | grep -iq "^y" ;then
    echo "\n  Running jobs now... (this may take a while)\n"
    [ -d $PATH_SUBS ] && chown "$UID:$GID" -R $PATH_SUBS && echo "✔ Set owner of ${PATH_SUBS} to ${USER}."
    [ -d $PATH_SUBS ] && chmod 644 -R $PATH_SUBS && echo "✔ Set permissions of ${PATH_SUBS} to 644."
    [ -d $PATH_AUDIO ] && chown "$UID:$GID" -R $PATH_AUDIO &&  echo "✔ Set owner of ${PATH_AUDIO} to ${USER}."
    [ -d $PATH_AUDIO ] && chmod 644 -R $PATH_AUDIO && echo "✔ Set permissions of ${PATH_AUDIO} to 644."
    [ -d $PATH_VIDS ] && chown "$UID:$GID" -R $PATH_VIDS &&  echo "✔ Set owner of ${PATH_VIDS} to ${USER}."
    [ -d $PATH_VIDS ] && chmod 644 -R $PATH_VIDS && echo "✔ Set permissions of ${PATH_VIDS} to 644."
    echo "\n✔ Done."
    echo "\n  If you noticed file access errors those MAY be due to currently running downloads."
    echo "  Feel free to re-run this script, however download parts should have correct file permissions anyhow. :)"
    exit
else
    echo "\nOkay, bye."
fi
