import type { DebugLogEntry, ScanCompletePayload, ScanOptions, ScanProgress, ServerStatus } from './types';

type ElectronAPI = NonNullable<typeof window.electronAPI>;

const noop = () => {};

const demoServer: ServerStatus = {
  ip: '192.168.0.42',
  port: 25565,
  online: true,
  version: 'Paper 1.21.1',
  protocol: 767,
  motd: 'Demo server preview',
  motdSegments: [
    { text: 'Demo ', color: '#ff9999' },
    { text: 'server ', color: '#ffffff', bold: true },
    { text: 'preview', color: '#ffcccc' }
  ],
  playersOnline: 3,
  playersMax: 20,
  playerNames: ['Steve', 'Alex', 'BuilderFox'],
  ping: 42,
  lastSeen: Date.now(),
  lastAnnouncementAt: Date.now(),
  source: 'demo'
};

interface ListenerBackedApi extends ElectronAPI {
  __serverFoundListener?: (server: ServerStatus) => void;
  __scanProgressListener?: (progress: ScanProgress) => void;
  __scanCompleteListener?: (payload: ScanCompletePayload) => void;
  __debugLogListener?: (entry: DebugLogEntry) => void;
}

const fallbackApi: ListenerBackedApi = {
  async startScan(_options?: ScanOptions) {
    window.setTimeout(() => {
      fallbackApi.__scanProgressListener?.({
        scanned: 1,
        total: 1,
        percent: 100,
        found: 1,
        active: 0
      });
      fallbackApi.__serverFoundListener?.({ ...demoServer, lastSeen: Date.now() });
      fallbackApi.__scanCompleteListener?.({
        stopped: false,
        total: 1,
        found: 1,
        durationMs: 450
      });
      fallbackApi.__debugLogListener?.({
        timestamp: Date.now(),
        scope: 'ui',
        level: 'info',
        message: 'Browser preview mode active',
        details: 'Real TCP scanning works only in Electron runtime.'
      });
    }, 350);
  },
  async stopScan() {
    fallbackApi.__scanCompleteListener?.({
      stopped: true,
      total: 1,
      found: 1,
      durationMs: 150
    });
  },
  async copyText(value: string) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    }
  },
  async pingServer(ip: string, port = 25565) {
    return { ...demoServer, ip, port, lastSeen: Date.now(), source: 'demo-favorite' };
  },
  onServerFound(callback: (server: ServerStatus) => void) {
    fallbackApi.__serverFoundListener = callback;
    return noop;
  },
  onScanProgress(callback: (progress: ScanProgress) => void) {
    fallbackApi.__scanProgressListener = callback;
    return noop;
  },
  onScanComplete(callback: (payload: ScanCompletePayload) => void) {
    fallbackApi.__scanCompleteListener = callback;
    return noop;
  },
  onDebugLog(callback: (entry: DebugLogEntry) => void) {
    fallbackApi.__debugLogListener = callback;
    return noop;
  }
};

export const isElectronRuntime = Boolean(window.electronAPI);

export const electronApi: ElectronAPI = window.electronAPI ?? fallbackApi;
