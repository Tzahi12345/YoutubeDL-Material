FROM ubuntu:focal AS ffmpeg

COPY docker-build.sh .
RUN sh ./docker-build.sh

FROM ubuntu:focal as frontend

RUN apt-get update && apt-get install npm

RUN npm install -g @angular/cli

WORKDIR /build
COPY [ "package.json", "package-lock.json", "/build/" ]
RUN npm install

COPY [ "angular.json", "tsconfig.json", "/build/" ]
COPY [ "src/", "/build/src/" ]
RUN npm run build

#--------------#

FROM ubuntu:focal

ENV UID=1000 \
  GID=1000 \
  USER=youtube

ENV NO_UPDATE_NOTIFIER=true

RUN addgroup -S $USER -g $GID && adduser -D -S $USER -G $USER -u $UID

RUN apt-get update && apt-get install \
  npm \
  python2 \
  python3 \
  atomicparsley

WORKDIR /app
COPY --from=ffmpeg /usr/local/bin/ffmpeg /usr/local/bin/ffmpeg
COPY --from=ffmpeg /usr/local/bin/ffprobe /usr/local/bin/ffprobe 
COPY --chown=$UID:$GID [ "backend/package.json", "backend/package-lock.json", "/app/" ]
ENV PM2_HOME=/app/pm2
RUN npm install pm2 -g
RUN npm install && chown -R $UID:$GID ./

COPY --chown=$UID:$GID --from=frontend [ "/build/backend/public/", "/app/public/" ]
COPY --chown=$UID:$GID [ "/backend/", "/app/" ]

EXPOSE 17442
ENTRYPOINT [ "/app/entrypoint.sh" ]
CMD [ "pm2-runtime", "pm2.config.js" ]
