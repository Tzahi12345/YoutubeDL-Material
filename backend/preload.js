const { contextBridge } = require('electron');
const path = require('path');

// Expose the 'path' module to the renderer process
contextBridge.exposeInMainWorld('path', path);