import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { DOWNLOAD_AUDIO, DOWNLOAD_PROGRESS } from './common/ipcChannels';

contextBridge.exposeInMainWorld('ytMusic', {
  downloadAudio: (url: string) => ipcRenderer.invoke(DOWNLOAD_AUDIO, url),
  onProgress: (handler: (data: any) => void) => {
    const listener = (_e: IpcRendererEvent, data: any) => handler(data);
    ipcRenderer.on(DOWNLOAD_PROGRESS, listener);
    return () => ipcRenderer.removeListener(DOWNLOAD_PROGRESS, listener);
  }
});
