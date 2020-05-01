FROM alpine:3.11

RUN \ 
apk add --no-cache npm python ffmpeg && \
apk add --no-cache --repository http://dl-cdn.alpinelinux.org/alpine/edge/testing/ \
    atomicparsley

WORKDIR /app

COPY package.json /app/

RUN npm install

COPY ./ /app/

EXPOSE 17442

CMD [ "node", "app.js" ]
