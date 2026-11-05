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
    if (last && nowMs - last < this.minIntervalMs) {
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
}

/** Validation schemas */
const createRoomSchema = z.object({
  title: z.string().trim().min(1).max(120),
  videoSource: z.string().trim().min(1).max(1024),
  videoDuration: z.number().min(0).max(86400).optional().default(0),
  mode: z.enum(['SCHEDULED', 'HOST_TRIGGER']).default('HOST_TRIGGER'),
  scheduledAt: z.string().datetime().nullable().optional(),
});

const controlSchema = z.object({
  action: z.enum(['START', 'PAUSE', 'RESUME', 'SEEK']),
  position: z.number().min(0).optional(),
  hostToken: z.string().optional(),
});

const sendDanmakuSchema = z.object({
  nickname: z.string().trim().min(1).max(32),
  text: z.string().trim().min(1).max(60),
  timeOffset: z.number().min(0),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default('#ffffff'),
});

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
export function createWatchRoomHub(db: Client): WatchRoomWebSocketHub {
  let wss: WebSocketServer | null = null;
  const rooms = new Map<string, Set<WebSocket>>();
  const rateLimiter = new DanmakuRateLimiter(1500);

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
      wss?.close();
    },
    attachHttpServer: (server: HttpServer) => {
      wss = new WebSocketServer({ noServer: true });

      server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
        const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
        if (url.pathname === '/ws/room' || url.pathname.startsWith('/api/v1/watch-rooms/ws')) {
          wss?.handleUpgrade(request, socket, head, ws => {
            wss?.emit('connection', ws, request);
          });
        }
      });

      wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
        let currentRoomId: string | null = null;
        let clientNickname = 'Khách';
        let isHost = false;
        const clientIp = request.headers['x-forwarded-for'] || request.socket.remoteAddress || '127.0.0.1';

        ws.on('message', async (data: Buffer | string) => {
          try {
            const msg = JSON.parse(data.toString());

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
              if (hostToken && same(hostToken, room.host_token)) {
                isHost = true;
              }

              currentRoomId = roomId;
              clientNickname = typeof nickname === 'string' && nickname.trim() ? nickname.trim().slice(0, 32) : 'Khách';

              getRoomSockets(roomId).add(ws);

              // Auto-start scheduled room if due
              const snapshot = computePlaybackState(room);
              if (room.mode === 'SCHEDULED' && room.status === 'LOBBY' && snapshot.status === 'PLAYING') {
                await execute(db, `UPDATE watch_rooms SET status = 'PLAYING', started_at = ?, updated_at = ? WHERE id = ?`, [
                  room.scheduled_at,
                  now(),
                  roomId,
                ]);
              }

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
              const rateKey = `${currentRoomId}:${clientIp}:${clientNickname}`;
              if (!rateLimiter.checkAndRecord(rateKey)) {
                ws.send(JSON.stringify({ type: 'error', code: 'RATE_LIMITED', message: 'Vui lòng chờ 1.5 giây giữa các bình luận' }));
                return;
              }

              const cleanText = sanitizeDanmakuText(String(msg.text || ''));
              if (!cleanText) return;

              const timeOffset = Number(msg.timeOffset) || 0;
              const color = typeof msg.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(msg.color) ? msg.color : '#ffffff';

              const danmakuId = uuid();
              const createdAt = now();

              await execute(
                db,
                `INSERT INTO room_danmaku (id, room_id, user_nickname, text, time_offset, color, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [danmakuId, currentRoomId, clientNickname, cleanText, timeOffset, color, createdAt]
              );

              broadcast(currentRoomId, {
                type: 'danmaku:new',
                danmaku: {
                  id: danmakuId,
                  roomId: currentRoomId,
                  nickname: clientNickname,
                  text: cleanText,
                  timeOffset,
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

              const token = msg.hostToken || (isHost ? room.host_token : '');
              if (!same(token, room.host_token)) {
                ws.send(JSON.stringify({ type: 'error', code: 'HOST_REQUIRED' }));
                return;
              }

              const action = msg.action;
              const targetPos = typeof msg.position === 'number' ? Math.max(0, msg.position) : 0;
              const nowTime = now();

              if (action === 'START') {
                await execute(
                  db,
                  `UPDATE watch_rooms SET status = 'PLAYING', started_at = ?, current_position = 0, updated_at = ? WHERE id = ?`,
                  [nowTime, nowTime, currentRoomId]
                );
                room.status = 'PLAYING';
                room.started_at = nowTime;
                room.current_position = 0;
              } else if (action === 'PAUSE') {
                const currentSnapshot = computePlaybackState(room);
                await execute(
                  db,
                  `UPDATE watch_rooms SET status = 'PAUSED', current_position = ?, started_at = NULL, updated_at = ? WHERE id = ?`,
                  [currentSnapshot.position, nowTime, currentRoomId]
                );
                room.status = 'PAUSED';
                room.current_position = currentSnapshot.position;
                room.started_at = null;
              } else if (action === 'RESUME') {
                await execute(
                  db,
                  `UPDATE watch_rooms SET status = 'PLAYING', started_at = ?, updated_at = ? WHERE id = ?`,
                  [nowTime, nowTime, currentRoomId]
                );
                room.status = 'PLAYING';
                room.started_at = nowTime;
              } else if (action === 'SEEK') {
                if (room.status === 'PLAYING') {
                  await execute(
                    db,
                    `UPDATE watch_rooms SET current_position = ?, started_at = ?, updated_at = ? WHERE id = ?`,
                    [targetPos, nowTime, nowTime, currentRoomId]
                  );
                  room.current_position = targetPos;
                  room.started_at = nowTime;
                } else {
                  await execute(
                    db,
                    `UPDATE watch_rooms SET current_position = ?, updated_at = ? WHERE id = ?`,
                    [targetPos, nowTime, currentRoomId]
                  );
                  room.current_position = targetPos;
                }
              }

              const newSnapshot = computePlaybackState(room);
              broadcast(currentRoomId, {
                type: 'sync',
                action,
                snapshot: newSnapshot,
              });
              return;
            }

            // 5. Host delete danmaku
            if (msg.type === 'host:delete_danmaku') {
              const rows = await all(db, 'SELECT * FROM watch_rooms WHERE id = ?', [currentRoomId]);
              const room = rows[0] as RoomRow | undefined;
              if (!room) return;

              const token = msg.hostToken || (isHost ? room.host_token : '');
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
            console.error('Watch room WS error', err);
          }
        });

        ws.on('close', () => {
          if (currentRoomId) {
            const set = rooms.get(currentRoomId);
            if (set) {
              set.delete(ws);
              if (set.size === 0) {
                rooms.delete(currentRoomId);
              } else {
                broadcastViewerCount(currentRoomId);
              }
            }
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
        status: row.status,
        hostToken: row.host_token,
        currentPosition: row.current_position,
        viewerCount: hub.getViewerCount(row.id),
        createdAt: row.created_at,
      };
    }));
  });

  // 3. Get Public Room details (No auth needed, anyone with link can enter)
  app.get('/api/v1/watch-rooms/:id', async (c: Context<ApiEnv>) => {
    const id = c.req.param('id');
    const rows = await all(db, 'SELECT * FROM watch_rooms WHERE id = ?', [id]);
    const room = rows[0] as RoomRow | undefined;
    if (!room) return fail(404, 'ROOM_NOT_FOUND');

    const streamUrl = resolveStreamUrl(room.video_source, env);
    const snapshot = computePlaybackState(room);

    // If scheduled premiere arrived, update DB status
    if (room.mode === 'SCHEDULED' && room.status === 'LOBBY' && snapshot.status === 'PLAYING') {
      await execute(db, `UPDATE watch_rooms SET status = 'PLAYING', started_at = ?, updated_at = ? WHERE id = ?`, [
        room.scheduled_at,
        now(),
        room.id,
      ]);
    }

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
    const id = c.req.param('id');
    const rows = await all(
      db,
      'SELECT id, user_nickname, text, time_offset, color, created_at FROM room_danmaku WHERE room_id = ? AND deleted_at IS NULL ORDER BY time_offset ASC LIMIT 1000',
      [id]
    );

    return c.json(rows.map(r => ({
      id: r.id,
      nickname: r.user_nickname,
      text: r.text,
      timeOffset: r.time_offset,
      color: r.color,
      createdAt: r.created_at,
    })));
  });

  // 5. Host control via REST (fallback or direct)
  app.post('/api/v1/watch-rooms/:id/control', async (c: Context<ApiEnv>) => {
    const id = c.req.param('id');
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

    const action = body.action;
    const targetPos = typeof body.position === 'number' ? Math.max(0, body.position) : 0;
    const nowTime = now();

    if (action === 'START') {
      await execute(
        db,
        `UPDATE watch_rooms SET status = 'PLAYING', started_at = ?, current_position = 0, updated_at = ? WHERE id = ?`,
        [nowTime, nowTime, id]
      );
      room.status = 'PLAYING';
      room.started_at = nowTime;
      room.current_position = 0;
    } else if (action === 'PAUSE') {
      const currentSnapshot = computePlaybackState(room);
      await execute(
        db,
        `UPDATE watch_rooms SET status = 'PAUSED', current_position = ?, started_at = NULL, updated_at = ? WHERE id = ?`,
        [currentSnapshot.position, nowTime, id]
      );
      room.status = 'PAUSED';
      room.current_position = currentSnapshot.position;
      room.started_at = null;
    } else if (action === 'RESUME') {
      await execute(
        db,
        `UPDATE watch_rooms SET status = 'PLAYING', started_at = ?, updated_at = ? WHERE id = ?`,
        [nowTime, nowTime, id]
      );
      room.status = 'PLAYING';
      room.started_at = nowTime;
    } else if (action === 'SEEK') {
      if (room.status === 'PLAYING') {
        await execute(
          db,
          `UPDATE watch_rooms SET current_position = ?, started_at = ?, updated_at = ? WHERE id = ?`,
          [targetPos, nowTime, nowTime, id]
        );
        room.current_position = targetPos;
        room.started_at = nowTime;
      } else {
        await execute(
          db,
          `UPDATE watch_rooms SET current_position = ?, updated_at = ? WHERE id = ?`,
          [targetPos, nowTime, id]
        );
        room.current_position = targetPos;
      }
    }

    const newSnapshot = computePlaybackState(room);
    hub.broadcastRoom(id, {
      type: 'sync',
      action,
      snapshot: newSnapshot,
    });

    return c.json({ ok: true, snapshot: newSnapshot });
  });

  // 6. Delete danmaku (Host only)
  app.delete('/api/v1/watch-rooms/:id/danmaku/:danmakuId', async (c: Context<ApiEnv>) => {
    const id = c.req.param('id');
    const danmakuId = c.req.param('danmakuId');
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
