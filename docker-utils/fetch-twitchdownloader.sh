#!/bin/sh

# THANK YOU TALULAH (https://github.com/nottalulah) for your help in figuring this out
# and also optimizing some code with this commit.
# xoxo :D

case $(uname -m) in
  x86_64)
    ARCH=Linux-x64;;
  aarch64)
    ARCH=LinuxArm64;;
  armhf)
    ARCH=LinuxArm;;
  armv7)
    ARCH=LinuxArm;;
  armv7l)
    ARCH=LinuxArm;;
  *)
    echo "Unsupported architecture: $(uname -m)"
    exit 1
esac

echo "(INFO) Architecture detected: $ARCH"
echo "(1/5) READY - Install unzip"
apt-get update && apt-get -y install unzip curl jq libicu70
VERSION=$(curl --silent "https://api.github.com/repos/lay295/TwitchDownloader/releases" | jq -r --arg arch "$ARCH" '[.[] | select(.assets | length > 0) | select(.assets[].name | contains("CLI") and contains($arch))] | max_by(.published_at) | .tag_name')
echo "(2/5) DOWNLOAD - Acquire twitchdownloader"
curl -o twitchdownloader.zip \
    --connect-timeout 5 \
    --max-time 120 \
    --retry 5 \
    --retry-delay 0 \
    --retry-max-time 40 \
    -L "https://github.com/lay295/TwitchDownloader/releases/download/$VERSION/TwitchDownloaderCLI-$VERSION-$ARCH.zip"
unzip twitchdownloader.zip
chmod +x TwitchDownloaderCLI
echo "(3/5) Smoke test"
./TwitchDownloaderCLI --help
cp ./TwitchDownloaderCLI /usr/local/bin/TwitchDownloaderCLI
