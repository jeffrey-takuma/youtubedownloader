const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const downloadService = require('./downloadService');

const createWindow = () => {
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
};

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('download-audio', downloadService.downloadAudio);

