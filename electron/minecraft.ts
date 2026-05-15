import net from 'net';
import { DebugLogEntry, MotdSegment, ServerStatus } from '../shared/types';

const DEFAULT_PORT = 25565;
const STATUS_PROTOCOL = 47;

type DebugLogger = (entry: DebugLogEntry) => void;

const COLOR_MAP: Record<string, string> = {
  black: '#000000',
  dark_blue: '#0000aa',
  dark_green: '#00aa00',
  dark_aqua: '#00aaaa',
  dark_red: '#aa0000',
  dark_purple: '#aa00aa',
  gold: '#ffaa00',
  gray: '#aaaaaa',
  dark_gray: '#555555',
  blue: '#5555ff',
  green: '#55ff55',
  aqua: '#55ffff',
  red: '#ff5555',
  light_purple: '#ff55ff',
  yellow: '#ffff55',
  white: '#ffffff'
};

interface JsonComponent {
  text?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underlined?: boolean;
  strikethrough?: boolean;
  obfuscated?: boolean;
  extra?: JsonComponent[];
  translate?: string;
  with?: JsonComponent[];
}

const LEGACY_COLOR_MAP: Record<string, string | undefined> = {
  '0': '#000000',
  '1': '#0000aa',
  '2': '#00aa00',
  '3': '#00aaaa',
  '4': '#aa0000',
  '5': '#aa00aa',
  '6': '#ffaa00',
  '7': '#aaaaaa',
  '8': '#555555',
  '9': '#5555ff',
  a: '#55ff55',
  b: '#55ffff',
  c: '#ff5555',
  d: '#ff55ff',
  e: '#ffff55',
  f: '#ffffff'
};

function emitDebug(debug: DebugLogger | undefined, entry: Omit<DebugLogEntry, 'timestamp'>): void {
  debug?.({
    timestamp: Date.now(),
    ...entry
  });
}

function writeVarInt(value: number): Buffer {
  const bytes: number[] = [];
  let current = value >>> 0;

  while (true) {
    if ((current & ~0x7f) === 0) {
      bytes.push(current);
      break;
    }

    bytes.push((current & 0x7f) | 0x80);
    current >>>= 7;
  }

  return Buffer.from(bytes);
}

function tryReadVarInt(buffer: Buffer, offset: number): { value: number; size: number } | null {
  let numRead = 0;
  let result = 0;

  while (true) {
    if (offset + numRead >= buffer.length) {
      return null;
    }

    const read = buffer[offset + numRead];
    const value = read & 0x7f;
    result |= value << (7 * numRead);
    numRead += 1;

    if (numRead > 5) {
      throw new Error('VarInt is too big');
    }

    if ((read & 0x80) === 0) {
      return { value: result, size: numRead };
    }
  }
}

function readPacket(buffer: Buffer): { payload: Buffer; rest: Buffer } | null {
  const packetLength = tryReadVarInt(buffer, 0);
  if (!packetLength) {
    return null;
  }

  const totalLength = packetLength.size + packetLength.value;
  if (buffer.length < totalLength) {
    return null;
  }

  return {
    payload: buffer.subarray(packetLength.size, totalLength),
    rest: buffer.subarray(totalLength)
  };
}

function buildHandshake(host: string, port: number): Buffer {
  const hostBuffer = Buffer.from(host, 'utf8');
  const packetId = writeVarInt(0x00);
  const protocolVersion = writeVarInt(STATUS_PROTOCOL);
  const hostLength = writeVarInt(hostBuffer.length);
  const portBuffer = Buffer.alloc(2);
  portBuffer.writeUInt16BE(port, 0);
  const nextState = writeVarInt(0x01);
  const payload = Buffer.concat([packetId, protocolVersion, hostLength, hostBuffer, portBuffer, nextState]);
  return Buffer.concat([writeVarInt(payload.length), payload]);
}

function buildStatusRequest(): Buffer {
  const payload = Buffer.from([0x00]);
  return Buffer.concat([writeVarInt(payload.length), payload]);
}

