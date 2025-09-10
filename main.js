const { app, BrowserWindow } = require('electron');
const { createWindow } = require('./src/main/window');
const { registerDownloadHandlers } = require('./src/main/downloadService');

app.whenReady().then(() => {
  createWindow();
  registerDownloadHandlers();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
