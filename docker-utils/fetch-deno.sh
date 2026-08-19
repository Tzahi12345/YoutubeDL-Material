#!/bin/sh

# yt-dlp requires a JavaScript runtime to solve YouTube's player challenges.
# Without one, YouTube downloads fail with "HTTP Error 403: Forbidden".
# See: https://github.com/yt-dlp/yt-dlp/wiki/EJS

case $(uname -m) in
  x86_64)
    ARCH=x86_64-unknown-linux-gnu;;
  aarch64)
    ARCH=aarch64-unknown-linux-gnu;;
  *)
    echo "(INFO) Deno is not available for $(uname -m), skipping JavaScript runtime installation."
    echo "(INFO) YouTube downloads may be limited on this architecture."
    exit 0
esac

echo "(INFO) Architecture detected: $ARCH"
echo "(1/5) READY - Install temp dependencies in deno obtain layer"
apt-get update && apt-get -y install curl unzip ca-certificates
echo "(2/5) DOWNLOAD - Acquire latest deno release"
curl -o deno.zip \
    --connect-timeout 5 \
    --max-time 120 \
    --retry 5 \
    --retry-delay 0 \
    --retry-max-time 40 \
    -L "https://github.com/denoland/deno/releases/latest/download/deno-${ARCH}.zip"
echo "(3/5) PROVISION - Provide deno from deno obtain layer"
unzip -o deno.zip -d /usr/local/bin
chmod +x /usr/local/bin/deno
echo "(4/5) Smoke test"
/usr/local/bin/deno --version
echo "(5/5) CLEANUP - Remove temporary downloads from deno obtain layer"
rm -f deno.zip
apt-get -y remove curl unzip
apt-get -y autoremove
