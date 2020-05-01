FROM alpine:3.11

RUN \ 
apk add --no-cache npm python ffmpeg && \
apk add --no-cache --repository http://dl-cdn.alpinelinux.org/alpine/edge/testing/ \
    atomicparsley

WORKDIR /app

COPY ./ /app/

WORKDIR /app

RUN npm install

EXPOSE 17442

CMD [ "node", "app.js" ]
