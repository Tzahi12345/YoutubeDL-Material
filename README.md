# YoutubeDL-Material

[![Docker pulls badge](https://img.shields.io/docker/pulls/tzahi12345/youtubedl-material.svg)](https://hub.docker.com/r/tzahi12345/youtubedl-material)
[![Docker image size badge](https://img.shields.io/docker/image-size/tzahi12345/youtubedl-material?sort=date)](https://hub.docker.com/r/tzahi12345/youtubedl-material)
[![Heroku deploy badge](https://img.shields.io/badge/%E2%86%91_Deploy_to-Heroku-7056bf.svg)](https://heroku.com/deploy?template=https://github.com/Tzahi12345/YoutubeDL-Material)
[![GitHub issues badge](https://img.shields.io/github/issues/Tzahi12345/YoutubeDL-Material)](https://github.com/Tzahi12345/YoutubeDL-Material/issues)
[![License badge](https://img.shields.io/github/license/Tzahi12345/YoutubeDL-Material)](https://github.com/Tzahi12345/YoutubeDL-Material/blob/master/LICENSE.md)

YoutubeDL-Material is a Material Design frontend for [youtube-dl](https://rg3.github.io/youtube-dl/). It's coded using [Angular 13](https://angular.io/) for the frontend, and [Node.js](https://nodejs.org/) on the backend.

Now with [Docker](#Docker) support!

<hr>

### USAGE OF THE NIGHTLY BUILDS IS HIGHLY RECOMMENDED.

For much better scaling with large datasets please run your YTDL-M instance with a MongoDB backend rather than the json file-based default.
It will fix a lot of performance problems (especially with datasets in the tens of thousands videos/audios)!
The (closed) issues as well as the project's Wiki will give you good starting points for your journey!

For MongoDB specifically there is [this little guide](https://github.com/Tzahi12345/YoutubeDL-Material/wiki/Setting-a-MongoDB-backend-to-use-as-database-provider-for-YTDL-M).

<hr>

## Getting Started

Check out the prerequisites, and go to the installation section. Easy as pie!

Here's an image of what it'll look like once you're done:

<img src="https://i.imgur.com/C6vFGbL.png" width="800">

Dark mode:

<img src="https://i.imgur.com/vOtvH5w.png" width="800">

### Prerequisites

NOTE: If you would like to use Docker, you can skip down to the [Docker](#Docker) section for a setup guide.

Debian/Ubuntu:

```bash
sudo apt-get install nodejs youtube-dl ffmpeg unzip python npm
```

CentOS 7:

```bash
sudo yum install epel-release
sudo yum localinstall --nogpgcheck https://download1.rpmfusion.org/free/el/rpmfusion-free-release-7.noarch.rpm
sudo yum install centos-release-scl-rh
sudo yum install rh-nodejs12
scl enable rh-nodejs12 bash
sudo yum install nodejs youtube-dl ffmpeg ffmpeg-devel
```

Optional dependencies:

* AtomicParsley (for embedding thumbnails, package name `atomicparsley`)

### Installing

1. First, download the [latest release](https://github.com/Tzahi12345/YoutubeDL-Material/releases/latest)!

2. Drag the `youtubedl-material` directory to an easily accessible directory. Navigate to the `appdata` folder and edit the `default.json` file.

NOTE: If you are intending to use a [reverse proxy](https://github.com/Tzahi12345/YoutubeDL-Material/wiki/Reverse-Proxy-Setup), this next step is not necessary

3. Port forward the port listed in `default.json`, which defaults to `17442`.

4. Once the configuration is done, run `npm install` to install all the backend dependencies. Once that is finished, type `npm start`. This will run the backend server, which serves the frontend as well. On your browser, navigate to to the server (url with the specified port). Try putting in a youtube link to see if it works. If it does, viola! YoutubeDL-Material is now up and running.

If you experience problems, know that it's usually caused by a configuration problem. The first thing you should do is check the console. To get there, right click anywhere on the page and click "Inspect element." Then on the menu that pops up, click console. Look at the error there, and try to investigate.

## Build it yourself

If you'd like to install YoutubeDL-Material, go to the Installation section. If you want to build it yourself and/or develop the repository, then this section is for you.

To deploy, simply clone the repository, and go into the `youtubedl-material` directory. Type `npm install` and all the dependencies will install. Then type `cd backend` and again type `npm install` to install the dependencies for the backend.

Once you do that, you're almost up and running. All you need to do is edit the configuration in `youtubedl-material/appdata`, go back into the `youtubedl-material` directory, and type `npm build`. This will build the app, and put the output files in the `youtubedl-material/backend/public` folder.

The frontend is now complete. The backend is much easier. Just go into the `backend` folder, and type `npm start`.

Finally, if you want your instance to be available from outside your network, you can set up a [reverse proxy](https://github.com/Tzahi12345/YoutubeDL-Material/wiki/Reverse-Proxy-Setup).

Alternatively, you can port forward the port specified in the config (defaults to `17442`) and point it to the server's IP address. Make sure the port is also allowed through the server's firewall.

## Docker

### Host-specific instructions

If you're on a Synology NAS, unRAID or any other possible special case you can check if there's known issues or instructions both in the issue tracker and in the [Wiki!](https://github.com/Tzahi12345/YoutubeDL-Material/wiki#environment-specific-guideshelp)

### Setup

If you are looking to setup YoutubeDL-Material with Docker, this section is for you. And you're in luck! Docker setup is quite simple.

1. Run `curl -L https://github.com/Tzahi12345/YoutubeDL-Material/releases/latest/download/docker-compose.yml -o docker-compose.yml` to download the latest Docker Compose, or go to the [releases](https://github.com/Tzahi12345/YoutubeDL-Material/releases/) page to grab the version you'd like.
2. Run `docker-compose pull`. This will download the official YoutubeDL-Material docker image.
3. Run `docker-compose up` to start it up. If successful, it should say "HTTP(S): Started on port 17443" or something similar. This tells you the *container-internal* port of the application. Please check your `docker-compose.yml` file for the *external* port. If you downloaded the file as described above, it defaults to **8998**.
4. Make sure you can connect to the specified URL + *external* port, and if so, you are done!

NOTE: It is currently recommended that you use the `nightly` tag on Docker. To do so, simply update the docker-compose.yml `image` field so that it points to `tzahi12345/youtubedl-material:nightly`.

### Custom UID/GID

By default, the Docker container runs as non-root with UID=1000 and GID=1000. To set this to your own UID/GID, simply update the `environment` section in your `docker-compose.yml` like so:

```yml
environment:
    UID: YOUR_UID
    GID: YOUR_GID
```

## API

[API Docs](https://youtubedl-material.stoplight.io/docs/youtubedl-material/Public%20API%20v1.yaml)

To get started, go to the settings menu and enable the public API from the *Extra* tab. You can generate an API key if one is missing.

Once you have enabled the API and have the key, you can start sending requests by adding the query param `apiKey=API_KEY`. Replace `API_KEY` with your actual API key, and you should be good to go! Nearly all of the backend should be at your disposal. View available endpoints in the link above.

## iOS Shortcut 

If you are using iOS, try YoutubeDL-Material more conveniently with a Shortcut. With this Shorcut, you can easily start downloading YouTube video with just two taps! (Or maybe three?)

You can download Shortcut [here.](https://routinehub.co/shortcut/10283/)

## Contributing

If you're interested in contributing, first: awesome! Second, please refer to the guidelines/setup information located in the [Contributing](https://github.com/Tzahi12345/YoutubeDL-Material/wiki/Contributing) wiki page, it's a helpful way to get you on your feet and coding away.

Pull requests are always appreciated! If you're a bit rusty with coding, that's no problem: we can always help you learn. And if that's too scary, that's OK too! You can create issues for features you'd like to see or bugs you encounter, it all helps this project grow.

If you're interested in translating the app into a new language, check out the [Translate](https://github.com/Tzahi12345/YoutubeDL-Material/wiki/Translate) wiki page.

## Authors

* **Isaac Grynsztein** (me!) - *Initial work*

Official translators:

* Spanish - tzahi12345
* German - UnlimitedCookies
* Chinese - TyRoyal

See also the list of [contributors](https://github.com/Tzahi12345/YoutubeDL-Material/graphs/contributors) who participated in this project.

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details

## Legal Disclaimer

This project is in no way affiliated with Google LLC, Alphabet Inc. or YouTube (or their subsidiaries) nor endorsed by them.

## Acknowledgments

* youtube-dl
* [AllTube](https://github.com/Rudloff/alltube) (for the inspiration)
