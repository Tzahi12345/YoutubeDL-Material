#!/bin/sh

# THANK YOU TALULAH (https://github.com/nottalulah) for your help in figuring this out
# and also optimizing some code with this commit.
# xoxo :D

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

echo "(INFO) Architecture detected: $ARCH"
echo "(1/5) READY - Acquire temp dependencies in ffmpeg obtain layer"
apt-get update && apt-get -y install curl xz-utils
echo "(2/5) DOWNLOAD - Acquire latest ffmpeg and ffprobe from John van Sickle's master-sourced builds in ffmpeg obtain layer"
curl -o ffmpeg.txz \
    --connect-timeout 5 \
    --max-time 10 \
    --retry 5 \
    --retry-delay 0 \
    --retry-max-time 40 \
    "https://johnvansickle.com/ffmpeg/builds/ffmpeg-git-${ARCH}-static.tar.xz"
mkdir /tmp/ffmpeg
tar xf ffmpeg.txz -C /tmp/ffmpeg
echo "(3/5) CLEANUP - Remove temp dependencies from ffmpeg obtain layer"
apt-get -y remove curl xz-utils
apt-get -y autoremove
echo "(4/5) PROVISION - Provide ffmpeg and ffprobe from ffmpeg obtain layer"
cp /tmp/ffmpeg/*/ffmpeg /usr/local/bin/ffmpeg
cp /tmp/ffmpeg/*/ffprobe /usr/local/bin/ffprobe
echo "(5/5) CLEANUP - Remove temporary downloads from ffmpeg obtain layer"
rm -rf /tmp/ffmpeg ffmpeg.txz
