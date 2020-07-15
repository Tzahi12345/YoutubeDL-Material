FROM arm32v7/python:rc-alpine3.12

ENV UID=1000 \
  GID=1000 \
  USER=youtube

RUN addgroup -S $USER -g $GID && adduser -D -S $USER -G $USER -u $UID


RUN apk add --no-cache g++ gcc libgcc libstdc++ linux-headers make 
RUN apk add --no-cache python2 ffmpeg nodejs npm python2-dev python2 su-exec
RUN apk add --no-cache --repository http://dl-cdn.alpinelinux.org/alpine/edge/testing/

RUN  npm install --quiet node-gyp -g
RUN  npm install --quiet

RUN wget https://yt-dl.org/downloads/latest/youtube-dl -O /usr/local/bin/youtube-dl
RUN chmod a+rx /usr/local/bin/youtube-dl
RUN hash -r

WORKDIR /app
#COPY --chown=$UID:$GID [ "package.json", "package-lock.json", "/app/" ]

COPY --chown=$UID:$GID [ "./", "/app/" ]

RUN npm i -g npm
RUN npm install && chown -R $UID:$GID ./

# update youtube-dl
RUN youtube-dl -U

#COPY --chown=$UID:$GID [ "./", "/app/" ]

EXPOSE 17442

ENTRYPOINT [ "/app/entrypoint.sh" ]
CMD [ "node", "app.js" ]
