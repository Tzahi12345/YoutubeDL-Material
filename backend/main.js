const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let win;
let splashWindow;

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

function createWindow() {
  const serverProcess = spawn('node', [path.join(__dirname, 'app.js')]); //, {cwd: 'backend'});

  createMainWindow();
  createSplashWindow();

  // Log the server output to the console
  serverProcess.stdout.on('data', (data) => {
    if (data.toString().includes('started on PORT')) {
      splashWindow.close()
      // load the dist folder from Angular
      win.loadURL('http://localhost:17442')
      win.show()
    }
    console.log(`Server output: ${data}`);
  });

  // Log any errors to the console
  serverProcess.stderr.on('data', (data) => {
    console.error(`Server error: ${data}`);
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
  });
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