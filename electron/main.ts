import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import { gunzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// main.js is emitted to <app>/dist-electron/electron/main.js.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let window: BrowserWindow | null = null;
let pendingFile: string | undefined;

function fileFromArgs(args: string[]) { return args.find(a => a.toLowerCase().endsWith('.schematic')); }
function sendFile(file?: string) { if (file && window) window.webContents.send('open-file', file); else if (file) pendingFile = file; }

async function createWindow() {
  window = new BrowserWindow({ width: 1200, height: 800, minWidth: 720, minHeight: 480, backgroundColor: '#101410', titleBarStyle: 'hiddenInset', webPreferences: { preload: path.join(root, 'dist-electron/electron/preload.cjs'), contextIsolation: true, sandbox: true } });
  window.webContents.on('did-fail-load', (_event, code, description, url) => {
    dialog.showErrorBox('Schemy could not start', `${description} (${code})\n\n${url}`);
  });
  // Register before loading: loadURL/loadFile resolve after did-finish-load.
  window.webContents.once('did-finish-load', () => { sendFile(pendingFile ?? fileFromArgs(process.argv.slice(1))); pendingFile = undefined; });
  if (process.env.VITE_DEV_SERVER_URL) await window.loadURL(process.env.VITE_DEV_SERVER_URL);
  else if (!app.isPackaged) await window.loadURL('http://localhost:5173');
  else await window.loadFile(path.join(root, 'dist/index.html'));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on('second-instance', (_e, argv) => { sendFile(fileFromArgs(argv)); window?.show(); window?.focus(); });
  app.on('open-file', (e, file) => { e.preventDefault(); sendFile(file); });
  app.whenReady().then(() => {
    ipcMain.handle('choose-file', async () => (await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Minecraft Schematic', extensions: ['schematic'] }] })).filePaths[0]);
    ipcMain.handle('read-file', async (_e, file: string) => {
      const input = await readFile(file); const data = input[0] === 0x1f && input[1] === 0x8b ? gunzipSync(input) : input;
      return { name: path.basename(file), data };
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'File', submenu: [{ label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => window?.webContents.send('pick-file') }, { role: 'quit' }] }, { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }] }]));
    createWindow(); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
