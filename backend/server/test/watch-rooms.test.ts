import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeDanmakuText,
  DanmakuRateLimiter,
  DanmakuLaneAllocator,
  computePlaybackState,
  generateAzureBlobReadSas,
  resolveStreamUrl,
  initializeWatchRooms,
  createWatchRoomHub,
  cleanNickname,
} from '../src/watch-rooms.ts';
import { database, initializeLocal, execute, uuid } from '../src/db.ts';
import { createApp } from '../src/app.ts';
import { randomBytes } from 'node:crypto';

test('sanitizeDanmakuText escapes HTML and limits length', () => {
  assert.equal(sanitizeDanmakuText(''), '');
  assert.equal(sanitizeDanmakuText('   '), '');
  assert.equal(sanitizeDanmakuText('Hello World'), 'Hello World');
  assert.equal(
    sanitizeDanmakuText('<script>alert("xss")</script>'),
    '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
  );
  assert.equal(
    sanitizeDanmakuText("Anime & Manga 'rocks'"),
    'Anime &amp; Manga &#039;rocks&#039;'
  );

  // Exceeding 60 characters gets truncated
  const longText = 'A'.repeat(100);
  const sanitized = sanitizeDanmakuText(longText);
  assert.equal(sanitized.length, 60);
  assert.equal(sanitized, 'A'.repeat(60));
});

test('DanmakuRateLimiter enforces 1 message per 1.5 seconds per viewer', () => {
  const limiter = new DanmakuRateLimiter(1500);
  const user = 'user_123';
  const t0 = 10000;

  // First message is allowed
  assert.equal(limiter.checkAndRecord(user, t0), true);

  // Message sent at +500ms is blocked
  assert.equal(limiter.checkAndRecord(user, t0 + 500), false);

  // Message sent at +1499ms is blocked
  assert.equal(limiter.checkAndRecord(user, t0 + 1499), false);

  // Different user at +500ms is allowed
  assert.equal(limiter.checkAndRecord('user_456', t0 + 500), true);

  // Original user at +1501ms is allowed
  assert.equal(limiter.checkAndRecord(user, t0 + 1501), true);
});

test('DanmakuLaneAllocator distributes across lanes without overlap', () => {
  const allocator = new DanmakuLaneAllocator(4);
  const t0 = 5000;

  const lane0 = allocator.allocateLane(t0, 10);
  const lane1 = allocator.allocateLane(t0, 15);
  const lane2 = allocator.allocateLane(t0, 5);
  const lane3 = allocator.allocateLane(t0, 20);

  // First 4 messages should receive 4 distinct lanes
  const allocated = new Set([lane0, lane1, lane2, lane3]);
  assert.equal(allocated.size, 4);
  for (const lane of allocated) {
    assert.ok(lane >= 0 && lane < 4);
  }

  // 5th message immediately afterwards cycles to earliest lane without crashing
  const lane4 = allocator.allocateLane(t0 + 10, 10);
  assert.ok(lane4 >= 0 && lane4 < 4);

  // Message sent much later re-allocates starting from lane 0
  const lane5 = allocator.allocateLane(t0 + 10000, 10);
  assert.equal(lane5, 0);
});

