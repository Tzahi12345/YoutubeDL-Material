#!/bin/sh
set -eu

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
apt-get update && apt-get -y install unzip curl libicu74

# Resolve latest version from GitHub's redirect endpoint to avoid API rate-limit failures.
LATEST_RELEASE_URL=$(curl -fsSL -o /dev/null -w '%{url_effective}' "https://github.com/lay295/TwitchDownloader/releases/latest")
VERSION="${LATEST_RELEASE_URL##*/}"

if [ -z "$VERSION" ] || [ "$VERSION" = "latest" ]; then
  echo "Unable to resolve TwitchDownloader latest release version."
  exit 1
fi

echo "(2/5) DOWNLOAD - Acquire twitchdownloader ($VERSION)"
DOWNLOAD_OK=0
for CANDIDATE_VERSION in "$VERSION" "${VERSION#v}"; do
  [ -n "$CANDIDATE_VERSION" ] || continue
  ASSET_URL="https://github.com/lay295/TwitchDownloader/releases/download/$VERSION/TwitchDownloaderCLI-$CANDIDATE_VERSION-$ARCH.zip"
  if curl -fL -o twitchdownloader.zip \
      --connect-timeout 5 \
      --max-time 120 \
      --retry 5 \
      --retry-delay 0 \
      --retry-max-time 40 \
      "$ASSET_URL"; then
    DOWNLOAD_OK=1
    break
  fi
done

if [ "$DOWNLOAD_OK" -ne 1 ]; then
  echo "Unable to download TwitchDownloader release asset for architecture: $ARCH"
  exit 1
fi

unzip -o twitchdownloader.zip
if [ ! -f "TwitchDownloaderCLI" ]; then
  echo "Downloaded archive does not contain TwitchDownloaderCLI."
  exit 1
fi

chmod +x TwitchDownloaderCLI
echo "(3/5) Smoke test"
./TwitchDownloaderCLI --help
cp ./TwitchDownloaderCLI /usr/local/bin/TwitchDownloaderCLI
