import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { database, initializeLocal, execute, all } from '../src/db.ts';
import { createWatchRoomHub, initializeWatchRooms } from '../src/watch-rooms.ts';

async function fixture(t: TestContext, config?: Parameters<typeof createWatchRoomHub>[1]) {
  const db = database('file::memory:');
  await initializeLocal(db); await initializeWatchRooms(db);
  const hub = createWatchRoomHub(db, config), server = createServer();
  hub.attachHttpServer(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const url = `ws://127.0.0.1:${address.port}/ws/room`;
  t.after(async () => { hub.close(); await new Promise<void>(resolve => server.close(() => resolve())); db.close(); });
  async function room(id: string, scheduledAt: string | null = null) {
    await execute(db, `INSERT INTO watch_rooms(id,title,video_source,video_duration,mode,scheduled_at,host_token)
      VALUES(?,?,'test.mp4',600,?,?,?)`, [id, id, scheduledAt ? 'SCHEDULED' : 'HOST_TRIGGER', scheduledAt, `secret-${id}`]);
  }
  async function connect() {
    const ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    return ws;
  }
  return { db, hub, url, room, connect };
}

function next(ws: WebSocket, matches: (message: any) => boolean): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.off('message', receive); reject(new Error('Expected room event did not arrive')); }, 4500);
    function receive(data: any) {
      const message = JSON.parse(data.toString());
      if (matches(message)) { clearTimeout(timer); ws.off('message', receive); resolve(message); }
    }
    ws.on('message', receive);
  });
}

async function exchange(ws: WebSocket, payload: object, type: string) {
  const reply = next(ws, message => message.type === type);
  ws.send(JSON.stringify(payload));
  return reply;
}

test('waiting viewers chat and receive scheduled PLAYING without a new join or GET', async t => {
  const f = await fixture(t);
  await f.room('premiere', new Date(Date.now() + 1800).toISOString());
  const host = await f.connect(), viewer = await f.connect();
  assert.equal((await exchange(host, { type: 'join', roomId: 'premiere', nickname: 'Chủ phòng', hostToken: 'secret-premiere' }, 'room_snapshot')).snapshot.status, 'LOBBY');
  await exchange(viewer, { type: 'join', roomId: 'premiere', nickname: 'Người xem' }, 'room_snapshot');
  const received = next(viewer, m => m.type === 'danmaku:new');
  const sent = await exchange(host, { type: 'danmaku:send', text: 'Chờ công chiếu', timeOffset: 99999 }, 'danmaku:new');
  assert.equal(sent.danmaku.phase, 'LOBBY');
  assert.equal(sent.danmaku.timeOffset, 0);
  assert.equal((await received).danmaku.id, sent.danmaku.id);
  const started = await next(viewer, m => m.type === 'sync' && m.snapshot.status === 'PLAYING');
  assert.ok(started.snapshot.position >= 0 && started.snapshot.position < 4);
  const paused = await exchange(host, { type: 'host:control', action: 'PAUSE' }, 'sync');
  // Periodic ticks can arrive before the explicit command response.
  const pauseState = paused.action === 'PAUSE' ? paused : await next(host, m => m.type === 'sync' && m.action === 'PAUSE');
  assert.equal(pauseState.snapshot.status, 'PAUSED');
  const entry = (await all(f.db, 'SELECT phase FROM room_danmaku'))[0];
  assert.equal(entry.phase, 'LOBBY');
});

test('room switching clears host privilege and old membership, including queued joins', async t => {
  const f = await fixture(t); await f.room('A'); await f.room('B');
  const ws = await f.connect();
  assert.equal((await exchange(ws, { type: 'join', roomId: 'A', nickname: 'Khách A', hostToken: 'secret-A' }, 'room_snapshot')).isHost, true);
  assert.equal((await exchange(ws, { type: 'join', roomId: 'B', nickname: 'Khách A' }, 'room_snapshot')).isHost, false);
  assert.equal(f.hub.getViewerCount('A'), 0);
  assert.equal(f.hub.getViewerCount('B'), 1);
  assert.equal((await exchange(ws, { type: 'host:control', action: 'START' }, 'error')).code, 'HOST_REQUIRED');
  assert.equal((await exchange(ws, { type: 'host:delete_danmaku', danmakuId: 'any' }, 'error')).code, 'HOST_REQUIRED');
});

test('WebSocket upgrades enforce production gateway proof and browser origin', async t => {
  const secret = 'a-production-proxy-secret-at-least-32-characters';
  const f = await fixture(t, { production: true, publicOrigin: 'https://app.example', proxySecret: secret });
  async function rejected(headers: Record<string, string>) {
    return new Promise<number>((resolve, reject) => {
      const ws = new WebSocket(f.url, { headers });
      ws.once('unexpected-response', (_req, response) => { response.resume(); ws.terminate(); resolve(response.statusCode!); });
      ws.on('error', () => {});
      ws.once('open', () => { ws.terminate(); reject(new Error('Unauthorized upgrade accepted')); });
    });
  }
  assert.equal(await rejected({ Origin: 'https://app.example' }), 403);
  assert.equal(await rejected({ Origin: 'https://evil.example', 'X-Origin-Verify': secret }), 403);
  const ws = new WebSocket(f.url, { headers: { Origin: 'https://app.example', 'X-Origin-Verify': secret } });
  await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  assert.equal((await exchange(ws, { type: 'ping', t0: 10 }, 'pong')).t0, 10);
});

test('phase migration preserves existing danmaku and remains idempotent', async t => {
  const f = await fixture(t); await f.room('migration');
  await execute(f.db, 'ALTER TABLE room_danmaku DROP COLUMN phase');
  await execute(f.db, "INSERT INTO room_danmaku(id,room_id,user_nickname,text,time_offset) VALUES('old','migration','guest','hello',12)");
  await initializeWatchRooms(f.db); await initializeWatchRooms(f.db);
  assert.equal((await all(f.db, "SELECT phase FROM room_danmaku WHERE id='old'"))[0].phase, 'VIDEO');
});
