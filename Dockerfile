FROM ubuntu:20.04 AS ffmpeg

COPY docker-build.sh .
RUN sh ./docker-build.sh

FROM ubuntu:20.04 as frontend

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get -y install \
  wget \
  curl \
  gnupg && \
  curl -sL https://deb.nodesource.com/setup_12.x  | bash - && \
  apt-get -y install \
  nodejs \
  npm && \
  apt-get install -f && \
  npm install -g @angular/cli

WORKDIR /build
COPY [ "package.json", "package-lock.json", "/build/" ]
RUN npm install

COPY [ "angular.json", "tsconfig.json", "/build/" ]
COPY [ "src/", "/build/src/" ]
RUN npm run build

#--------------#

FROM ubuntu:20.04

ENV UID=1000 \
  GID=1000 \
  USER=youtube \
  NO_UPDATE_NOTIFIER=true

RUN groupadd -g $GID $USER && useradd --system -g $USER --uid $UID $USER

RUN curl -sL https://deb.nodesource.com/setup_12.x | bash -
RUN apt-get update && apt-get -y install \
  python2 \
  python3 \
  atomicparsley

WORKDIR /app
COPY --from=ffmpeg /usr/local/bin/ffmpeg /usr/local/bin/ffmpeg
COPY --from=ffmpeg /usr/local/bin/ffprobe /usr/local/bin/ffprobe 
COPY --chown=$UID:$GID [ "backend/package.json", "backend/package-lock.json", "/app/" ]
ENV PM2_HOME=/app/pm2
RUN npm install pm2 -g && \
  npm install && chown -R $UID:$GID ./

COPY --chown=$UID:$GID --from=frontend [ "/build/backend/public/", "/app/public/" ]
COPY --chown=$UID:$GID [ "/backend/", "/app/" ]

EXPOSE 17442
# ENTRYPOINT [ "/app/entrypoint.sh" ]
CMD [ "pm2-runtime", "pm2.config.js" ]
