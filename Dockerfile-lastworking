FROM arm32v7/alpine:3.11

RUN apk add --update nodejs npm ffmpeg youtube-dl
RUN apk --no-cache add --virtual builds-deps build-base python

# Change directory so that our commands run inside this new directory
WORKDIR /app

# Copy dependency definitions
COPY ./ /app/

# Change directory to backend
WORKDIR /app

# Install dependencies on backend
#RUN apk --no-cache add --virtual builds-deps build-base python
RUN npm config set python /usr/bin/python
RUN npm i -g npm
RUN npm install
#RUN npm rebuild bcrypt --build-from-source

# to test if readding python fixes download errors
#https://github.com/Tzahi12345/YoutubeDL-Material/issues/137#issuecomment-657781754
RUN apk --no-cache add python

RUN apk del builds-deps


# Expose the port the app runs in
EXPOSE 17442

# Run the specified command within the container.
CMD [ "node", "app.js" ]
