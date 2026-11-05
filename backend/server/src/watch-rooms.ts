import { randomBytes, createHmac } from 'node:crypto';
import type { Hono, Context } from 'hono';
import { z } from 'zod';
import type { Client } from '@libsql/client';
import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { all, one, execute, uuid, now, fail, type Row, type Executor } from './db.ts';
import { requireActor, type ApiEnv, type Config, same } from './auth.ts';

export interface RoomRow {
  id: string;
  title: string;
  video_source: string;
  video_duration: number;
  mode: 'SCHEDULED' | 'HOST_TRIGGER';
  scheduled_at: string | null;
  status: 'LOBBY' | 'PLAYING' | 'PAUSED' | 'ENDED';
  host_user_id: string | null;
  host_token: string;
  started_at: string | null;
  current_position: number;
  created_at: string;
  updated_at: string;
}

export interface PlaybackSnapshot {
  status: 'LOBBY' | 'PLAYING' | 'PAUSED' | 'ENDED';
  position: number;
  serverTime: number;
  countdownSeconds: number | null;
  startedAt: string | null;
}

export interface DanmakuMessage {
  id: string;
  roomId: string;
  nickname: string;
  text: string;
  timeOffset: number;
  color: string;
  createdAt: string;
}

/** Sanitize danmaku text and escape HTML special characters to prevent XSS */
export function sanitizeDanmakuText(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const bounded = trimmed.slice(0, 60);
  return bounded
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Rate limiter per viewer: returns true if permitted, false if rate limited (1 msg / 1.5s) */
export class DanmakuRateLimiter {
  private lastSent = new Map<string, number>();
  private readonly minIntervalMs: number;

  constructor(minIntervalMs = 1500) {
    this.minIntervalMs = minIntervalMs;
  }

  checkAndRecord(key: string, nowMs = Date.now()): boolean {
    const last = this.lastSent.get(key);
    if (last !== undefined && nowMs - last < this.minIntervalMs) {
      return false;
    }
    this.lastSent.set(key, nowMs);
    // Periodically prune stale keys
    if (this.lastSent.size > 2000) {
      for (const [k, time] of this.lastSent.entries()) {
        if (nowMs - time > 60_000) this.lastSent.delete(k);
      }
    }
    return true;
  }
}

/** Compute real-time room playback position based on server time authority */
export function computePlaybackState(
  room: {
    status: string;
    mode: string;
    scheduled_at: string | null;
    started_at: string | null;
    current_position: number;
    video_duration?: number | null;
  },
  nowMs: number = Date.now()
): PlaybackSnapshot {
  if (room.status === 'ENDED') {
    return {
      status: 'ENDED',
      position: room.current_position,
      serverTime: nowMs,
      countdownSeconds: null,
      startedAt: room.started_at,
    };
  }

  // Handle scheduled premiere mode
  if (room.mode === 'SCHEDULED' && room.status === 'LOBBY' && room.scheduled_at) {
    const scheduledMs = Date.parse(room.scheduled_at);
    if (Number.isFinite(scheduledMs)) {
      if (nowMs < scheduledMs) {
        return {
          status: 'LOBBY',
          position: 0,
          serverTime: nowMs,
          countdownSeconds: Math.max(0, Math.ceil((scheduledMs - nowMs) / 1000)),
          startedAt: null,
        };
      } else {
        // Scheduled time has arrived: auto-started!
        const elapsed = (nowMs - scheduledMs) / 1000;
        const duration = room.video_duration && room.video_duration > 0 ? room.video_duration : Infinity;
        if (elapsed >= duration) {
          return {
            status: 'ENDED',
            position: duration,
            serverTime: nowMs,
            countdownSeconds: null,
            startedAt: room.scheduled_at,
          };
        }
        return {
          status: 'PLAYING',
          position: elapsed,
          serverTime: nowMs,
          countdownSeconds: null,
          startedAt: room.scheduled_at,
        };
      }
    }
  }

  if (room.status === 'PLAYING') {
    const startedMs = room.started_at ? Date.parse(room.started_at) : nowMs;
    const elapsed = Math.max(0, (nowMs - startedMs) / 1000);
    const pos = room.current_position + elapsed;
    const duration = room.video_duration && room.video_duration > 0 ? room.video_duration : Infinity;
    if (pos >= duration) {
      return {
        status: 'ENDED',
        position: duration,
        serverTime: nowMs,
        countdownSeconds: null,
        startedAt: room.started_at,
      };
    }
    return {
      status: 'PLAYING',
      position: pos,
      serverTime: nowMs,
      countdownSeconds: null,
      startedAt: room.started_at,
    };
  }

  // PAUSED or LOBBY (HOST_TRIGGER)
  return {
    status: (room.status as 'LOBBY' | 'PAUSED') || 'LOBBY',
    position: room.current_position,
    serverTime: nowMs,
    countdownSeconds: null,
    startedAt: room.started_at,
  };
}

/** Danmaku lane allocator to prevent bullet comments from overlapping on the same track */
export class DanmakuLaneAllocator {
  readonly laneCount: number;
  private laneFreeTime: number[];

  constructor(laneCount = 8) {
    this.laneCount = Math.max(1, laneCount);
    this.laneFreeTime = new Array(this.laneCount).fill(0);
  }

  /**
   * Allocates a lane index (0 .. laneCount - 1) for a comment.
   * durationSec: bullet animation duration (seconds).
   * charCount: length of comment string (affects width clearance time).
   */
  allocateLane(nowMs = Date.now(), charCount = 10, durationSec = 6.0): number {
    // Estimated time (ms) for this message's tail to clear the right edge entry zone
    const entryClearanceMs = Math.max(800, (charCount * 28) + 600);

    // 1. Try to find a completely free lane
    for (let i = 0; i < this.laneCount; i++) {
      if (nowMs >= this.laneFreeTime[i]) {
        this.laneFreeTime[i] = nowMs + entryClearanceMs;
        return i;
      }
    }

    // 2. If all lanes are occupied, pick the lane that becomes available earliest
    let earliestLane = 0;
    let minTime = this.laneFreeTime[0];
    for (let i = 1; i < this.laneCount; i++) {
      if (this.laneFreeTime[i] < minTime) {
        minTime = this.laneFreeTime[i];
        earliestLane = i;
      }
    }
    this.laneFreeTime[earliestLane] = Math.max(nowMs, minTime) + entryClearanceMs;
    return earliestLane;
  }
}

/**
 * Generate Azure Blob Read SAS token using Storage Account Key.
 * Read-only, short-lived, https-only.
 */
export function generateAzureBlobReadSas(
  accountName: string,
  accountKeyBase64: string,
  containerName: string,
  blobName: string,
  validityMinutes = 120,
  nowDate = new Date()
): string {
  const signedVersion = '2023-11-03';
  const signedPermissions = 'r';
  const signedResource = 'b';
  const signedProtocol = 'https';

  const startTime = new Date(nowDate.getTime() - 5 * 60 * 1000); // 5 min skew cushion
  const expiryTime = new Date(nowDate.getTime() + validityMinutes * 60 * 1000);

  const formatIso = (d: Date) => d.toISOString().slice(0, 19) + 'Z';
  const st = formatIso(startTime);
  const se = formatIso(expiryTime);

  const canonicalResource = `/blob/${accountName}/${containerName}/${blobName}`;

  const stringToSign = [
    signedPermissions,
    st,
    se,
    canonicalResource,
    '', // signedIdentifier
    '', // signedIP
    signedProtocol,
    signedVersion,
    signedResource,
    '', // signedSnapshotTime
    '', // signedEncryptionScope
    '', // rscc
    '', // rscd
    '', // rsce
    '', // rslg
    '', // rsct
  ].join('\n');

  const keyBuffer = Buffer.from(accountKeyBase64, 'base64');
  const signature = createHmac('sha256', keyBuffer).update(stringToSign, 'utf8').digest('base64');

  const params = new URLSearchParams({
    sv: signedVersion,
    sr: signedResource,
    sp: signedPermissions,
    spr: signedProtocol,
    st,
    se,
    sig: signature,
  });

  return params.toString();
}

/**
 * Resolve video stream URL:
 * - If videoSource is a relative Azure Blob path (e.g. "videos/intro.mp4" or "my-container/movie.mp4") and Azure config is present, sign SAS URL.
 * - If videoSource is already a full HTTPS URL, return as-is or append container SAS token if configured.
 */
export function resolveStreamUrl(
  videoSource: string,
  env: Record<string, string | undefined>
): string {
  const trimmed = videoSource.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    // If it's already an Azure blob URL without SAS
    if (trimmed.includes('.blob.core.windows.net') && !trimmed.includes('?')) {
      const match = trimmed.match(/^https?:\/\/([^.]+)\.blob\.core\.windows\.net\/([^/]+)\/(.+)$/i);
      if (match && env.AZURE_STORAGE_ACCOUNT_NAME === match[1] && env.AZURE_STORAGE_ACCOUNT_KEY) {
        const sas = generateAzureBlobReadSas(match[1], env.AZURE_STORAGE_ACCOUNT_KEY, match[2], match[3]);
        return `${trimmed}?${sas}`;
      }
      const sasToken = env.AZURE_STORAGE_SAS_TOKEN?.replace(/^\?/, '');
      if (sasToken) return `${trimmed}?${sasToken}`;
    }
    return trimmed;
  }

  // Relative blob path: format: [container/]blob-name
  const accountName = env.AZURE_STORAGE_ACCOUNT_NAME;
  const accountKey = env.AZURE_STORAGE_ACCOUNT_KEY;
  const containerUrl = env.AZURE_STORAGE_CONTAINER_URL;

  if (accountName && accountKey) {
    const parts = trimmed.replace(/^\//, '').split('/');
    let container = 'videos';
    let blob = parts.join('/');
    if (parts.length > 1) {
      container = parts[0];
      blob = parts.slice(1).join('/');
    }
    const sas = generateAzureBlobReadSas(accountName, accountKey, container, blob);
    return `https://${accountName}.blob.core.windows.net/${container}/${blob}?${sas}`;
  }

  if (containerUrl) {
    const base = containerUrl.replace(/\/$/, '');
    const cleanBlob = trimmed.replace(/^\//, '');
    const sasToken = env.AZURE_STORAGE_SAS_TOKEN?.replace(/^\?/, '');
    return sasToken ? `${base}/${cleanBlob}?${sasToken}` : `${base}/${cleanBlob}`;
  }

  return trimmed;
}

/** Database schema initialization for watch rooms */
export async function initializeWatchRooms(db: Client): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS watch_rooms (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      video_source TEXT NOT NULL,
      video_duration REAL NOT NULL DEFAULT 0,
      mode TEXT NOT NULL CHECK (mode IN ('SCHEDULED', 'HOST_TRIGGER')),
      scheduled_at TEXT,
      status TEXT NOT NULL DEFAULT 'LOBBY' CHECK (status IN ('LOBBY', 'PLAYING', 'PAUSED', 'ENDED')),
      host_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
      host_token TEXT NOT NULL,
      started_at TEXT,
      current_position REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS room_danmaku (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES watch_rooms(id) ON DELETE CASCADE,
      user_nickname TEXT NOT NULL,
      user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
      text TEXT NOT NULL,
      time_offset REAL NOT NULL,
      color TEXT NOT NULL DEFAULT '#ffffff',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now')),
      deleted_at TEXT
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS room_bans (
      room_id TEXT NOT NULL REFERENCES watch_rooms(id) ON DELETE CASCADE,
      identifier TEXT NOT NULL,
      banned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now')),
      PRIMARY KEY (room_id, identifier)
    )
  `);

  await db.execute(`CREATE INDEX IF NOT EXISTS ix_room_danmaku_offset ON room_danmaku(room_id, time_offset)`);
  const columns = await all(db, 'PRAGMA table_info(room_danmaku)');
  if (!columns.some(column => column.name === 'phase')) {
    await db.execute("ALTER TABLE room_danmaku ADD COLUMN phase TEXT NOT NULL DEFAULT 'VIDEO'");
  }
}

/** Validation schemas */
const createRoomSchema = z.object({
  title: z.string().trim().min(1).max(120),
  videoSource: z.string().trim().min(1).max(1024),
  videoDuration: z.number().min(0).max(86400).optional().default(0),
  mode: z.enum(['SCHEDULED', 'HOST_TRIGGER']).default('HOST_TRIGGER'),
  scheduledAt: z.string().datetime().nullable().optional(),
}).refine(body => body.mode !== 'SCHEDULED' || (body.scheduledAt && Date.parse(body.scheduledAt) > Date.now()), {
  message: 'Scheduled premieres require a future date', path: ['scheduledAt'],
});

const controlSchema = z.object({
  action: z.enum(['START', 'PAUSE', 'RESUME', 'SEEK']),
  position: z.number().min(0).optional(),
  hostToken: z.string().optional(),
});

/** REST and WebSocket share the same server-authoritative state transitions. */
async function applyPlaybackControl(db: Client, room: RoomRow, control: z.infer<typeof controlSchema>): Promise<PlaybackSnapshot> {
  const nowMs = Date.now();
  const snapshot = computePlaybackState(room, nowMs);
  let status = snapshot.status;
  let position = snapshot.position;
  if (control.action === 'START') { status = 'PLAYING'; position = 0; }
  if (control.action === 'PAUSE' && status === 'PLAYING') status = 'PAUSED';
  if (control.action === 'RESUME' && status !== 'PLAYING') status = 'PLAYING';
  if (control.action === 'SEEK') {
    position = Math.min(control.position ?? 0, room.video_duration > 0 ? room.video_duration : Infinity);
    if (status === 'ENDED') status = 'PAUSED';
  }
  // Re-anchor the already-computed position once, including scheduled auto-starts.
  const startedAt = status === 'PLAYING' ? new Date(nowMs).toISOString() : null;
  await execute(db, 'UPDATE watch_rooms SET status = ?, current_position = ?, started_at = ?, updated_at = ? WHERE id = ?',
    [status, position, startedAt, new Date(nowMs).toISOString(), room.id]);
  return computePlaybackState({ ...room, status, current_position: position, started_at: startedAt }, nowMs);
}

export interface WatchRoomWebSocketHub {
  attachHttpServer(server: HttpServer): void;
  broadcastRoom(roomId: string, message: Record<string, unknown>): void;
  getViewerCount(roomId: string): number;
  close(): void;
}

/**
 * Creates the Watch Room WebSocket Hub for real-time synchronization,
 * danmaku broadcasting, and participant count tracking.
 */
export function createWatchRoomHub(db: Client, config: Pick<Config, 'production' | 'publicOrigin' | 'proxySecret'> = {
  production: false, publicOrigin: 'http://localhost:4200', proxySecret: '',
}): WatchRoomWebSocketHub {
  let wss: WebSocketServer | null = null;
  const rooms = new Map<string, Set<WebSocket>>();
  const rateLimiter = new DanmakuRateLimiter(1500);
  let syncTimer: ReturnType<typeof setInterval> | undefined;
  let syncing = false;
  let closed = false;

  // Only active rooms are read, once per second, independently of viewers joining.
  async function syncActiveRooms() {
    if (syncing || closed || rooms.size === 0) return;
    syncing = true;
    try {
      const ids = [...rooms.keys()];
      for (let offset = 0; offset < ids.length; offset += 100) {
        const batch = ids.slice(offset, offset + 100);
        const observedAt = Date.now();
        const rows = await all(db, `SELECT * FROM watch_rooms WHERE id IN (${batch.map(() => '?').join(',')})`, batch);
        if (closed) return;
        for (const row of rows) broadcast(row.id as string, {
          type: 'sync', action: 'TICK', snapshot: computePlaybackState(row as RoomRow, observedAt),
        });
      }
    } catch {
      if (!closed) console.warn('Watch room synchronization unavailable');
    } finally { syncing = false; }
  }

  function leaveRoom(roomId: string, ws: WebSocket) {
    const set = rooms.get(roomId);
    set?.delete(ws);
    if (set?.size === 0) rooms.delete(roomId);
    else broadcastViewerCount(roomId);
  }

  function getRoomSockets(roomId: string): Set<WebSocket> {
    let set = rooms.get(roomId);
    if (!set) {
      set = new Set();
      rooms.set(roomId, set);
    }
    return set;
  }

  function broadcast(roomId: string, message: Record<string, unknown>) {
    const json = JSON.stringify(message);
    const sockets = rooms.get(roomId);
    if (!sockets) return;
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(json);
      }
    }
  }

  function broadcastViewerCount(roomId: string) {
    const sockets = rooms.get(roomId);
    const count = sockets ? sockets.size : 0;
    broadcast(roomId, { type: 'viewer_count', count });
  }

  return {
    broadcastRoom: broadcast,
    getViewerCount: (roomId: string) => rooms.get(roomId)?.size || 0,
    close: () => {
      closed = true;
      if (syncTimer) clearInterval(syncTimer);
      for (const ws of wss?.clients || []) ws.terminate();
      rooms.clear();
      wss?.close();
    },
    attachHttpServer: (server: HttpServer) => {
      wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
      syncTimer = setInterval(() => void syncActiveRooms(), 1000);
      syncTimer.unref();

      server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
        const reject = (status: number) => { socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\n\r\n`); };
        let url: URL;
        try { url = new URL(request.url || '', 'http://localhost'); } catch { reject(400); return; }
        const edgeGate = config.production || !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/.test(config.publicOrigin);
        if (edgeGate && (!config.proxySecret || typeof request.headers['x-origin-verify'] !== 'string'
          || !same(request.headers['x-origin-verify'], config.proxySecret))) { reject(403); return; }
        if (request.headers.origin && request.headers.origin !== config.publicOrigin) { reject(403); return; }
        if (url.pathname === '/ws/room' || url.pathname === '/api/v1/watch-rooms/ws') {
          wss?.handleUpgrade(request, socket, head, ws => {
            wss?.emit('connection', ws, request);
          });
        } else reject(404);
      });

      wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
        ws.on('error', () => {}); // Invalid/oversized frames close this client, not the server.
        const viewerId = uuid();
        let currentRoomId: string | null = null;
        let clientNickname = 'Khách';
        let isHost = false;
        const clientIp = config.proxySecret && request.headers['x-origin-verify'] === config.proxySecret
          ? request.headers['x-forwarded-for'] || request.socket.remoteAddress
          : request.socket.remoteAddress;
        // Serialize messages so simultaneous joins cannot retain privileges or memberships.
        let pending = Promise.resolve();

        ws.on('message', (data: Buffer | string) => {
          pending = pending.then(async () => {
          try {
            if (closed || ws.readyState !== WebSocket.OPEN) return;
            const msg = JSON.parse(data.toString());
            if (!msg || typeof msg !== 'object') return;

            // 1. Ping / Pong clock skew measurement
            if (msg.type === 'ping') {
              ws.send(JSON.stringify({
                type: 'pong',
                t0: msg.t0,
                serverTime: Date.now(),
              }));
              return;
            }

            // 2. Join room
            if (msg.type === 'join') {
              const { roomId, nickname, hostToken } = msg;
              if (typeof roomId !== 'string') return;

              const rows = await all(db, 'SELECT * FROM watch_rooms WHERE id = ?', [roomId]);
              const room = rows[0] as RoomRow | undefined;
              if (!room) {
                ws.send(JSON.stringify({ type: 'error', code: 'ROOM_NOT_FOUND' }));
                return;
              }

              // Check if client is host
              if (ws.readyState !== WebSocket.OPEN) return;
              isHost = typeof hostToken === 'string' && same(hostToken, room.host_token);
              if (currentRoomId && currentRoomId !== roomId) leaveRoom(currentRoomId, ws);

              currentRoomId = roomId;
              clientNickname = typeof nickname === 'string' && nickname.trim() ? nickname.trim().slice(0, 32) : 'Khách';

              getRoomSockets(roomId).add(ws);

              const snapshot = computePlaybackState(room);

              ws.send(JSON.stringify({
                type: 'room_snapshot',
                room: {
                  id: room.id,
                  title: room.title,
                  mode: room.mode,
                  scheduledAt: room.scheduled_at,
                  videoDuration: room.video_duration,
                },
                snapshot,
                isHost,
                viewerCount: getRoomSockets(roomId).size,
              }));

              broadcastViewerCount(roomId);
              return;
            }

            // All subsequent actions require being joined in a room
            if (!currentRoomId) return;

            // 3. Danmaku send
            if (msg.type === 'danmaku:send') {
              // Rate limit check by IP / socket
              const rateKey = `${currentRoomId}:${clientIp}:${viewerId}`;
              if (!rateLimiter.checkAndRecord(rateKey)) {
                ws.send(JSON.stringify({ type: 'error', code: 'RATE_LIMITED', message: 'Vui lòng chờ 1.5 giây giữa các bình luận' }));
                return;
              }

              const cleanText = sanitizeDanmakuText(String(msg.text || ''));
              if (!cleanText) return;

              const room = (await all(db, 'SELECT * FROM watch_rooms WHERE id = ?', [currentRoomId]))[0] as RoomRow | undefined;
              if (!room) return;
              const playback = computePlaybackState(room);
              const phase = playback.status === 'LOBBY' ? 'LOBBY' : 'VIDEO';
              const timeOffset = playback.position;
              const color = typeof msg.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(msg.color) ? msg.color : '#ffffff';

              const danmakuId = uuid();
              const createdAt = now();

              await execute(
                db,
                `INSERT INTO room_danmaku (id, room_id, user_nickname, text, time_offset, color, created_at, phase)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [danmakuId, currentRoomId, clientNickname, cleanText, timeOffset, color, createdAt, phase]
              );

              broadcast(currentRoomId, {
                type: 'danmaku:new',
                danmaku: {
                  id: danmakuId,
                  roomId: currentRoomId,
                  nickname: clientNickname,
                  text: cleanText,
                  timeOffset,
                  phase,
                  color,
                  createdAt,
                },
              });
              return;
            }

            // 4. Host controls (START, PAUSE, RESUME, SEEK)
            if (msg.type === 'host:control') {
              const rows = await all(db, 'SELECT * FROM watch_rooms WHERE id = ?', [currentRoomId]);
              const room = rows[0] as RoomRow | undefined;
              if (!room) return;

              const token = typeof msg.hostToken === 'string' ? msg.hostToken : (isHost ? room.host_token : '');
              if (!same(token, room.host_token)) {
                ws.send(JSON.stringify({ type: 'error', code: 'HOST_REQUIRED' }));
                return;
              }

              const control = controlSchema.parse(msg);
              const newSnapshot = await applyPlaybackControl(db, room, control);
              broadcast(currentRoomId, {
                type: 'sync',
                action: control.action,
                snapshot: newSnapshot,
              });
              return;
            }

            // 5. Host delete danmaku
            if (msg.type === 'host:delete_danmaku') {
              const rows = await all(db, 'SELECT * FROM watch_rooms WHERE id = ?', [currentRoomId]);
              const room = rows[0] as RoomRow | undefined;
              if (!room) return;

              const token = typeof msg.hostToken === 'string' ? msg.hostToken : (isHost ? room.host_token : '');
              if (!same(token, room.host_token)) {
                ws.send(JSON.stringify({ type: 'error', code: 'HOST_REQUIRED' }));
                return;
              }

              const danmakuId = String(msg.danmakuId || '');
              if (danmakuId) {
                await execute(db, 'UPDATE room_danmaku SET deleted_at = ? WHERE id = ? AND room_id = ?', [now(), danmakuId, currentRoomId]);
                broadcast(currentRoomId, {
                  type: 'danmaku:delete',
                  danmakuId,
                });
              }
              return;
            }
          } catch (err) {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'error', code: 'INVALID_REQUEST' }));
          }
          });
        });

        ws.on('close', () => {
          if (currentRoomId) {
            leaveRoom(currentRoomId, ws);
          }
        });
      });
    },
  };
}

/**
 * Registers REST API endpoints for Watch Rooms
 */
export function watchRoomRoutes(
  app: Hono<ApiEnv>,
  db: Client,
  hub: WatchRoomWebSocketHub,
  env: Record<string, string | undefined>
) {
  // 1. Create Room (Host only: requires ADMIN or authenticated user)
  app.post('/api/v1/admin/watch-rooms', async (c: Context<ApiEnv>) => {
    const actor = requireActor(c, true);
    const body = createRoomSchema.parse(await c.req.json());

    const roomId = 'room_' + randomBytes(8).toString('base64url').toLowerCase();
    const hostToken = randomBytes(24).toString('base64url');
    const createdAt = now();

    await execute(
      db,
      `INSERT INTO watch_rooms (id, title, video_source, video_duration, mode, scheduled_at, status, host_user_id, host_token, current_position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'LOBBY', ?, ?, 0, ?, ?)`,
      [
        roomId,
        body.title,
        body.videoSource,
        body.videoDuration,
        body.mode,
        body.mode === 'SCHEDULED' ? (body.scheduledAt || null) : null,
        actor.id,
        hostToken,
        createdAt,
        createdAt,
      ]
    );

    return c.json({
      id: roomId,
      title: body.title,
      mode: body.mode,
      scheduledAt: body.scheduledAt || null,
      hostToken,
      roomUrl: `/room/${roomId}`,
    }, 201);
  });

  // 2. List rooms created by host
  app.get('/api/v1/admin/watch-rooms', async (c: Context<ApiEnv>) => {
    requireActor(c, true);
    const rows = await all(db, 'SELECT * FROM watch_rooms ORDER BY created_at DESC LIMIT 50');
    return c.json(rows.map(r => {
      const row = r as RoomRow;
      return {
        id: row.id,
        title: row.title,
        videoSource: row.video_source,
        videoDuration: row.video_duration,
        mode: row.mode,
        scheduledAt: row.scheduled_at,
        status: computePlaybackState(row).status,
        hostToken: row.host_token,
        currentPosition: row.current_position,
        viewerCount: hub.getViewerCount(row.id),
        createdAt: row.created_at,
      };
    }));
  });

  // 3. Get Public Room details (No auth needed, anyone with link can enter)
  app.get('/api/v1/watch-rooms/:id', async (c: Context<ApiEnv>) => {
    const id = z.string().min(1).parse(c.req.param('id'));
    const rows = await all(db, 'SELECT * FROM watch_rooms WHERE id = ?', [id]);
    const room = rows[0] as RoomRow | undefined;
    if (!room) return fail(404, 'ROOM_NOT_FOUND');

    const streamUrl = resolveStreamUrl(room.video_source, env);
    const snapshot = computePlaybackState(room);

    // Check if the caller is the host (via header or query hostToken or admin session)
    const hostTokenParam = c.req.header('X-Host-Token') || c.req.query('hostToken');
    const actor = c.get('actor');
    const isHost = Boolean(
      (hostTokenParam && same(hostTokenParam, room.host_token)) ||
      (actor && actor.role === 'ADMIN' && (room.host_user_id === actor.id || !room.host_user_id))
    );

    return c.json({
      id: room.id,
      title: room.title,
      mode: room.mode,
      scheduledAt: room.scheduled_at,
      videoDuration: room.video_duration,
      status: snapshot.status,
      streamUrl,
      snapshot,
      viewerCount: hub.getViewerCount(room.id),
      isHost,
      hostToken: isHost ? room.host_token : undefined,
    });
  });

  // 4. Get Danmaku history for room
  app.get('/api/v1/watch-rooms/:id/danmaku', async (c: Context<ApiEnv>) => {
    const id = z.string().min(1).parse(c.req.param('id'));
    const rows = await all(
      db,
      'SELECT id, user_nickname, text, time_offset, color, created_at, phase FROM room_danmaku WHERE room_id = ? AND deleted_at IS NULL ORDER BY time_offset ASC LIMIT 1000',
      [id]
    );

    return c.json(rows.map(r => ({
      id: r.id,
      nickname: r.user_nickname,
      text: r.text,
      timeOffset: r.time_offset,
      phase: r.phase,
      color: r.color,
      createdAt: r.created_at,
    })));
  });

  // 5. Host control via REST (fallback or direct)
  app.post('/api/v1/watch-rooms/:id/control', async (c: Context<ApiEnv>) => {
    const id = z.string().min(1).parse(c.req.param('id'));
    const rows = await all(db, 'SELECT * FROM watch_rooms WHERE id = ?', [id]);
    const room = rows[0] as RoomRow | undefined;
    if (!room) return fail(404, 'ROOM_NOT_FOUND');

    const body = controlSchema.parse(await c.req.json());
    const actor = c.get('actor');
    const token = body.hostToken || c.req.header('X-Host-Token');

    const isAuthorized = Boolean(
      (token && same(token, room.host_token)) ||
      (actor && actor.role === 'ADMIN')
    );

    if (!isAuthorized) return fail(403, 'HOST_REQUIRED');

    const newSnapshot = await applyPlaybackControl(db, room, body);
    hub.broadcastRoom(id, {
      type: 'sync',
      action: body.action,
      snapshot: newSnapshot,
    });

    return c.json({ ok: true, snapshot: newSnapshot });
  });

  // 6. Delete danmaku (Host only)
  app.delete('/api/v1/watch-rooms/:id/danmaku/:danmakuId', async (c: Context<ApiEnv>) => {
    const id = z.string().min(1).parse(c.req.param('id'));
    const danmakuId = z.string().min(1).parse(c.req.param('danmakuId'));
    const rows = await all(db, 'SELECT * FROM watch_rooms WHERE id = ?', [id]);
    const room = rows[0] as RoomRow | undefined;
    if (!room) return fail(404, 'ROOM_NOT_FOUND');

    const actor = c.get('actor');
    const token = c.req.header('X-Host-Token');
    const isAuthorized = Boolean(
      (token && same(token, room.host_token)) ||
      (actor && actor.role === 'ADMIN')
    );
    if (!isAuthorized) return fail(403, 'HOST_REQUIRED');

    await execute(db, 'UPDATE room_danmaku SET deleted_at = ? WHERE id = ? AND room_id = ?', [now(), danmakuId, id]);
    hub.broadcastRoom(id, {
      type: 'danmaku:delete',
      danmakuId,
    });

    return c.json({ ok: true });
  });
}
