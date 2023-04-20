const { app, BrowserWindow } = require('electron');
const path = require('path');
const elogger = require('electron-log');
const server = require('./app');

let win;
let splashWindow;

async function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true
    }
  })
  await splashWindow.loadFile('public/assets/splash.html')
  splashWindow.on('closed', () => {
    splashWindow = null
  })
}

function createMainWindow() {
  win = new BrowserWindow(
    {
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      },
      icon: path.join(__dirname, 'favicon.ico'),
      show: false
    });

  // The following is optional and will open the DevTools:
  // win.webContents.openDevTools()

  win.on('closed', () => {
    win = null;
  });
}

function loadPage() {
    splashWindow.close()
    // load the dist folder from Angular
    win.loadURL('http://localhost:17442')
    win.show()
}

async function createWindow() {
  await createSplashWindow();
  elogger.info('Spawning server.')
  // serverProcess = spawn('node', [path.join(__dirname, 'app.js')]);
  await server.startServer();
  elogger.info('Done spawning!')
  createMainWindow();
  loadPage();
}

app.on('ready', createWindow);

// on macOS, closing the window doesn't quit the app
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// initialize the app's main window
app.on('activate', () => {
  if (win === null) {
    createWindow();
  }
});