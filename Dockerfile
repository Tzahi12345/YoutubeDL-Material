FROM debian:bullseye-slim AS ffmpeg
ENV DEBIAN_FRONTEND=noninteractive
COPY ffmpeg-fetch.sh .
RUN sh ./ffmpeg-fetch.sh


# Build frontend
FROM node:16-bullseye-slim as frontend
ENV DEBIAN_FRONTEND=noninteractive
RUN npm -g install npm && \
    npm install -g @angular/cli
WORKDIR /build
COPY [ "package.json", "package-lock.json", "angular.json", "tsconfig.json", "/build/" ]
COPY [ "src/", "/build/src/" ]
RUN npm install && \
    npm run build && \
    ls -al backend/public


# Install backend deps
FROM node:16-bullseye-slim as backend
ENV NO_UPDATE_NOTIFIER=true
ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app
COPY [ "backend/","/app/" ]
RUN npm config set strict-ssl false && \
    npm install --prod && \
    ls -al

# Final image
FROM node:16-bullseye-slim
ENV NO_UPDATE_NOTIFIER=true
ENV DEBIAN_FRONTEND=noninteractive
ENV PM2_HOME=/app/pm2
ENV UID=1000
ENV GID=1000
RUN npm -g install npm && \
    npm install -g pm2 && \
    apt update && \
    apt install -y --no-install-recommends gosu python3-minimal python-is-python3 atomicparsley ca-certificates && \
    apt clean && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
# User 1000 already exist as node
COPY --chown=$UID:$GID --from=ffmpeg [ "/usr/local/bin/ffmpeg", "/usr/local/bin/ffmpeg" ]
COPY --chown=$UID:$GID --from=ffmpeg [ "/usr/local/bin/ffprobe", "/usr/local/bin/ffprobe" ]
COPY --chown=$UID:$GID --from=backend ["/app/","/app/"]
COPY --chown=$UID:$GID --from=frontend [ "/build/backend/public/", "/app/public/" ]
# Add some persistence data
VOLUME ["/app/appdata"]

EXPOSE 17442
ENTRYPOINT [ "/app/entrypoint.sh" ]
CMD [ "pm2-runtime", "--raw", "pm2.config.js" ]
