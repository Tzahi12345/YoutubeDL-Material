# YoutubeDL-Material

[![Star History Chart](https://api.star-history.com/svg?repos=voc0der/YoutubeDL-Material&type=Date)](https://star-history.com/#voc0der/YoutubeDL-Material&Date)

[![Docker pulls badge](https://img.shields.io/docker/pulls/voc0der/youtubedl-material.svg)](https://hub.docker.com/r/voc0der/youtubedl-material)
[![Docker image size badge](https://img.shields.io/docker/image-size/voc0der/youtubedl-material?sort=date)](https://hub.docker.com/r/voc0der/youtubedl-material)
[![Heroku deploy badge](https://img.shields.io/badge/%E2%86%91_Deploy_to-Heroku-7056bf.svg)](https://heroku.com/deploy?template=https://github.com/voc0der/YoutubeDL-Material)
[![GitHub issues badge](https://img.shields.io/github/issues/voc0der/YoutubeDL-Material)](https://github.com/voc0der/YoutubeDL-Material/issues)
[![License badge](https://img.shields.io/github/license/voc0der/YoutubeDL-Material)](https://github.com/voc0der/YoutubeDL-Material/blob/master/LICENSE.md)

YoutubeDL-Material is a Material Design frontend for [youtube-dl](https://rg3.github.io/youtube-dl/) / yt-dlp workflows. It's coded using [Angular 21](https://angular.dev/) for the frontend, and [Node.js](https://nodejs.org/) on the backend.

Now with [Docker](#Docker) support!

<hr>

## Getting Started

Check out the prerequisites, and go to the [installation](#Installing) section. Easy as pie!

Here's an image of what it'll look like once you're done:

<img src="https://i.imgur.com/C6vFGbL.png" width="800">

Dark mode:

<img src="https://i.imgur.com/vOtvH5w.png" width="800">

### Prerequisites

NOTE: If you would like to use Docker, you can skip down to the [Docker](#Docker) section for a setup guide.

Required dependencies:

* Node.js 24 (npm 10+)
* Python 3

Optional dependencies:

* AtomicParsley (for embedding thumbnails, package name `atomicparsley`)
* [Twitch Downloader CLI](https://github.com/lay295/TwitchDownloader) (for downloading Twitch VOD chats)

<details>
  <summary>Debian/Ubuntu</summary>

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs ffmpeg unzip python3 python3-pip
# Optional but recommended for local installs:
python3 -m pip install --user yt-dlp yt-dlp-ejs
```

</details>

<details>
  <summary>CentOS 7 (legacy)</summary>

Current builds require Node.js 24 (`>=24 <26`), so CentOS 7 is no longer a supported host for native installs. Use Docker or a newer distro.

</details>

### Installing

If you are using Docker, skip to the [Docker](#Docker) section. Otherwise, continue:

1. First, download the [latest release](https://github.com/voc0der/YoutubeDL-Material/releases/latest)!

2. Drag the `youtubedl-material` directory to an easily accessible directory. Navigate to the `appdata` folder and edit the `default.json` file.

NOTE: If you are intending to use a [reverse proxy](https://github.com/voc0der/YoutubeDL-Material/wiki/Reverse-Proxy-Setup), this next step is not necessary

3. Port forward the port listed in `default.json`, which defaults to `17442`.

4. Once the configuration is done, install and start the backend:

```bash
npm install --prefix backend
npm start --prefix backend
```

This runs the backend server, which serves the frontend as well. On your browser, navigate to the server URL with the configured port. Try putting in a YouTube link to see if it works.

If you experience problems, know that it's usually caused by a configuration problem. The first thing you should do is check the console. To get there, right click anywhere on the page and click "Inspect element." Then on the menu that pops up, click console. Look at the error there, and try to investigate.

## Build it yourself

If you'd like to install YoutubeDL-Material, go to the Installation section. If you want to build it yourself and/or develop the repository, then this section is for you.

To deploy from source, clone the repository and go into the `youtubedl-material` directory.

Requirements for local builds:

* Node.js `>=24 <26`
* npm `>=10`

Install dependencies and build the frontend:

```bash
npm install
npm install --prefix backend
npm run build
```

This builds the app and puts the output files in `backend/public`.

NOTE: `npm start` in the repo root starts the Angular dev server (`ng serve`). To run the backend app, use `npm start --prefix backend`.

### Angular 21 / Videogular install note

The repo currently uses Angular 21 and `@videogular/ngx-videogular@20`. Videogular 20 still declares Angular 20 peer ranges, so the repository includes a temporary `.npmrc` with `legacy-peer-deps=true`.

Please keep this file when building locally or in Docker until Videogular publishes Angular 21 peer support.

Lastly, type `npm -g install pm2` to install pm2 globally.

The frontend is now complete. The backend is much easier. Just go into the `backend` folder, and type `npm start`.

Finally, if you want your instance to be available from outside your network, you can set up a [reverse proxy](https://github.com/voc0der/YoutubeDL-Material/wiki/Reverse-Proxy-Setup).

Alternatively, you can port forward the port specified in the config (defaults to `17442`) and point it to the server's IP address. Make sure the port is also allowed through the server's firewall.

## Docker

### Host-specific instructions

If you're on a Synology NAS, unRAID, Raspberry Pi 4 or any other possible special case you can check if there's known issues or instructions both in the issue tracker and in the [Wiki!](https://github.com/voc0der/YoutubeDL-Material/wiki#environment-specific-guideshelp)

Note: official ARMv7 Docker image builds have been retired. Use `amd64` / `arm64` images or build locally for unsupported architectures.

### Setup

If you are looking to setup YoutubeDL-Material with Docker, this section is for you. And you're in luck! Docker setup is quite simple.

1. Run `curl -L https://github.com/voc0der/YoutubeDL-Material/releases/latest/download/docker-compose.yml -o docker-compose.yml` to download the latest Docker Compose, or go to the [releases](https://github.com/voc0der/YoutubeDL-Material/releases/) page to grab the version you'd like.
2. Run `docker compose pull` (or `docker-compose pull` on older Docker setups). This will download the official YoutubeDL-Material docker image.
3. Run `docker compose up -d` (or `docker-compose up -d`) to start it up. The container exposes port `17442` internally. Please check your `docker-compose.yml` file for the *external* port. If you downloaded the file as described above, it defaults to **8998**.
4. Make sure you can connect to the specified URL + *external* port, and if so, you are done!

### Custom UID/GID

By default, the Docker container runs as non-root with UID=1000 and GID=1000. To set this to your own UID/GID, simply update the `environment` section in your `docker-compose.yml` like so:

```yml
environment:
    UID: YOUR_UID
    GID: YOUR_GID
```

### Logging

You can control backend log verbosity with the `YTDL_LOG_LEVEL` environment variable (or `ytdl_log_level`).

- Default: `info` (mostly startup messages, warnings, and errors)
- Use `debug` to enable verbose yt-dlp/debug diagnostics
- Supported values follow standard Winston levels (for example: `error`, `warn`, `info`, `verbose`, `debug`)

Example Docker Compose snippet:

```yml
environment:
    YTDL_LOG_LEVEL: debug
```

## MongoDB

For much better scaling with large datasets please run your YoutubeDL-Material instance with MongoDB backend rather than the json file-based default. It will fix a lot of performance problems (especially with datasets in the tens of thousands videos/audios)!

[Tutorial](https://github.com/voc0der/YoutubeDL-Material/wiki/Setting-a-MongoDB-backend-to-use-as-database-provider-for-YTDL-M).

## API

[API Docs](https://youtubedl-material.stoplight.io/docs/youtubedl-material/Public%20API%20v1.yaml)

To get started, go to the settings menu and enable the public API from the *Extra* tab. You can generate an API key if one is missing.

Once you have enabled the API and have the key, you can start sending requests by adding the query param `apiKey=API_KEY`. Replace `API_KEY` with your actual API key, and you should be good to go! Nearly all of the backend should be at your disposal. View available endpoints in the link above.

## iOS Shortcut 

If you are using iOS, try YoutubeDL-Material more conveniently with a Shortcut. With this Shorcut, you can easily start downloading YouTube video with just two taps! (Or maybe three?)

You can download Shortcut [here.](https://routinehub.co/shortcut/10283/)

## Contributing

If you're interested in contributing, first: awesome! Second, please refer to the guidelines/setup information located in the [Contributing](https://github.com/voc0der/YoutubeDL-Material/wiki/Contributing) wiki page, it's a helpful way to get you on your feet and coding away.

Pull requests are always appreciated! If you're a bit rusty with coding, that's no problem: we can always help you learn. And if that's too scary, that's OK too! You can create issues for features you'd like to see or bugs you encounter, it all helps this project grow.

If you're interested in translating the app into a new language, check out the [Translate](https://github.com/voc0der/YoutubeDL-Material/wiki/Translate) wiki page.

## Authors

* **Isaac Grynsztein** (me!) - *Initial work*
* **voc0der** - *Current maintenance*

Official translators:

* Spanish - tzahi12345
* German - UnlimitedCookies
* Chinese - TyRoyal

See also the list of [contributors](https://github.com/voc0der/YoutubeDL-Material/graphs/contributors) who participated in this project.

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details

## Legal Disclaimer

This project is in no way affiliated with Google LLC, Alphabet Inc. or YouTube (or their subsidiaries) nor endorsed by them.

## Acknowledgments

* youtube-dl
* [AllTube](https://github.com/Rudloff/alltube) (for the inspiration)