function buildPingRequest(timestamp: bigint): Buffer {
  const packetId = Buffer.from([0x01]);
  const payload = Buffer.alloc(8);
  payload.writeBigInt64BE(timestamp, 0);
  const body = Buffer.concat([packetId, payload]);
  return Buffer.concat([writeVarInt(body.length), body]);
}

function flattenJsonMotd(component: JsonComponent | string | undefined): MotdSegment[] {
  if (!component) {
    return [];
  }

  if (typeof component === 'string') {
    return parseLegacyMotd(component);
  }

  const segments: MotdSegment[] = [];
  const text = component.text ?? component.translate ?? '';

  if (text) {
    segments.push({
      text,
      color: component.color ? COLOR_MAP[component.color] ?? component.color : undefined,
      bold: component.bold,
      italic: component.italic,
      underlined: component.underlined,
      strikethrough: component.strikethrough,
      obfuscated: component.obfuscated
    });
  }

  component.with?.forEach((child) => {
    segments.push(...flattenJsonMotd(child));
  });

  component.extra?.forEach((child) => {
    segments.push(...flattenJsonMotd(child));
  });

  return segments;
}

function parseLegacyMotd(text: string): MotdSegment[] {
  const segments: MotdSegment[] = [];
  let current: MotdSegment = { text: '', color: '#ffffff' };

  const pushCurrent = () => {
    if (current.text) {
      segments.push({ ...current });
      current.text = '';
    }
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '§' && index + 1 < text.length) {
      pushCurrent();
      const code = text[index + 1].toLowerCase();
      index += 1;

      if (LEGACY_COLOR_MAP[code]) {
        current = { text: '', color: LEGACY_COLOR_MAP[code] };
        continue;
      }

      if (code === 'l') {
        current = { ...current, bold: true, text: '' };
        continue;
      }

      if (code === 'o') {
        current = { ...current, italic: true, text: '' };
        continue;
      }

      if (code === 'n') {
        current = { ...current, underlined: true, text: '' };
        continue;
      }

      if (code === 'm') {
        current = { ...current, strikethrough: true, text: '' };
        continue;
      }

      if (code === 'k') {
        current = { ...current, obfuscated: true, text: '' };
        continue;
      }

      if (code === 'r') {
        current = { text: '', color: '#ffffff' };
      }

      continue;
    }

    current.text += char;
  }

  pushCurrent();
  return segments.length ? segments : [{ text, color: '#ffffff' }];
}

function stripSegments(segments: MotdSegment[]): string {
  return segments.map((segment) => segment.text).join('');
}

function parseStatusResponse(raw: string, ip: string, port: number, ping: number, source: string): ServerStatus {
  let parsed: unknown;
  let parseFailed = false;

  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
    parseFailed = true;
  }

  const serverObject = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  const description = serverObject.description;
  const motdSegments = flattenJsonMotd(
    description !== null && (typeof description === 'string' || typeof description === 'object')
      ? description
      : undefined
  );
  const normalizedMotd = stripSegments(motdSegments) || 'Сервер ответил некорректно';

  const playersSample = Array.isArray((serverObject.players as Record<string, unknown> | undefined)?.sample)
    ? ((serverObject.players as Record<string, unknown>).sample as unknown[])
    : [];

  const playerNames = playersSample
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
    .map((item) => item.name)
    .filter((name): name is string => typeof name === 'string');

  const playersOnline = typeof (serverObject.players as Record<string, unknown> | undefined)?.online === 'number'
    ? ((serverObject.players as Record<string, unknown>)!.online as number)
    : playerNames.length;

  const playersMax = typeof (serverObject.players as Record<string, unknown> | undefined)?.max === 'number'
    ? ((serverObject.players as Record<string, unknown>)!.max as number)
    : 0;

  const versionName = typeof (serverObject.version as Record<string, unknown> | undefined)?.name === 'string'
    ? ((serverObject.version as Record<string, unknown>)!.name as string)
    : 'Unknown';

  const protocol = typeof (serverObject.version as Record<string, unknown> | undefined)?.protocol === 'number'
    ? ((serverObject.version as Record<string, unknown>)!.protocol as number)
    : null;

  return {
    ip,
    port,
    online: !parseFailed,
    version: versionName,
    protocol,
    motd: normalizedMotd,
    motdSegments: motdSegments.length ? motdSegments : [{ text: normalizedMotd, color: '#ff9999' }],
    playersOnline,
    playersMax,
    playerNames,
    favicon: typeof serverObject.favicon === 'string' ? serverObject.favicon : undefined,
    ping,
    lastSeen: Date.now(),
    lastAnnouncementAt: Date.now(),
    source,
    error: parseFailed ? 'Invalid JSON status response' : undefined
  };
}

