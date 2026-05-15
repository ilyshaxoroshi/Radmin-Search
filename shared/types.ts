export interface PlayerSample {
  name: string;
  id?: string;
}

export interface MotdSegment {
  text: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underlined?: boolean;
  strikethrough?: boolean;
  obfuscated?: boolean;
}

export interface ServerStatus {
  ip: string;
  port: number;
  online: boolean;
  version: string;
  protocol: number | null;
  motd: string;
  motdSegments: MotdSegment[];
  playersOnline: number;
  playersMax: number;
  playerNames: string[];
  favicon?: string;
  ping: number | null;
  lastSeen: number;
  lastAnnouncementAt: number;
  announcedMotd?: string;
  source: string;
  error?: string;
}

export interface FavoriteServer {
  ip: string;
  port: number;
  addedAt: number;
}

export interface ScanProgress {
  scanned: number;
  total: number;
  percent: number;
  found: number;
  active: number;
}

export interface ScanCompletePayload {
  stopped: boolean;
  total: number;
  found: number;
  durationMs: number;
}

export interface ScanOptions {
  timeoutMs?: number;
}

export interface DebugLogEntry {
  timestamp: number;
  scope: 'listener' | 'ping' | 'ui';
  level: 'info' | 'warn' | 'error';
  message: string;
  details?: string;
}
