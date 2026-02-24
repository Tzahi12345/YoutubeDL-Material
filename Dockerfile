# Fetching our utils
FROM ubuntu:24.04 AS utils
ENV DEBIAN_FRONTEND=noninteractive
# Use script due local build compability
COPY docker-utils/*.sh .
RUN chmod +x *.sh
RUN sh ./ffmpeg-fetch.sh
RUN sh ./fetch-twitchdownloader.sh


# Base runtime image with Node.js 24 (installed via nvm for multi-arch compatibility)
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

# Use NVM to get the current Node 24 LTS line
ENV NODE_VERSION=24
RUN (groupadd -g $GID $USER || groupadd $USER) && \
    (useradd --system -m -g $USER --uid $UID $USER || useradd --system -m -g $USER $USER) && \
    apt update && \
    apt install -y --no-install-recommends curl ca-certificates tzdata libicu74 libatomic1 && \
    apt clean && \
    rm -rf /var/lib/apt/lists/*

RUN mkdir /usr/local/nvm
ENV PATH="/usr/local/nvm/current/bin:${PATH}"
ENV NVM_DIR=/usr/local/nvm
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
RUN apt update && \
    apt install -y --no-install-recommends python3 python-is-python3 make g++ && \
    . "$NVM_DIR/nvm.sh" && \
    nvm install ${NODE_VERSION} && \
    nvm use v${NODE_VERSION} && \
    nvm alias default v${NODE_VERSION} && \
    apt purge -y python3 python-is-python3 make g++ && \
    apt autoremove -y --purge && \
    apt clean && \
    rm -rf /var/lib/apt/lists/* && \
    rm -f "$NVM_DIR/current" && \
    ln -s "$(dirname "$(dirname "$(command -v node)")")" "$NVM_DIR/current"

# Build frontend
ARG BUILDPLATFORM
FROM --platform=${BUILDPLATFORM} node:24 as frontend
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
    apt install -y --no-install-recommends gosu python3-minimal python-is-python3 python3-pip atomicparsley build-essential unzip && \
    pip install --break-system-packages pycryptodomex && \
    apt remove -y --purge build-essential && \
    apt autoremove -y --purge && \
    apt clean && \
    rm -rf /var/lib/apt/lists/*

# Install Deno system-wide for yt-dlp YouTube support
RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh

# Ensure yt-dlp and yt-dlp-ejs are up to date
RUN pip install --upgrade yt-dlp yt-dlp-ejs --break-system-packages || \
    pip install --upgrade yt-dlp yt-dlp-ejs
WORKDIR /app
# User 1000 already exist from base image
COPY --chown=$UID:$GID --from=utils [ "/usr/local/bin/ffmpeg", "/usr/local/bin/ffmpeg" ]
COPY --chown=$UID:$GID --from=utils [ "/usr/local/bin/ffprobe", "/usr/local/bin/ffprobe" ]
COPY --chown=$UID:$GID --from=utils [ "/usr/local/bin/TwitchDownloaderCLI", "/usr/local/bin/TwitchDownloaderCLI"]
COPY --chown=$UID:$GID --from=backend ["/app/","/app/"]
COPY --chown=$UID:$GID --from=frontend [ "/build/backend/public/", "/app/public/" ]
#COPY --chown=$UID:$GID --from=python ["/app/TwitchDownloaderCLI","/usr/local/bin/TwitchDownloaderCLI"]
RUN chmod +x /app/fix-scripts/*.sh && \
    mkdir -p /app/pm2 /app/.npm && \
    chmod 777 /app/pm2 /app/.npm
# Add some persistence data
#VOLUME ["/app/appdata"]

EXPOSE 17442
ENTRYPOINT [ "/app/entrypoint.sh" ]
CMD [ "npm","start" ]
