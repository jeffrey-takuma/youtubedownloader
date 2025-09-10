const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ytMusic', {
  downloadAudio: (url) => ipcRenderer.invoke('download-audio', url),
  onProgress: (handler) => {
    const listener = (_e, data) => handler(data);
    ipcRenderer.on('download-progress', listener);
    return () => ipcRenderer.removeListener('download-progress', listener);
  }
});
