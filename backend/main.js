const { app, BrowserWindow } = require('electron');
const path = require('path');
const url = require('url');
const { spawn } = require('child_process');

let win;

function createWindow() {
  win = new BrowserWindow(
    {
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: true
      }
    });

  // load the dist folder from Angular
  win.loadURL('http://localhost:17442')

  // The following is optional and will open the DevTools:
  // win.webContents.openDevTools()

  win.on('closed', () => {
    win = null;
  });

  const serverProcess = spawn('node', ['app.js']); //, {cwd: 'backend'});

  // Log the server output to the console
  serverProcess.stdout.on('data', (data) => {
    console.log(`Server output: ${data}`);
  });

  // Log any errors to the console
  serverProcess.stderr.on('data', (data) => {
    console.error(`Server error: ${data}`);
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