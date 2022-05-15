#!/bin/bash

# INTERACTIVE ARCHIVE-DUPE-ENTRY FIX SCRIPT FOR YTDL-M
# Date: 2022-05-09

# If you want to run this script on a bare-metal installation instead of within Docker
# make sure that the paths configured below match your paths! (it's wise to use the full paths)
# USAGE: within your container's bash shell:
# ./fix-scripts/<name of fix-script>

# User defines (NO TRAILING SLASHES) / Docker env defaults
PATH_SUBSARCHIVE=/app/subscriptions/archives
PATH_ONEOFFARCHIVE=/app/appdata/archives

# Backup paths (substitute with your personal preference if you like)
PATH_SUBSARCHIVEBKP=$PATH_SUBSARCHIVE-BKP-$(date +%Y%m%d%H%M%S)
PATH_ONEOFFARCHIVEBKP=$PATH_ONEOFFARCHIVE-BKP-$(date +%Y%m%d%H%M%S)


# Define Colors for TUI
yellow=$(tput setaf 3)
normal=$(tput sgr0)

tput civis                                                          # hide the cursor

clear -x
printf "\n"
printf '%*s\n' "${COLUMNS:-$(tput cols)}" '' | tr ' ' -             # horizontal line
printf "Welcome to the INTERACTIVE ARCHIVE-DUPE-ENTRY FIX SCRIPT FOR YTDL-M."
printf "\nThis script will cycle through the archive files in the folders mentioned"
printf "\nbelow and remove within each archive the dupe entries. (compact them)"
printf "\nDuring some older builds of YTDL-M the archives could receive dupe"
printf "\nentries and blow up in size, sometimes causing conflicts with download management."
printf '\n%*s' "${COLUMNS:-$(tput cols)}" '' | tr ' ' -             # horizontal line
printf "\n"

# check whether dirs exist
i=0
[ -d $PATH_SUBSARCHIVE ] && i=$((i+1)) && printf "\n✔ (${i}/2) Found Subscriptions archive directory at ${PATH_SUBSARCHIVE}"
[ -d $PATH_ONEOFFARCHIVE ] && i=$((i+1)) && printf "\n✔ (${i}/2) Found one-off archive directory at ${PATH_ONEOFFARCHIVE}"

# Ask to proceed or cancel, exit on missing paths
case $i in
  0)
    printf "\n\n  Couldn't find any archive location path! \n\nPlease edit this script to configure!"
    tput cnorm
    exit 2;;
  2)
    printf "\n\n  Found all archive locations. \n\nProceed? (Y/N)";;
  *)
    printf "\n\n  Only found ${i} out of 2 archive locations! Something about this script's config must be wrong. \n\nProceed anyways? (Y/N)";;
esac
old_stty_cfg=$(stty -g)
stty raw -echo ; answer=$(head -c 1) ; stty $old_stty_cfg          # Careful playing with stty
if echo "$answer" | grep -iq "^y" ;then
    printf "\n\nRunning jobs now... (this may take a while)\n"

    printf "\nBacking up directories...\n"

    chars="⣾⣽⣻⢿⡿⣟⣯⣷"
    cp -R $PATH_SUBSARCHIVE $PATH_SUBSARCHIVEBKP &
    PID=$!
    i=1
    echo -n ' '
    while [ -d /proc/$PID ]
    do
      printf "${yellow}\b${chars:i++%${#chars}:1}${normal}"
      sleep 0.15
    done
    [ -d $PATH_SUBSARCHIVEBKP ] && printf "\r✔ Backed up ${PATH_SUBSARCHIVE} to ${PATH_SUBSARCHIVEBKP} ($(du -sh $PATH_SUBSARCHIVEBKP | cut -f1))\n"

    cp -R $PATH_ONEOFFARCHIVE $PATH_ONEOFFARCHIVEBKP &
    PID2=$!
    i=1
    echo -n ' '
    while [ -d /proc/$PID2 ]
    do
      printf "${yellow}\b${chars:i++%${#chars}:1}${normal}"
      sleep 0.1
    done
    [ -d $PATH_ONEOFFARCHIVEBKP ] && printf "\r✔ Backed up ${PATH_ONEOFFARCHIVE} to ${PATH_ONEOFFARCHIVEBKP} ($(du -sh $PATH_ONEOFFARCHIVEBKP | cut -f1))\n"


    printf "\nCompacting files...\n"

    tmpfile=$(mktemp) &&

    [ -d $PATH_SUBSARCHIVE ] &&
    find $PATH_SUBSARCHIVE -name '*.txt' -print0 | while read -d $'\0' file # Set delimiter to null because we want to catch all possible filenames (WE CANNOT CHANGE IFS HERE) - https://stackoverflow.com/a/15931055
    do
        cp "$file" "$tmpfile"
        { awk '!x[$0]++' "$tmpfile" > "$file"; } &                         # https://unix.stackexchange.com/questions/159695/how-does-awk-a0-work
        PID3=$!
        i=1
        echo -n ''
        while [ -d /proc/$PID3 ]
        do
          printf "${yellow}\b${chars:i++%${#chars}:1}${normal}"
          sleep 0.1
        done
        BEFORE=$(wc -l < $tmpfile)
        AFTER=$(wc -l < $file)
        if [[ "$AFTER" -ne "$BEFORE" ]]; then
          printf "\b✔ Compacted down to ${AFTER} lines from ${BEFORE}: ${file}\n"
          else
          printf "\bℹ No action needed for file: ${file}\n"
        fi
    done

    [ -d $PATH_ONEOFFARCHIVE ] &&
    find $PATH_ONEOFFARCHIVE -name '*.txt' -print0 | while read -d $'\0' file
    do
        cp "$file" "$tmpfile" &
        awk '!x[$0]++' "$tmpfile" > "$file" &
        PID4=$!
        i=1
        echo -n ''
        while [ -d /proc/$PID4 ]
        do
          printf "${yellow}\b${chars:i++%${#chars}:1}${normal}"
          sleep 0.1
        done
        BEFORE=$(wc -l < $tmpfile)
        AFTER=$(wc -l < $file)
        if [ "$BEFORE" -ne "$AFTER" ]; then
          printf "\b✔ Compacted down to ${AFTER} lines from ${BEFORE}: ${file}\n"
          else
          printf "\bℹ No action ran for file: ${file}\n"
        fi
    done
    tput cnorm                                                     # show the cursor
    rm "$tmpfile"

    printf "\n\n✔ Done."
    printf "\nℹ Please keep in mind that you may still want to"
    printf "\n  run corruption checks against your archives!\n\n"
    exit
else
    tput cnorm
    printf "\nOkay, bye.\n\n"
    exit
fi
