import dgram from 'dgram';
import os from 'os';
import { DebugLogEntry, ScanCompletePayload, ScanOptions, ScanProgress, ServerStatus } from '../shared/types';
import { pingMinecraftServer } from './minecraft';

interface ScanCallbacks {
  onServer: (server: ServerStatus) => void;
  onProgress: (progress: ScanProgress) => void;
  onComplete: (payload: ScanCompletePayload) => void;
  onDebug: (entry: DebugLogEntry) => void;
}

const MULTICAST_ADDRESS = '224.0.2.60';
const MULTICAST_PORT = 4445;
const DEFAULT_TIMEOUT_MS = 5000;
const RECHECK_INTERVAL_MS = 4_000;

function emitDebug(callbacks: ScanCallbacks, entry: Omit<DebugLogEntry, 'timestamp'>): void {
  callbacks.onDebug({
    timestamp: Date.now(),
    ...entry
  });
}

function isPrivateOrRadmin(ip: string): boolean {
  return (
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip) ||
    ip.startsWith('26.')
  );
}

function parseLanAnnouncement(message: string): { motd: string; port: number } | null {
  const match = message.match(/\[MOTD](.*?)\[\/MOTD]\[AD](\d+)\[\/AD]/s);
  if (!match) {
    return null;
  }

  const port = Number(match[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }

  return {
    motd: match[1],
    port
  };
}

function getServerKey(ip: string, port: number): string {
  return `${ip}:${port}`;
}

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function serverEquals(left: ServerStatus, right: ServerStatus): boolean {
  return (
    left.ip === right.ip &&
    left.port === right.port &&
    left.online === right.online &&
    left.version === right.version &&
    left.protocol === right.protocol &&
    left.motd === right.motd &&
    left.playersOnline === right.playersOnline &&
    left.playersMax === right.playersMax &&
    left.favicon === right.favicon &&
    left.ping === right.ping &&
    left.source === right.source &&
    left.error === right.error &&
    left.announcedMotd === right.announcedMotd &&
    arraysEqual(left.playerNames, right.playerNames)
  );
}

function collectInterfaceAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses = new Set<string>();

  Object.values(interfaces).forEach((entries) => {
    entries?.forEach((entry) => {
      if (entry.family !== 'IPv4' || entry.internal) {
        return;
      }
      if (isPrivateOrRadmin(entry.address)) {
        addresses.add(entry.address);
      }
    });
  });

  return Array.from(addresses);
}

export class LanScanner {
  private running = false;

  private stopRequested = false;

  private readonly callbacks: ScanCallbacks;

  private socket: dgram.Socket | null = null;

  private startedAt = 0;

  private announcementsReceived = 0;

  private discoveredServers = new Map<string, ServerStatus>();

  private pendingPings = new Set<string>();

  private lastPingAt = new Map<string, number>();

  constructor(callbacks: ScanCallbacks) {
    this.callbacks = callbacks;
  }

