const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const DownloadService = require('./src/services/downloadService');

const downloadService = new DownloadService();

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

ipcMain.handle('download-audio', async (event, url) => {
  const sender = BrowserWindow.fromWebContents(event.sender);
  try {
    return await downloadService.downloadAudio(url, sender);
  } catch (err) {
    let message = err?.message || String(err);
    if (/ENOENT/.test(message) || /not found/i.test(message)) {
      message = 'yt-dlp が見つかりません。ネットワーク接続を確認し、もう一度お試しください。もしくはシステムに yt-dlp をインストールしてください。';
    }
    throw new Error(`ダウンロードに失敗しました: ${message}`);
  }
});
