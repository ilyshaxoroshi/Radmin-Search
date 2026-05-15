import type { DebugLogEntry, ScanCompletePayload, ScanOptions, ScanProgress, ServerStatus } from './types';

declare global {
  interface Window {
    electronAPI: {
      startScan: (options?: ScanOptions) => Promise<void>;
      stopScan: () => Promise<void>;
      copyText: (value: string) => Promise<void>;
      pingServer: (ip: string, port?: number, timeoutMs?: number) => Promise<ServerStatus>;
      onServerFound: (callback: (server: ServerStatus) => void) => () => void;
      onScanProgress: (callback: (progress: ScanProgress) => void) => () => void;
      onScanComplete: (callback: (payload: ScanCompletePayload) => void) => () => void;
      onDebugLog: (callback: (entry: DebugLogEntry) => void) => () => void;
    };
  }
}

export {};
