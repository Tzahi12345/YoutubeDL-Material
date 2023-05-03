<h1>Development</h1>

- [First time...](#first-time)
  - [Setup](#setup)
  - [Startup](#startup)
- [Debugging the backend (VSC)](#debugging-the-backend-vsc)
- [Deploy changes](#deploy-changes)
  - [Frontend](#frontend)
  - [Backend](#backend)

# First time...

## Setup
Checkout the repository and navigate to the `youtubedl-material` directory.
```bash
vim ./src/assets/default.json # Edit settings for your local environment. This config file is just the dev config file, if YTDL_MODE is not set to "debug", then ./backend/appdata/default.json will be used
npm -g install pm2 # Install pm2
npm install # Install dependencies for the frontend
cd ./backend
npm install # Install dependencies for the backend
cd ..
npm run build # Build the frontend
```
This step have to be done only once.

## Startup
Navigate to the `youtubedl-material/backend` directory and run `npm start`.

# Debugging the backend (VSC)
Open the `youtubedl-material` directory in Visual Studio Code and run the launch configuration `Dev: Debug Backend`.

# Deploy changes

## Frontend
Navigate to the `youtubedl-material` directory and run `npm run build`. Restart the backend.

## Backend
Simply restart the backend.