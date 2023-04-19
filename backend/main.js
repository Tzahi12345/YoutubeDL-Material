const { app, BrowserWindow } = require('electron');
const path = require('path');
const elogger = require('electron-log');
const { spawn } = require('child_process');

let win;
let splashWindow;
let serverProcess;

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true
    }
  })
  splashWindow.loadFile('public/assets/splash.html')
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

function createWindow() {
  elogger.info('Spawning server.')
  serverProcess = spawn('node', [path.join(__dirname, 'app.js')]);
  elogger.info('Done spawning!')
  createMainWindow();
  createSplashWindow();

  // Log the server output to the console
  serverProcess.stdout.on('data', (data) => {
    const data_str = data.toString();
    if (data_str.includes('started on PORT')) {
      loadPage();
    }
    console.log(`Server output: ${data}`);
    elogger.info(data_str);
  });

  // Log any errors to the console
  serverProcess.stderr.on('data', (data) => {
    console.error(`Server error: ${data}`);
    const error = data.toString();
    if (error.includes('EADDRINUSE')) {
      loadPage();
    }
    elogger.error(error);
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    elogger.error(error);
  });
}

app.on('ready', createWindow);

// on macOS, closing the window doesn't quit the app
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
  if (serverProcess) {
    serverProcess.stdin.pause();
    serverProcess.kill();
  }
});

// initialize the app's main window
app.on('activate', () => {
  if (win === null) {
    createWindow();
  }
});