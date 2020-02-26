FROM ubuntu:18.04

RUN apt-get update && apt-get install -y \
  nodejs \
  apache2 \
  npm \
  youtube-dl

# Change directory so that our commands run inside this new directory
WORKDIR /var/www/html

# Copy dependency definitions
COPY ./ /var/www/html/

# Change directory to backend
WORKDIR /var/www/html/backend

# Install dependencies on backend
RUN npm install

# Change back to original directory
WORKDIR /var/www/html

# Expose the port the app runs in
EXPOSE 80

# Run the specified command within the container.
CMD ./docker_wrapper.sh