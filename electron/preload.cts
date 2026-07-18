const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('schematic', {
  chooseFile: () => ipcRenderer.invoke('choose-file'),
  readFile: (path: string) => ipcRenderer.invoke('read-file', path),
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  onOpenFile: (cb: (path?: string) => void) => {
    ipcRenderer.on('open-file', (_event: unknown, path: string) => cb(path));
    ipcRenderer.on('pick-file', () => cb());
  }
});