export async function pingMinecraftServer(
  ip: string,
  port = DEFAULT_PORT,
  timeoutMs = 4000,
  source = 'scan',
  debug?: DebugLogger
): Promise<ServerStatus> {
  return new Promise<ServerStatus>((resolve, reject) => {
    const socket = new net.Socket();
    const startedAt = Date.now();
    let stage: 'status' | 'ping' = 'status';
    let statusJson: string | null = null;
    let settled = false;
    let incoming: Buffer<ArrayBufferLike> = Buffer.alloc(0);

    const finalize = (error?: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();

      if (error) {
        emitDebug(debug, {
          scope: 'ping',
          level: 'warn',
          message: `Ping failed for ${ip}:${port}`,
          details: error.message
        });
        reject(error);
        return;
      }

      if (!statusJson) {
        const missingResponseError = new Error('Server returned an empty status response');
        emitDebug(debug, {
          scope: 'ping',
          level: 'warn',
          message: `Empty status response from ${ip}:${port}`,
          details: missingResponseError.message
        });
        reject(missingResponseError);
        return;
      }

      try {
        emitDebug(debug, {
          scope: 'ping',
          level: 'info',
          message: `Status JSON from ${ip}:${port}`,
          details: statusJson
        });

        const result = parseStatusResponse(statusJson, ip, port, Date.now() - startedAt, source);
        resolve(result);
      } catch (parseError) {
        const normalized = parseError instanceof Error ? parseError : new Error('Failed to parse server response');
        emitDebug(debug, {
          scope: 'ping',
          level: 'error',
          message: `Invalid status JSON from ${ip}:${port}`,
          details: normalized.message
        });
        reject(normalized);
      }
    };

    socket.setTimeout(timeoutMs);
    socket.once('timeout', () => finalize(new Error(`Connection timed out after ${timeoutMs} ms`)));
    socket.once('error', (error) => finalize(error));

    socket.connect(
      {
        port,
        host: ip,
        family: 4,
        lookup: (_hostname, _options, callback) => callback(null, ip, 4)
      },
      () => {
        emitDebug(debug, {
          scope: 'ping',
          level: 'info',
          message: `Connected to ${ip}:${port}`,
          details: `Sending handshake and status request with timeout ${timeoutMs} ms`
        });
        socket.write(buildHandshake(ip, port));
        socket.write(buildStatusRequest());
      }
    );

    socket.on('data', (chunk) => {
      incoming = Buffer.concat([incoming, chunk]);

      try {
        while (true) {
          const packet = readPacket(incoming);
          if (!packet) {
            break;
          }

          incoming = packet.rest;
          const packetId = tryReadVarInt(packet.payload, 0);
          if (!packetId) {
            throw new Error('Missing packet id');
          }

          if (stage === 'status') {
            if (packetId.value !== 0x00) {
              throw new Error(`Unexpected packet ${packetId.value} while reading server status`);
            }

            const stringLength = tryReadVarInt(packet.payload, packetId.size);
            if (!stringLength) {
              throw new Error('Missing status JSON length');
            }

            const stringStart = packetId.size + stringLength.size;
            const stringEnd = stringStart + stringLength.value;
            if (packet.payload.length < stringEnd) {
              throw new Error('Status packet ended before JSON payload');
            }

            statusJson = packet.payload.subarray(stringStart, stringEnd).toString('utf8');
            stage = 'ping';
            socket.write(buildPingRequest(BigInt(Date.now())));
            continue;
          }

          if (packetId.value !== 0x01) {
            throw new Error(`Unexpected packet ${packetId.value} while reading pong`);
          }

          finalize();
          return;
        }
      } catch (error) {
        finalize(error instanceof Error ? error : new Error('Unknown socket parsing error'));
      }
    });
  });
}
