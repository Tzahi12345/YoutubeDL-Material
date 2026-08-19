# Fetching our utils
FROM ubuntu:22.04 AS utils
ENV DEBIAN_FRONTEND=noninteractive
# Use script due local build compability
COPY docker-utils/*.sh .
RUN chmod +x *.sh
RUN sh ./ffmpeg-fetch.sh
RUN sh ./fetch-twitchdownloader.sh
RUN sh ./fetch-deno.sh


# Create our Ubuntu 24.04 with node 16.14.2 (that specific version is required as per: https://stackoverflow.com/a/72855258/8088021)
# 24.04 is required because yt-dlp deprecated Python 3.10, which is what 22.04 ships
FROM ubuntu:24.04 AS base
ARG TARGETPLATFORM
ARG DEBIAN_FRONTEND=noninteractive
ENV UID=1000
ENV GID=1000
ENV USER=youtube
ENV NO_UPDATE_NOTIFIER=true
ENV PM2_HOME=/app/pm2
ENV ALLOW_CONFIG_MUTATIONS=true
ENV npm_config_cache=/app/.npm

# Use NVM to get specific node version
ENV NODE_VERSION=16.14.2
# Ubuntu 24.04 ships a default "ubuntu" user occupying UID/GID 1000, remove it first
RUN { userdel -r ubuntu || true; groupdel ubuntu || true; } 2>/dev/null; \
    groupadd -g $GID $USER && useradd --system -m -g $USER --uid $UID $USER && \
    apt update && \
    apt install -y --no-install-recommends curl ca-certificates tzdata libicu74 libatomic1 && \
    apt clean && \
    rm -rf /var/lib/apt/lists/*

RUN mkdir /usr/local/nvm
ENV PATH="/usr/local/nvm/versions/node/v${NODE_VERSION}/bin/:${PATH}"
ENV NVM_DIR=/usr/local/nvm
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
RUN . "$NVM_DIR/nvm.sh" && nvm install ${NODE_VERSION}
RUN . "$NVM_DIR/nvm.sh" && nvm use v${NODE_VERSION}
RUN . "$NVM_DIR/nvm.sh" && nvm alias default v${NODE_VERSION}

# Build frontend
ARG BUILDPLATFORM
FROM --platform=${BUILDPLATFORM} node:16 as frontend
RUN npm install -g @angular/cli
WORKDIR /build
COPY [ "package.json", "package-lock.json", "angular.json", "tsconfig.json", "/build/" ]
COPY [ "src/", "/build/src/" ]
RUN npm install && \
    npm run build && \
    ls -al /build/backend/public
RUN npm uninstall -g @angular/cli
RUN rm -rf node_modules


# Install backend deps
FROM base as backend
WORKDIR /app
COPY [ "backend/","/app/" ]
RUN npm config set strict-ssl false && \
    npm install --prod && \
    ls -al

#FROM base as python
# armv7 need build from source
#WORKDIR /app
#COPY docker-utils/GetTwitchDownloader.py .
#RUN apt update && \
#    apt install -y --no-install-recommends python3-minimal python-is-python3 python3-pip python3-dev build-essential libffi-dev && \
#    apt clean && \
#    rm -rf /var/lib/apt/lists/*
#RUN pip install PyGithub requests
#RUN python GetTwitchDownloader.py

# Final image
FROM base
RUN npm install -g pm2 && \
    apt update && \
    apt install -y --no-install-recommends gosu python3-minimal python-is-python3 python3-pycryptodome atomicparsley && \
    apt clean && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
# User 1000 already exist from base image
# Copies ffmpeg, ffprobe, TwitchDownloaderCLI and (where available) deno in one go.
# deno is optional as it does not ship binaries for every architecture we build for.
COPY --chown=$UID:$GID --from=utils [ "/usr/local/bin/", "/usr/local/bin/" ]
COPY --chown=$UID:$GID --from=backend ["/app/","/app/"]
COPY --chown=$UID:$GID --from=frontend [ "/build/backend/public/", "/app/public/" ]
#COPY --chown=$UID:$GID --from=python ["/app/TwitchDownloaderCLI","/usr/local/bin/TwitchDownloaderCLI"]
RUN chmod +x /app/fix-scripts/*.sh
# Add some persistence data
#VOLUME ["/app/appdata"]

EXPOSE 17442
ENTRYPOINT [ "/app/entrypoint.sh" ]
CMD [ "npm","start" ]