  public async start(options?: ScanOptions): Promise<void> {
    if (this.running) {
      emitDebug(this.callbacks, {
        scope: 'listener',
        level: 'warn',
        message: 'Прослушивание уже запущено'
      });
      return;
    }

    this.running = true;
    this.stopRequested = false;
    this.startedAt = Date.now();
    this.announcementsReceived = 0;
    this.pendingPings.clear();
    this.lastPingAt.clear();
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    emitDebug(this.callbacks, {
      scope: 'listener',
      level: 'info',
      message: `Старт UDP multicast listener ${MULTICAST_ADDRESS}:${MULTICAST_PORT}`,
      details: `TCP status timeout ${timeoutMs} ms`
    });

    await new Promise<void>((resolve, reject) => {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      this.socket = socket;

      const finalize = (error?: Error) => {
        if (!this.running) {
          return;
        }

        this.running = false;
        this.socket = null;

        const payload: ScanCompletePayload = {
          stopped: this.stopRequested || Boolean(error),
          total: this.announcementsReceived,
          found: this.discoveredServers.size,
          durationMs: Date.now() - this.startedAt
        };

        if (error) {
          emitDebug(this.callbacks, {
            scope: 'listener',
            level: 'error',
            message: 'UDP listener stopped with error',
            details: error.message
          });
        } else {
          emitDebug(this.callbacks, {
            scope: 'listener',
            level: 'info',
            message: 'Прослушивание остановлено',
            details: `Announcements: ${this.announcementsReceived}, servers: ${this.discoveredServers.size}`
          });
        }

        this.callbacks.onProgress({
          scanned: this.announcementsReceived,
          total: this.announcementsReceived,
          percent: 100,
          found: this.discoveredServers.size,
          active: 0
        });
        this.callbacks.onComplete(payload);

        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      socket.on('error', (error) => {
        try {
          socket.close();
        } catch {
          // no-op
        }
        finalize(error);
      });

      socket.on('message', (buffer, remoteInfo) => {
        const payload = buffer.toString('utf8');
        const remoteIp = remoteInfo.address;

        emitDebug(this.callbacks, {
          scope: 'listener',
          level: 'info',
          message: `Получен multicast от ${remoteIp}`,
          details: payload
        });

        const parsed = parseLanAnnouncement(payload);
        if (!parsed) {
          emitDebug(this.callbacks, {
            scope: 'listener',
            level: 'warn',
            message: `Некорректный multicast packet от ${remoteIp}`,
            details: payload
          });
          return;
        }

        this.announcementsReceived += 1;
        const serverKey = getServerKey(remoteIp, parsed.port);
        const now = Date.now();
        const existing = this.discoveredServers.get(serverKey);

        if (existing) {
          existing.lastAnnouncementAt = now;
          existing.announcedMotd = parsed.motd;
          this.discoveredServers.set(serverKey, existing);
        }

        this.callbacks.onProgress({
          scanned: this.announcementsReceived,
          total: this.announcementsReceived,
          percent: 100,
          found: this.discoveredServers.size,
          active: 1
        });

        const lastPingTime = this.lastPingAt.get(serverKey) ?? 0;
        if (this.pendingPings.has(serverKey) || now - lastPingTime < RECHECK_INTERVAL_MS) {
          return;
        }

        this.pendingPings.add(serverKey);
        this.lastPingAt.set(serverKey, now);

        void pingMinecraftServer(
          remoteIp,
          parsed.port,
          timeoutMs,
          'lan-multicast',
          (entry) => this.callbacks.onDebug(entry)
        )
          .then((server) => {
            const previous = this.discoveredServers.get(serverKey);
            const merged: ServerStatus = {
              ...server,
              lastAnnouncementAt: previous?.lastAnnouncementAt ?? now,
              announcedMotd: parsed.motd
            };

            if (previous && serverEquals(previous, merged) && previous.lastAnnouncementAt === merged.lastAnnouncementAt) {
              return;
            }

            this.discoveredServers.set(serverKey, merged);
            this.callbacks.onServer(merged);
            this.callbacks.onProgress({
              scanned: this.announcementsReceived,
              total: this.announcementsReceived,
              percent: 100,
              found: this.discoveredServers.size,
              active: 1
            });
          })
          .catch((error) => {
            emitDebug(this.callbacks, {
              scope: 'listener',
              level: 'warn',
              message: `Status ping failed for ${serverKey}`,
              details: error instanceof Error ? error.message : String(error)
            });
          })
          .finally(() => {
            this.pendingPings.delete(serverKey);
          });
      });

      socket.bind(MULTICAST_PORT, '0.0.0.0', () => {
        try {
          socket.setBroadcast(true);
          socket.setMulticastLoopback(true);

          const addresses = collectInterfaceAddresses();
          if (!addresses.length) {
            emitDebug(this.callbacks, {
              scope: 'listener',
              level: 'warn',
              message: 'Не найдено подходящих IPv4 интерфейсов для multicast'
            });
          }

          addresses.forEach((address) => {
            try {
              socket.addMembership(MULTICAST_ADDRESS, address);
              emitDebug(this.callbacks, {
                scope: 'listener',
                level: 'info',
                message: `Подписка на multicast через ${address}`
              });
            } catch (error) {
              emitDebug(this.callbacks, {
                scope: 'listener',
                level: 'warn',
                message: `Не удалось подписаться через ${address}`,
                details: error instanceof Error ? error.message : String(error)
              });
            }
          });

          this.callbacks.onProgress({
            scanned: 0,
            total: 0,
            percent: 100,
            found: this.discoveredServers.size,
            active: 1
          });
        } catch (error) {
          try {
            socket.close();
          } catch {
            // no-op
          }
          finalize(error instanceof Error ? error : new Error('Failed to initialize multicast listener'));
        }
      });

      socket.on('close', () => {
        if (this.stopRequested) {
          finalize();
        }
      });
    });
  }

  public stop(): void {
    this.stopRequested = true;
    emitDebug(this.callbacks, {
      scope: 'listener',
      level: 'warn',
      message: 'Остановка прослушивания запрошена пользователем'
    });
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // no-op
      }
    }
  }
}