test('computePlaybackState handles LOBBY, PLAYING, PAUSED, and SCHEDULED countdown', () => {
  const baseRoom = {
    status: 'LOBBY',
    mode: 'HOST_TRIGGER',
    scheduled_at: null,
    started_at: null,
    current_position: 0,
    video_duration: 300,
  };

  // 1. Host Trigger in LOBBY
  const lobbySnap = computePlaybackState(baseRoom, 100000);
  assert.equal(lobbySnap.status, 'LOBBY');
  assert.equal(lobbySnap.position, 0);
  assert.equal(lobbySnap.countdownSeconds, null);

  // 2. PLAYING state calculates elapsed time from started_at
  const playingRoom = {
    ...baseRoom,
    status: 'PLAYING',
    started_at: '2026-11-05T12:00:00.000Z',
    current_position: 10,
  };
  const tStarted = Date.parse('2026-11-05T12:00:00.000Z');
  // 15 seconds after started_at
  const playSnap = computePlaybackState(playingRoom, tStarted + 15000);
  assert.equal(playSnap.status, 'PLAYING');
  assert.equal(playSnap.position, 25); // 10 initial + 15 elapsed

  // 3. PLAYING past duration transitions to ENDED
  const endedPlaySnap = computePlaybackState(playingRoom, tStarted + 350000);
  assert.equal(endedPlaySnap.status, 'ENDED');
  assert.equal(endedPlaySnap.position, 300);

  // 4. PAUSED state freezes position
  const pausedRoom = {
    ...baseRoom,
    status: 'PAUSED',
    started_at: null,
    current_position: 45.5,
  };
  const pauseSnap = computePlaybackState(pausedRoom, 100000);
  assert.equal(pauseSnap.status, 'PAUSED');
  assert.equal(pauseSnap.position, 45.5);

  // 5. SCHEDULED mode countdown before scheduled time
  const scheduledTime = '2026-11-05T15:00:00.000Z';
  const scheduledRoom = {
    ...baseRoom,
    mode: 'SCHEDULED',
    status: 'LOBBY',
    scheduled_at: scheduledTime,
  };
  const tScheduled = Date.parse(scheduledTime);

  // 60 seconds before scheduled time
  const beforeSnap = computePlaybackState(scheduledRoom, tScheduled - 60000);
  assert.equal(beforeSnap.status, 'LOBBY');
  assert.equal(beforeSnap.countdownSeconds, 60);
  assert.equal(beforeSnap.position, 0);

  // At or after scheduled time: auto-plays!
  const afterSnap = computePlaybackState(scheduledRoom, tScheduled + 12000);
  assert.equal(afterSnap.status, 'PLAYING');
  assert.equal(afterSnap.position, 12);
  assert.equal(afterSnap.countdownSeconds, null);
});

test('generateAzureBlobReadSas creates signed query with valid parameters', () => {
  const accountKey = Buffer.from('dummy_account_key_12345678901234567890123456789012').toString('base64');
  const fixedNow = new Date('2026-11-05T12:00:00.000Z');
  const sas = generateAzureBlobReadSas(
    'myaccount',
    accountKey,
    'mycontainer',
    'movie.mp4',
    60,
    fixedNow
  );

  const params = new URLSearchParams(sas);
  assert.equal(params.get('sv'), '2023-11-03');
  assert.equal(params.get('sr'), 'b');
  assert.equal(params.get('sp'), 'r');
  assert.equal(params.get('spr'), 'https');
  assert.ok(params.get('sig'));
  assert.equal(params.get('st'), '2026-11-05T11:55:00Z');
  assert.equal(params.get('se'), '2026-11-05T13:00:00Z');
});

test('resolveStreamUrl formats URL appropriately', () => {
  // Direct HTTPS URL without change
  const direct = 'https://example.com/video.mp4';
  assert.equal(resolveStreamUrl(direct, {}), direct);

  // Relative path with Azure container URL
  const env = {
    AZURE_STORAGE_CONTAINER_URL: 'https://storageaccount.blob.core.windows.net/videos',
    AZURE_STORAGE_SAS_TOKEN: 'sp=r&sig=test',
  };
  assert.equal(
    resolveStreamUrl('intro.mp4', env),
    'https://storageaccount.blob.core.windows.net/videos/intro.mp4?sp=r&sig=test'
  );

  // Full Azure URL signed automatically when account key matches
  const dummyKey = Buffer.from('dummy_account_key_12345678901234567890123456789012').toString('base64');
  const fullAzureUrl = 'https://myaccount.blob.core.windows.net/videos/intro.mp4';
  const signed = resolveStreamUrl(fullAzureUrl, {
    AZURE_STORAGE_ACCOUNT_NAME: 'myaccount',
    AZURE_STORAGE_ACCOUNT_KEY: dummyKey,
  });
  assert.ok(signed.startsWith('https://myaccount.blob.core.windows.net/videos/intro.mp4?'));
  assert.ok(signed.includes('sp=r'));
  assert.ok(signed.includes('sr=b'));
});

