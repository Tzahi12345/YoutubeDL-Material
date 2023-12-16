# Fetching our utils
FROM ubuntu:24.04 AS utils
ENV DEBIAN_FRONTEND=noninteractive
# Use script due local build compability
COPY docker-utils/*.sh .
RUN chmod +x *.sh
RUN sh ./ffmpeg-fetch.sh
RUN sh ./fetch-twitchdownloader.sh


# Create our Ubuntu 22.04 with node 18.19.0
FROM ubuntu:24.04 AS base
ARG TARGETPLATFORM
ARG DEBIAN_FRONTEND=noninteractive
ENV UID=1001
ENV GID=1001
ENV USER=youtube
ENV NO_UPDATE_NOTIFIER=true
ENV PM2_HOME=/app/pm2
ENV ALLOW_CONFIG_MUTATIONS=true
ENV npm_config_cache=/app/.npm

# Use NVM to get specific node version
ENV NODE_VERSION=18.19.0
RUN groupadd -g $GID $USER && useradd --system -m -g $USER --uid $UID $USER && \
    apt update && \
    apt install -y --no-install-recommends curl ca-certificates tzdata libicu70 libatomic1 && \
    apt clean && \
    rm -rf /var/lib/apt/lists/*

RUN mkdir /usr/local/nvm
ENV PATH="/usr/local/nvm/versions/node/v${NODE_VERSION}/bin/:${PATH}"
ENV NVM_DIR=/usr/local/nvm
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
RUN . "$NVM_DIR/nvm.sh" && nvm install ${NODE_VERSION}
RUN . "$NVM_DIR/nvm.sh" && nvm use v${NODE_VERSION}
RUN . "$NVM_DIR/nvm.sh" && nvm alias default v${NODE_VERSION}

RUN npm install -g npm

# Build frontend
ARG BUILDPLATFORM
FROM --platform=${BUILDPLATFORM} node:18 as frontend
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
RUN apt update && \
    curl -sL https://raw.githubusercontent.com/Unitech/pm2/master/packager/setup.deb.sh | bash && \
    apt install -y --no-install-recommends gosu python3-minimal python-is-python3 python3-pip atomicparsley build-essential && \
    pip install pycryptodomex && \
    apt remove -y --purge build-essential && \
    apt autoremove -y --purge && \
    apt clean && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
# User 1000 already exist from base image
COPY --chown=$UID:$GID --from=utils [ "/usr/local/bin/ffmpeg", "/usr/local/bin/ffmpeg" ]
COPY --chown=$UID:$GID --from=utils [ "/usr/local/bin/ffprobe", "/usr/local/bin/ffprobe" ]
COPY --chown=$UID:$GID --from=utils [ "/usr/local/bin/TwitchDownloaderCLI", "/usr/local/bin/TwitchDownloaderCLI"]
COPY --chown=$UID:$GID --from=backend ["/app/","/app/"]
COPY --chown=$UID:$GID --from=frontend [ "/build/backend/public/", "/app/public/" ]
#COPY --chown=$UID:$GID --from=python ["/app/TwitchDownloaderCLI","/usr/local/bin/TwitchDownloaderCLI"]
RUN chmod +x /app/fix-scripts/*.sh
# Add some persistence data
#VOLUME ["/app/appdata"]

EXPOSE 17442
ENTRYPOINT [ "/app/entrypoint.sh" ]
CMD [ "npm","start" ]
