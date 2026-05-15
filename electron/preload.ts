import { contextBridge, ipcRenderer } from 'electron';
import { DebugLogEntry, ScanCompletePayload, ScanOptions, ScanProgress, ServerStatus } from '../shared/types';

contextBridge.exposeInMainWorld('electronAPI', {
  startScan: (options?: ScanOptions) => ipcRenderer.invoke('scanner:start', options),
  stopScan: () => ipcRenderer.invoke('scanner:stop'),
  copyText: (value: string) => ipcRenderer.invoke('clipboard:write-text', value),
  pingServer: (ip: string, port?: number, timeoutMs?: number) =>
    ipcRenderer.invoke('server:ping', { ip, port, timeoutMs }),
  onServerFound: (callback: (server: ServerStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: ServerStatus) => callback(payload);
    ipcRenderer.on('scanner:server-found', listener);
    return () => ipcRenderer.removeListener('scanner:server-found', listener);
  },
  onScanProgress: (callback: (progress: ScanProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: ScanProgress) => callback(payload);
    ipcRenderer.on('scanner:progress', listener);
    return () => ipcRenderer.removeListener('scanner:progress', listener);
  },
  onScanComplete: (callback: (payload: ScanCompletePayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: ScanCompletePayload) => callback(payload);
    ipcRenderer.on('scanner:complete', listener);
    return () => ipcRenderer.removeListener('scanner:complete', listener);
  },
  onDebugLog: (callback: (entry: DebugLogEntry) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: DebugLogEntry) => callback(payload);
    ipcRenderer.on('debug:log', listener);
    return () => ipcRenderer.removeListener('debug:log', listener);
  }
});
