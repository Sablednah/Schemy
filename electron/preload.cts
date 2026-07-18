const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('schematic', {
  chooseFile: () => ipcRenderer.invoke('choose-file'),
  readFile: (path: string) => ipcRenderer.invoke('read-file', path),
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  setTextureState: (enabled:boolean) => ipcRenderer.send('texture-state',enabled),
  onTextureMode: (cb:(enabled:boolean)=>void) => ipcRenderer.on('texture-mode',(_event:unknown,enabled:boolean)=>cb(enabled)),
  onOpenFile: (cb: (path?: string) => void) => {
    ipcRenderer.on('open-file', (_event: unknown, path: string) => cb(path));
    ipcRenderer.on('pick-file', () => cb());
  }
});
