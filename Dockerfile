FROM arm32v7/alpine:3.11

RUN apk add --no-cache nodejs npm ffmpeg youtube-dl
RUN apk add --no-cache  --virtual builds-deps build-base

# Change directory so that our commands run inside this new directory
WORKDIR /app

# Copy dependency definitions
COPY ./ /app/

# Change directory to backend
WORKDIR /app

# Install dependencies on backend
RUN apk add --no-cache  --virtual builds-deps build-base python
RUN npm config set python /usr/bin/python
RUN npm i -g npm
RUN npm install
RUN apk del builds-deps
RUN apk add --no-cache python

# Expose the port the app runs in
EXPOSE 17442

# Run the specified command within the container.
CMD [ "node", "app.js" ]

