#!/bin/sh
case $(uname -m) in
  x86_64)
    ARCH=amd64;;
  aarch64)
    ARCH=arm64;;
  armv7)
    ARCH=armel;;
  armv7l)
    ARCH=armel;;
  *)
    ARCH=$(uname -m);;
esac
wget "https://johnvansickle.com/ffmpeg/builds/ffmpeg-git-$ARCH-static.tar.xz" -O ffmpeg.txz
docker build