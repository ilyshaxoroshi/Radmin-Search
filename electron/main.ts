import path from 'path';
import { app, BrowserWindow, clipboard, ipcMain, nativeImage } from 'electron';
import { LanScanner } from './scanner';
import { pingMinecraftServer } from './minecraft';
import { DebugLogEntry, ScanOptions } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let activeScan: Promise<void> | null = null;

function sendDebug(entry: DebugLogEntry): void {
  mainWindow?.webContents.send('debug:log', entry);
}

function createWindow(): void {
  const appPath = app.getAppPath();
  const iconPath = path.join(appPath, 'electron', 'icon.svg');
  const icon = nativeImage.createFromPath(iconPath);
  const rendererHtmlPath = path.join(appPath, 'dist', 'renderer', 'index.html');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    title: 'LAN Scanner & Player Finder',
    icon,
    backgroundColor: '#120707',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (!app.isPackaged && devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(rendererHtmlPath);
  }
}

const scanner = new LanScanner({
  onServer: (server) => {
    mainWindow?.webContents.send('scanner:server-found', server);
  },
  onProgress: (progress) => {
    mainWindow?.webContents.send('scanner:progress', progress);
  },
  onComplete: (payload) => {
    activeScan = null;
    mainWindow?.webContents.send('scanner:complete', payload);
  },
  onDebug: (entry) => {
    sendDebug(entry);
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('scanner:start', async (_event, options?: ScanOptions) => {
  if (!activeScan) {
    activeScan = scanner.start(options);
  }
  return activeScan;
});

ipcMain.handle('scanner:stop', async () => {
  scanner.stop();
});

ipcMain.handle('clipboard:write-text', async (_event, value: string) => {
  clipboard.writeText(value);
});

ipcMain.handle(
  'server:ping',
  async (_event, payload: { ip: string; port?: number; timeoutMs?: number }) =>
    pingMinecraftServer(payload.ip, payload.port ?? 25565, payload.timeoutMs ?? 4000, 'manual', (entry) => sendDebug(entry))
);
