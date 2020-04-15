FROM arm32v7/alpine:3.11

RUN apk add --update npm python ffmpeg

# Change directory so that our commands run inside this new directory
WORKDIR /app

# Copy dependency definitions
COPY ./ /app/

# Change directory to backend
WORKDIR /app

# Install dependencies on backend
RUN npm install

# Expose the port the app runs in
EXPOSE 17442

# Run the specified command within the container.
CMD [ "node", "app.js" ]