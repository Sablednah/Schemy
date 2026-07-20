import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import { gunzipSync } from 'node:zlib';
import { readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// main.js is emitted to <app>/dist-electron/electron/main.js.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const supportedFile = /\.(schematic|schem|nbt|litematic)$/i;
const thumbnailFlag = process.argv.indexOf('--render-thumbnail');
const thumbnailPipeFlag = process.argv.indexOf('--render-thumbnail-pipe');
const thumbnailPipeName = thumbnailPipeFlag >= 0 ? process.argv[thumbnailPipeFlag + 1] : undefined;
const thumbnailSizeFlag = process.argv.indexOf('--thumbnail-size');
const thumbnailSize = Math.min(1024, Math.max(128, Number(process.argv[thumbnailSizeFlag + 1]) || 512));
const thumbnailRequest = thumbnailPipeName
  ? { input: 'thumbnail://input', output: undefined, pipe: thumbnailPipeName }
  : thumbnailFlag >= 0
    ? { input: process.argv[thumbnailFlag + 1], output: process.argv[thumbnailFlag + 2], pipe: undefined }
    : undefined;

let window: BrowserWindow | null = null;
let pendingFile: string | undefined;
let pipedThumbnailInput: Buffer | undefined;

function fileFromArgs(args: string[]) {
  return args.find(argument => supportedFile.test(argument));
}

function sendFile(file?: string) {
  if (file && window) window.webContents.send('open-file', file);
  else if (file) pendingFile = file;
}

function registerFileIpc() {
  ipcMain.handle('choose-file', async () => (await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Minecraft Structures', extensions: ['schematic', 'schem', 'nbt', 'litematic'] }],
  })).filePaths[0]);
  ipcMain.handle('read-file', async (_event, file: string) => {
    const input = file === 'thumbnail://input'
      ? pipedThumbnailInput ?? Buffer.alloc(0)
      : await readFile(file);
    const data = input[0] === 0x1f && input[1] === 0x8b ? gunzipSync(input) : input;
    return { name: file === 'thumbnail://input' ? 'Structure preview' : path.basename(file), data };
  });
}

async function receivePipeInput(pipeName: string) {
  const socket = net.createConnection(pipeName);
  const input = await new Promise<Buffer>((resolve, reject) => {
    let buffered = Buffer.alloc(0);
    let expected: number | undefined;
    const fail = (error: Error) => { socket.destroy(); reject(error); };
    socket.once('error', fail);
    socket.on('data', chunk => {
      buffered = Buffer.concat([buffered, chunk]);
      if (expected === undefined && buffered.length >= 8) {
        const length = buffered.readBigUInt64LE(0);
        if (length > 512n * 1024n * 1024n) {
          fail(new Error('Structure is too large to preview'));
          return;
        }
        expected = Number(length);
        buffered = buffered.subarray(8);
      }
      if (expected !== undefined && buffered.length >= expected) {
        socket.removeListener('error', fail);
        socket.pause();
        resolve(buffered.subarray(0, expected));
      }
    });
  });
  return { socket, input };
}

async function sendPipeOutput(socket: net.Socket, png: Buffer) {
  const header = Buffer.alloc(8);
  header.writeBigUInt64LE(BigInt(png.length));
  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject);
    socket.once('data', acknowledgement => {
      if (acknowledgement[0] !== 1) reject(new Error('Thumbnail receiver rejected the image'));
      else resolve();
    });
    socket.write(header);
    socket.write(png);
    socket.resume();
  });
  socket.end();
}