test('Watch Room REST lifecycle: create, get, host control, and danmaku', async () => {
  const db = database('file::memory:');
  await initializeLocal(db);
  await initializeWatchRooms(db);

  // Create an admin user for testing
  const adminId = uuid();
  await execute(
    db,
    `INSERT INTO app_users (id, email, password_hash, display_name, role)
     VALUES (?, 'admin@example.com', 'hash', 'Admin', 'ADMIN')`,
    [adminId]
  );

  const jwtSecret = randomBytes(32).toString('base64');
  const config = {
    production: false,
    publicOrigin: 'http://localhost:4200',
    proxySecret: '',
    jwtSecret,
    googleClientId: '',
    googleClientSecret: '',
    googleEnabled: false,
    resetEnabled: false,
    resendKey: '',
    mailFrom: '',
  };

  const hub = createWatchRoomHub(db);
  const { app } = createApp(db, config, null, undefined, null, null, hub, {});

  // Issue test admin cookie
  const authRes = await app.request('/api/v1/auth/csrf');
  const cookies = authRes.headers.get('set-cookie') || '';
  const xsrfMatch = cookies.match(/XSRF-TOKEN=([^;]+)/);
  const xsrfToken = xsrfMatch ? xsrfMatch[1] : '';

  // Generate valid JWT token for admin
  const { SignJWT } = await import('jose');
  const jwt = await new SignJWT({ ver: 0 })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(adminId)
    .setIssuer('exe-web-api')
    .setAudience('exe-web')
    .setJti(uuid())
    .setIssuedAt()
    .setExpirationTime('30m')
    .sign(Buffer.from(jwtSecret, 'base64'));

  const adminHeaders = {
    Cookie: `AUTH_TOKEN=${jwt}; XSRF-TOKEN=${xsrfToken}`,
    'X-XSRF-TOKEN': xsrfToken,
    'Content-Type': 'application/json',
  };

  // 1. Create Watch Room (POST /api/v1/admin/watch-rooms)
  const createRes = await app.request('/api/v1/admin/watch-rooms', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      title: 'Đêm Chiếu Phim Anime',
      videoSource: 'https://example.com/anime.mp4',
      videoDuration: 1800,
      mode: 'HOST_TRIGGER',
    }),
  });

  assert.equal(createRes.status, 201);
  const roomData = await createRes.json();
  assert.ok(roomData.id.startsWith('room_'));
  assert.ok(roomData.hostToken);
  assert.equal(roomData.title, 'Đêm Chiếu Phim Anime');

  // 2. Public View Room (GET /api/v1/watch-rooms/:id) - no auth header required
  const getRes = await app.request(`/api/v1/watch-rooms/${roomData.id}`);
  assert.equal(getRes.status, 200);
  const getBody = await getRes.json();
  assert.equal(getBody.id, roomData.id);
  assert.equal(getBody.title, 'Đêm Chiếu Phim Anime');
  assert.equal(getBody.status, 'LOBBY');
  assert.equal(getBody.streamUrl, 'https://example.com/anime.mp4');

  // 3. Host Control: START (POST /api/v1/watch-rooms/:id/control)
  const startRes = await app.request(`/api/v1/watch-rooms/${roomData.id}/control`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Host-Token': roomData.hostToken,
    },
    body: JSON.stringify({
      action: 'START',
      hostToken: roomData.hostToken,
    }),
  });
  assert.equal(startRes.status, 200);
  const startBody = await startRes.json();
  assert.equal(startBody.snapshot.status, 'PLAYING');

  // 4. Host Control: PAUSE
  const pauseRes = await app.request(`/api/v1/watch-rooms/${roomData.id}/control`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Host-Token': roomData.hostToken,
    },
    body: JSON.stringify({
      action: 'PAUSE',
      hostToken: roomData.hostToken,
    }),
  });
  assert.equal(pauseRes.status, 200);
  const pauseBody = await pauseRes.json();
  assert.equal(pauseBody.snapshot.status, 'PAUSED');

  // 5. Host Control: Unauthorized rejected with 403
  const badControlRes = await app.request(`/api/v1/watch-rooms/${roomData.id}/control`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Host-Token': 'invalid_token',
    },
    body: JSON.stringify({
      action: 'START',
      hostToken: 'invalid_token',
    }),
  });
  assert.equal(badControlRes.status, 403);

  // 6. Danmaku list initially empty
  const danmakuRes = await app.request(`/api/v1/watch-rooms/${roomData.id}/danmaku`);
  assert.equal(danmakuRes.status, 200);
  const danmakuList = await danmakuRes.json();
  assert.equal(danmakuList.length, 0);

  hub.close();
  db.close();
});

