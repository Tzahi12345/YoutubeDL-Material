FROM ubuntu:22.04 AS ffmpeg

ENV DEBIAN_FRONTEND=noninteractive

COPY docker-build.sh .
RUN sh ./docker-build.sh

#--------------# Stage 2

FROM ubuntu:22.04 as frontend

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get -y install \
  curl \
  gnupg \
  # Ubuntu 22.04 ships Node.JS 12 by default :)
  nodejs \
  # needed on 21.10 and before, maybe not on 22.04 YARN: brings along npm, solves dependency conflicts,
  # spares us this spaghetti approach: https://stackoverflow.com/a/60547197
  npm && \
  apt-get install -f && \
  npm config set strict-ssl false && \
  npm install -g @angular/cli

WORKDIR /build
COPY [ "package.json", "package-lock.json", "/build/" ]
RUN npm install

COPY [ "angular.json", "tsconfig.json", "/build/" ]
COPY [ "src/", "/build/src/" ]
RUN npm run build

#--------------# Final Stage

FROM ubuntu:22.04

ENV UID=1000 \
  GID=1000 \
  USER=youtube \
  NO_UPDATE_NOTIFIER=true

ENV DEBIAN_FRONTEND=noninteractive

RUN groupadd -g $GID $USER && useradd --system -g $USER --uid $UID $USER

RUN apt-get update && apt-get -y install \
  npm \
  python2 \
  python3 \
  atomicparsley && \
  apt-get install -f && \
  apt-get autoremove --purge && \
  apt-get autoremove && \
  apt-get clean && \
  rm -rf /var/lib/apt

WORKDIR /app
COPY --chown=$UID:$GID --from=ffmpeg [ "/usr/local/bin/ffmpeg", "/usr/local/bin/ffmpeg" ]
COPY --chown=$UID:$GID --from=ffmpeg [ "/usr/local/bin/ffprobe", "/usr/local/bin/ffprobe" ]
COPY --chown=$UID:$GID [ "backend/package.json", "backend/package-lock.json", "/app/" ]
ENV PM2_HOME=/app/pm2
RUN npm config set strict-ssl false && \
  npm install pm2 -g && \
  npm install && chown -R $UID:$GID ./

COPY --chown=$UID:$GID --from=frontend [ "/build/backend/public/", "/app/public/" ]
COPY --chown=$UID:$GID [ "/backend/", "/app/" ]
COPY --chown=$UID:$GID --chmod=755 [ "/fix-scripts", "/app/" ]

EXPOSE 17442
ENTRYPOINT [ "/app/entrypoint.sh" ]
CMD [ "pm2-runtime", "pm2.config.js" ]