function windowOptions(memoryOnly = false): Electron.BrowserWindowConstructorOptions {
  return {
    backgroundColor: '#101410',
    icon: path.join(root, app.isPackaged ? 'dist/schemy-icon.png' : 'public/schemy-icon.png'),
    webPreferences: {
      preload: path.join(root, 'dist-electron/electron/preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      partition: memoryOnly ? 'schemy-thumbnail' : undefined,
    },
  };
}

async function loadApp(target: BrowserWindow, thumbnail = false) {
  if (process.env.VITE_DEV_SERVER_URL) {
    const url = new URL(process.env.VITE_DEV_SERVER_URL);
    if (thumbnail) url.searchParams.set('thumbnail', '1');
    await target.loadURL(url.toString());
  } else if (!app.isPackaged) {
    await target.loadURL(`http://localhost:5173${thumbnail ? '?thumbnail=1' : ''}`);
  } else {
    await target.loadFile(path.join(root, 'dist/index.html'), thumbnail ? { query: { thumbnail: '1' } } : undefined);
  }
}

async function createWindow() {
  window = new BrowserWindow({
    ...windowOptions(),
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    titleBarStyle: 'hiddenInset',
  });
  window.webContents.on('did-fail-load', (_event, code, description, url) => {
    dialog.showErrorBox('Schemy could not start', `${description} (${code})\n\n${url}`);
  });
  window.webContents.once('did-finish-load', () => {
    sendFile(pendingFile ?? fileFromArgs(process.argv.slice(1)));
    pendingFile = undefined;
  });
  await loadApp(window);
}

async function renderThumbnail(input: string, output?: string) {
  if (!input || (input !== 'thumbnail://input' && !supportedFile.test(input)) || (!output && !thumbnailPipeName)) {
    throw new Error('Usage: Schemy --render-thumbnail <structure-file> <output.png>');
  }

  const thumbnailWindow = new BrowserWindow({
    ...windowOptions(true),
    width: thumbnailSize,
    height: thumbnailSize,
    useContentSize: true,
    show: false,
    resizable: false,
    paintWhenInitiallyHidden: true,
  });

  let renderedPng: Buffer | undefined;
  await new Promise<void>(async (resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Thumbnail rendering timed out')), 20_000);
    const fail = (error: Error) => {
      clearTimeout(timeout);
      reject(error);
    };

    thumbnailWindow.webContents.once('did-fail-load', (_event, code, description) => {
      fail(new Error(`${description} (${code})`));
    });
    ipcMain.once('thumbnail-ready', async (_event, renderError?: string) => {
      if (renderError) {
        fail(new Error(renderError));
        return;
      }
      try {
        const image = await thumbnailWindow.webContents.capturePage();
        renderedPng = image.toPNG();
        clearTimeout(timeout);
        resolve();
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    });

    try {
      await loadApp(thumbnailWindow, true);
      thumbnailWindow.webContents.send('open-file', input);
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
    }
  });

  if (!renderedPng) throw new Error('Thumbnail renderer returned no image');
  return renderedPng;
}

if (thumbnailRequest) {
  app.whenReady().then(async () => {
    let pipeSocket: net.Socket | undefined;
    try {
      if (thumbnailRequest.pipe) {
        const piped = await receivePipeInput(thumbnailRequest.pipe);
        pipeSocket = piped.socket;
        pipedThumbnailInput = piped.input;
      }
      registerFileIpc();
      const png = await renderThumbnail(thumbnailRequest.input, thumbnailRequest.output);
      if (thumbnailRequest.output) await writeFile(thumbnailRequest.output, png);
      else if (pipeSocket) await sendPipeOutput(pipeSocket, png);
      app.exit(0);
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
  });
} else {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) app.quit();
  else {
    app.on('second-instance', (_event, argv) => {
      sendFile(fileFromArgs(argv));
      window?.show();
      window?.focus();
    });
    app.on('open-file', (event, file) => {
      event.preventDefault();
      sendFile(file);
    });
    app.whenReady().then(() => {
      registerFileIpc();
      ipcMain.on('texture-state', (_event, enabled: boolean) => {
        const item = Menu.getApplicationMenu()?.getMenuItemById('texture-mode');
        if (item) item.checked = enabled;
      });
      Menu.setApplicationMenu(Menu.buildFromTemplate([
        { label: 'File', submenu: [{ label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => window?.webContents.send('pick-file') }, { role: 'quit' }] },
        { label: 'View', submenu: [{ id: 'texture-mode', label: 'Generated textures', type: 'checkbox', accelerator: 'CmdOrCtrl+T', click: item => window?.webContents.send('texture-mode', item.checked) }, { type: 'separator' }, { role: 'reload' }, { role: 'togglefullscreen' }] },
      ]));
      createWindow();
      app.on('activate', () => {
        if (!BrowserWindow.getAllWindows().length) createWindow();
      });
    });
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit();
    });
  }
}
