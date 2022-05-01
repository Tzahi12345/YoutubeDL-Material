#!/bin/sh

# THANK YOU TALULAH (https://github.com/nottalulah) for your help in figuring this out
# and also optimizing some code with this commit.
# xoxo :D

# set -xeuo pipefail

case $(uname -m) in
  x86_64)
    ARCH=amd64;;
  aarch64)
    ARCH=arm64;;
  armhf)
    ARCH=armhf;;
  armv7)
    ARCH=armel;;
  armv7l)
    ARCH=armel;;
  *)
    echo "Unsupported architecture: $(uname -m)"
    exit 1
esac

echo "Architecture: $ARCH"
curl --connect-timeout 5 \
    --max-time 10 \
    --retry 5 \
    --retry-delay 0 \
    --retry-max-time 40 \
    "https://johnvansickle.com/ffmpeg/builds/ffmpeg-git-${ARCH}-static.tar.xz" -o ffmpeg.txz
mkdir /tmp/ffmpeg
tar xf ffmpeg.txz -C /tmp/ffmpeg
cp /tmp/ffmpeg/*/ffmpeg /usr/local/bin/ffmpeg
cp /tmp/ffmpeg/*/ffprobe /usr/local/bin/ffprobe
rm -rf /tmp/ffmpeg ffmpeg.txz