test('Watch Room WebSocket: join, ping/pong, danmaku broadcasting and host control', async () => {
  const { createServer } = await import('node:http');
  const { WebSocket } = await import('ws');

  const db = database('file::memory:');
  await initializeLocal(db);
  await initializeWatchRooms(db);

  const hub = createWatchRoomHub(db);
  const roomId = 'room_wstest123';
  const hostToken = 'host_secret_token_abc';

  await execute(
    db,
    `INSERT INTO watch_rooms (id, title, video_source, video_duration, mode, status, host_token, current_position, created_at, updated_at)
     VALUES (?, 'WS Test Room', 'https://example.com/test.mp4', 600, 'HOST_TRIGGER', 'LOBBY', ?, 0, datetime('now'), datetime('now'))`,
    [roomId, hostToken]
  );

  const server = createServer();
  hub.attachHttpServer(server);

  await new Promise<void>(resolve => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  assert.ok(port > 0);

  const wsClient = new WebSocket(`ws://127.0.0.1:${port}/ws/room`);
  await new Promise<void>((resolve, reject) => {
    wsClient.once('open', resolve);
    wsClient.once('error', reject);
  });

  // 1. Send Ping -> expect Pong
  const pingPromise = new Promise<any>(resolve => {
    const handler = (data: Buffer | string) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'pong') {
        wsClient.off('message', handler);
        resolve(msg);
      }
    };
    wsClient.on('message', handler);
  });
  wsClient.send(JSON.stringify({ type: 'ping', t0: 123456789 }));
  const pongMsg = await pingPromise;
  assert.equal(pongMsg.type, 'pong');
  assert.equal(pongMsg.t0, 123456789);
  assert.ok(pongMsg.serverTime > 0);

  // 2. Send Join -> expect room_snapshot
  const joinPromise = new Promise<any>(resolve => {
    const handler = (data: Buffer | string) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'room_snapshot') {
        wsClient.off('message', handler);
        resolve(msg);
      }
    };
    wsClient.on('message', handler);
  });
  wsClient.send(JSON.stringify({
    type: 'join',
    roomId,
    nickname: 'TestViewer',
    hostToken,
  }));
  const snapshotMsg = await joinPromise;
  assert.equal(snapshotMsg.type, 'room_snapshot');
  assert.equal(snapshotMsg.room.id, roomId);
  assert.equal(snapshotMsg.isHost, true);
  assert.equal(snapshotMsg.viewerCount, 1);

  // 3. Send Danmaku -> expect danmaku:new broadcast
  const danmakuPromise = new Promise<any>(resolve => {
    const handler = (data: Buffer | string) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'danmaku:new') {
        wsClient.off('message', handler);
        resolve(msg);
      }
    };
    wsClient.on('message', handler);
  });
  wsClient.send(JSON.stringify({
    type: 'danmaku:send',
    text: 'Bilibili style test danmaku! 23333',
    timeOffset: 12.5,
    color: '#00e5ff',
  }));
  const newDanmakuMsg = await danmakuPromise;
  assert.equal(newDanmakuMsg.type, 'danmaku:new');
  assert.equal(newDanmakuMsg.danmaku.nickname, 'TestViewer');
  assert.equal(newDanmakuMsg.danmaku.text, 'Bilibili style test danmaku! 23333');
  assert.equal(newDanmakuMsg.danmaku.timeOffset, 12.5);
  assert.equal(newDanmakuMsg.danmaku.color, '#00e5ff');

  // 4. Host control via WS -> expect sync broadcast
  const syncPromise = new Promise<any>(resolve => {
    const handler = (data: Buffer | string) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'sync') {
        wsClient.off('message', handler);
        resolve(msg);
      }
    };
    wsClient.on('message', handler);
  });
  wsClient.send(JSON.stringify({
    type: 'host:control',
    action: 'START',
  }));
  const syncMsg = await syncPromise;
  assert.equal(syncMsg.type, 'sync');
  assert.equal(syncMsg.action, 'START');
  assert.equal(syncMsg.snapshot.status, 'PLAYING');

  wsClient.close();
  hub.close();
  server.close();
  db.close();
});

test('cleanNickname trims, strips control characters and rejects empty names', () => {
  assert.equal(cleanNickname('  Đỏ   Siêu\tNhân  '), 'Đỏ Siêu Nhân');
  assert.equal(cleanNickname('A\u0000B\u200bC'), 'ABC');
  assert.equal(cleanNickname('   '), null);
  assert.equal(cleanNickname(''), null);
  assert.equal(cleanNickname(42), null);
  assert.equal(cleanNickname('x'.repeat(50))?.length, 32);
});

