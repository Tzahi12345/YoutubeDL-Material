# Fetching our ffmpeg
FROM ubuntu:22.04 AS ffmpeg
ENV DEBIAN_FRONTEND=noninteractive
# Use script due local build compability
COPY ffmpeg-fetch.sh .
RUN sh ./ffmpeg-fetch.sh


# Create our Ubuntu 22.04 with node 16
# Go to 20.04
FROM ubuntu:20.04 AS base
ENV DEBIAN_FRONTEND=noninteractive
ENV UID=1000
ENV GID=1000
ENV USER=youtube
ENV NO_UPDATE_NOTIFIER=true
ENV PM2_HOME=/app/pm2
RUN groupadd -g $GID $USER && useradd --system -m -g $USER --uid $UID $USER && \
    apt update && \
    apt install -y --no-install-recommends curl ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_16.x | bash - && \
    apt install -y --no-install-recommends nodejs && \
    npm -g install npm && \
    apt clean && \
    rm -rf /var/lib/apt/lists/*


# Build frontend
FROM base as frontend
RUN npm install -g @angular/cli
WORKDIR /build
COPY [ "package.json", "package-lock.json", "angular.json", "tsconfig.json", "/build/" ]
COPY [ "src/", "/build/src/" ]
RUN npm install && \
    npm run build && \
    ls -al /build/backend/public


# Install backend deps
FROM base as backend
WORKDIR /app
COPY [ "backend/","/app/" ]
RUN npm config set strict-ssl false && \
    npm install --prod && \
    ls -al


# Final image
FROM base
RUN npm install -g pm2 && \
    apt update && \
    apt install -y --no-install-recommends gosu python3-minimal python-is-python3 atomicparsley && \
    apt clean && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
# User 1000 already exist from base image
COPY --chown=$UID:$GID --from=ffmpeg [ "/usr/local/bin/ffmpeg", "/usr/local/bin/ffmpeg" ]
COPY --chown=$UID:$GID --from=ffmpeg [ "/usr/local/bin/ffprobe", "/usr/local/bin/ffprobe" ]
COPY --chown=$UID:$GID --from=backend ["/app/","/app/"]
COPY --chown=$UID:$GID --from=frontend [ "/build/backend/public/", "/app/public/" ]
# Add some persistence data
#VOLUME ["/app/appdata"]

EXPOSE 17442
ENTRYPOINT [ "/app/entrypoint.sh" ]
CMD [ "pm2-runtime","--raw","pm2.config.js" ]
