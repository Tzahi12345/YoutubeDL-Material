# YoutubeDL-Material

YoutubeDL-Material is a material design frontend for [youtube-dl](https://rg3.github.io/youtube-dl/). It's coded using [Angular 8](https://angular.io/) for the frontend, and [Nodejs](https://nodejs.org/) on the backend.

## Getting Started

Check out the prerequisites, and go to the installation section. Easy as pie!

Here's an image of what it'll look like once you're done:

![frontpage](https://i.imgur.com/rOxWIys.png)

With optional file management enabled (default):

![frontpage_with_files](https://i.imgur.com/UTUROLl.png)

Dark mode:

![dark_mode](https://i.imgur.com/9TMkHF6.png?1)

### Prerequisites

You need to have a functioning web server for this to work. Also make sure you have these dependencies installed on your system: ffmpeg, nodejs, python. If you don't, run this command:

```
sudo apt-get install ffmpeg nodejs python
```

### Installing

First, download the [latest release](https://github.com/Tzahi12345/YoutubeDL-Material/releases/latest)!

Drag all the files in `youtubedl-material` to a location accessible to a web server. It works best if it's the root (usually right inside `public_html`. Once that's done, navigate to `backend` and edit the `default.json` file. If you're using SSL encryption, look at the `encrypted.json` file for a template. 

Port forward `17442` if you're going to access YoutubeDL-Material from out of your network. This is an important step. Make sure the configuration reflects this appropriately.

Once the configuration is done, type `sudo nodejs app.js`. This will run the backend server. On your browser, navigate to your installation folder. Try putting in a youtube link to see if it works. If it does, viola! YoutubeDL-Material is now up and running.

If you experience problems, know that it's usually caused by a configuration problem. The first thing you should do is check the console. To get there, right click anywhere on the page and click "Inspect element." Then on the menu that pops up, click console. Look at the error there, and try to investigate.

## Deployment

If you'd like to install YoutubeDL-Material, go to the Installation section. If you want to build it yourself and/or develop the repository, then this section is for you.

To deploy, simply clone the repository, and go into the `youtubedl-material` directory. Type `npm install` and all the dependencies will install. Then type `cd backend` and again type `npm install` to install the dependencies for the backend.

Once you do that, you're almost up and running. All you need to do is edit the configuration in `youtubedl-material/backend/config`, go back into the `youtubedl-material` directory, and type `ng build --prod`. This will build the app, and put the output files in the `youtubedl-material/dist` folder. Drag those files into a web server, and drag the `backend` directory into the same folder. This folder should have `index.html` in it as well. If it does **not**, you're in the wrong directory.

The frontend is now complete. The backend is much easier. Just go into the `youtubedl-material/backend` folder, and type `sudo nodejs app.js`.

Finally, port forward the port `17442` and point it to the server's IP address. Make sure the port is also allowed through the firewall.

## Contributing

Feel free to submit a pull request! I have no guidelines as of yet, so no need to worry about that.

## Authors

* **Isaac Grynsztein** (me!) - *Initial work*

See also the list of [contributors](https://github.com/your/project/contributors) who participated in this project.

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details

## Acknowledgments

* youtube-dl
* [AllTube](https://github.com/Rudloff/alltube) (for the inspiration)