test('Watch Room WebSocket: name required, live viewer list and rename', async () => {
  const { createServer } = await import('node:http');
  const { WebSocket } = await import('ws');
  const db = database('file::memory:');
  await initializeLocal(db);
  await initializeWatchRooms(db);
  const hub = createWatchRoomHub(db);
  const roomId = 'room_viewers123';
  const hostToken = 'host_token_viewers';
  await execute(
    db,
    `INSERT INTO watch_rooms (id, title, video_source, video_duration, mode, status, host_token, current_position, created_at, updated_at)
     VALUES (?, 'Viewer Room', 'https://example.com/v.mp4', 600, 'HOST_TRIGGER', 'LOBBY', ?, 0, datetime('now'), datetime('now'))`,
    [roomId, hostToken]
  );
  const server = createServer();
  hub.attachHttpServer(server);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  type Msg = Record<string, any>;
  const open = async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/room`);
    const inbox: Msg[] = [];
    ws.on('message', (d: Buffer | string) => inbox.push(JSON.parse(d.toString())));
    await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    const next = (pred: (m: Msg) => boolean) => new Promise<Msg>((resolve, reject) => {
      const deadline = Date.now() + 3000;
      const tick = () => {
        const i = inbox.findIndex(pred);
        if (i >= 0) return resolve(inbox.splice(i, 1)[0]!);
        if (Date.now() > deadline) return reject(new Error('timeout waiting for message'));
        setTimeout(tick, 10);
      };
      tick();
    });
    return { ws, next, clear: () => { inbox.length = 0; } };
  };
  const sockets: Array<{ ws: InstanceType<typeof WebSocket> }> = [];
  try {

  // A blank name is refused and the socket is not counted.
  const anon = await open(); sockets.push(anon);
  anon.ws.send(JSON.stringify({ type: 'join', roomId, nickname: '   ' }));
  const refused = await anon.next(m => m.type === 'error');
  assert.equal(refused.code, 'NICKNAME_REQUIRED');
  assert.equal(hub.getViewerCount(roomId), 0);

  // Host joins, then a viewer: both see the list with the host first.
  const host = await open(); sockets.push(host);
  host.ws.send(JSON.stringify({ type: 'join', roomId, nickname: 'Đỏ', hostToken }));
  const hostSnap = await host.next(m => m.type === 'room_snapshot');
  assert.equal(hostSnap.nickname, 'Đỏ');
  assert.match(hostSnap.viewerId, /^[0-9a-f]{12}$/);

  const viewer = await open(); sockets.push(viewer);
  viewer.ws.send(JSON.stringify({ type: 'join', roomId, nickname: '  Xanh  ' }));
  await viewer.next(m => m.type === 'room_snapshot');
  const list = await host.next(m => m.type === 'viewer_count' && m.count === 2);
  assert.deepEqual(list.viewers.map((v: Msg) => [v.nickname, v.isHost]), [['Đỏ', true], ['Xanh', false]]);
  assert.equal(Object.keys(list.viewers[0]).sort().join(','), 'id,isHost,nickname');

  // Rename updates the list and later danmaku authorship.
  viewer.ws.send(JSON.stringify({ type: 'rename', nickname: 'Xanh Lá' }));
  assert.equal((await viewer.next(m => m.type === 'renamed')).nickname, 'Xanh Lá');
  const renamed = await host.next(m => m.type === 'viewer_count' && m.viewers.some((v: Msg) => v.nickname === 'Xanh Lá'));
  assert.equal(renamed.count, 2);
  viewer.ws.send(JSON.stringify({ type: 'danmaku:send', text: 'chào cả nhà', timeOffset: 1 }));
  assert.equal((await host.next(m => m.type === 'danmaku:new')).danmaku.nickname, 'Xanh Lá');
  viewer.ws.send(JSON.stringify({ type: 'rename', nickname: ' ' }));
  assert.equal((await viewer.next(m => m.type === 'error')).code, 'NICKNAME_REQUIRED');

  // Leaving removes the viewer from everyone's list.
  host.clear();
  viewer.ws.close();
  const after = await host.next(m => m.type === 'viewer_count' && m.count === 1);
  assert.deepEqual(after.viewers.map((v: Msg) => v.nickname), ['Đỏ']);
  assert.deepEqual(hub.getViewers(roomId).map(v => v.nickname), ['Đỏ']);

  } finally {
    for (const s of sockets) s.ws.terminate();
    hub.close();
    server.close();
    db.close();
  }
});
