FROM alpine:3.12

ENV UID=1000 \
  GID=1000 \
  USER=youtube
RUN addgroup -S $USER -g $GID && adduser -D -S $USER -G $USER -u $UID

RUN apk add --no-cache \
    ffmpeg \
    npm \
    python2 \
    su-exec  \
  && apk add --no-cache --repository http://dl-cdn.alpinelinux.org/alpine/edge/testing/ \
    atomicparsley

# switch to default user to not chown node_modules on startup
USER $USER
WORKDIR /app
COPY --chown=$UID:$GID [ "package.json", "package-lock.json", "/app/" ]

# run npm install as root, required for Windows hosts
USER root
RUN npm install

RUN chown -R $UID:$GID ./

COPY --chown=$UID:$GID [ "./", "/app/" ]

EXPOSE 17442
# switch back to root to allow UID/GID changing
USER root
ENTRYPOINT [ "/app/entrypoint.sh" ]
CMD [ "node", "app.js" ]
