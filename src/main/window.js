const { BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 640,
    webPreferences: {
      preload: path.join(process.cwd(), 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.loadFile('renderer/index.html');
}

module.exports = { createWindow };
