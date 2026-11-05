import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyReschedule, computePlaybackState, createWatchRoomHub, initializeWatchRooms, MAX_SCHEDULE_AHEAD_MS } from '../src/watch-rooms.ts';
import { all, database, execute, initializeLocal } from '../src/db.ts';

async function setup() {
  const db = database('file::memory:');
  await initializeLocal(db);
  await initializeWatchRooms(db);
  const insert = (id: string, mode: string, status: string, scheduledAt: string | null, startedAt: string | null = null) => execute(db,
    `INSERT INTO watch_rooms (id, title, video_source, video_duration, mode, status, host_token, current_position, started_at, scheduled_at, created_at, updated_at)
     VALUES (?, 'T', 'https://example.com/v.mp4', 600, ?, ?, 'tok', 0, ?, ?, datetime('now'), datetime('now'))`, [id, mode, status, startedAt, scheduledAt]);
  const row = async (id: string) => (await all(db, 'SELECT * FROM watch_rooms WHERE id = ?', [id]))[0] as any;
  return { db, insert, row };
}

test('host can move a waiting premiere earlier or later, and a host-trigger lobby becomes scheduled', async () => {
  const { db, insert, row } = await setup();
  const now = Date.parse('2026-11-05T15:00:00Z');
  await insert('s', 'SCHEDULED', 'LOBBY', new Date(now + 3600e3).toISOString());
  const later = await applyReschedule(db, await row('s'), new Date(now + 2 * 3600e3).toISOString(), now);
  assert.ok(later.ok);
  assert.equal(later.ok && later.snapshot.countdownSeconds, 7200);
  assert.equal((await row('s')).scheduled_at, new Date(now + 2 * 3600e3).toISOString());

  await insert('h', 'HOST_TRIGGER', 'LOBBY', null);
  const scheduled = await applyReschedule(db, await row('h'), new Date(now + 300e3).toISOString(), now);
  assert.ok(scheduled.ok);
  assert.equal((await row('h')).mode, 'SCHEDULED');
  assert.equal(scheduled.ok && scheduled.snapshot.status, 'LOBBY');
  db.close();
});

test('"start now" (a time at now or a few seconds before) starts the film at 0', async () => {
  const { db, insert, row } = await setup();
  const now = Date.parse('2026-11-05T15:00:00Z');
  await insert('s', 'SCHEDULED', 'LOBBY', new Date(now + 600e3).toISOString());
  const result = await applyReschedule(db, await row('s'), new Date(now - 3000).toISOString(), now);
  assert.ok(result.ok);
  assert.equal(result.ok && result.snapshot.status, 'PLAYING');
  assert.equal(result.ok && result.snapshot.position, 0);
  assert.equal(computePlaybackState(await row('s'), now + 5000).position, 5);
  db.close();
});

test('rescheduling is refused once the film started, in the past or too far ahead', async () => {
  const { db, insert, row } = await setup();
  const now = Date.parse('2026-11-05T15:00:00Z');
  // Scheduled premiere whose time already passed: computed PLAYING although the row still says LOBBY.
  await insert('live', 'SCHEDULED', 'LOBBY', new Date(now - 60e3).toISOString());
  const live = await applyReschedule(db, await row('live'), new Date(now + 600e3).toISOString(), now);
  assert.deepEqual(live, { ok: false, status: 409, code: 'ALREADY_STARTED' });
  await insert('play', 'HOST_TRIGGER', 'PLAYING', null, new Date(now - 10e3).toISOString());
  assert.equal((await applyReschedule(db, await row('play'), new Date(now + 600e3).toISOString(), now)).ok, false);

  await insert('s', 'SCHEDULED', 'LOBBY', new Date(now + 600e3).toISOString());
  assert.deepEqual(await applyReschedule(db, await row('s'), new Date(now - 60e3).toISOString(), now), { ok: false, status: 400, code: 'INVALID_SCHEDULE' });
  assert.deepEqual(await applyReschedule(db, await row('s'), new Date(now + MAX_SCHEDULE_AHEAD_MS + 1).toISOString(), now), { ok: false, status: 400, code: 'INVALID_SCHEDULE' });
  assert.deepEqual(await applyReschedule(db, await row('s'), 'not-a-date', now), { ok: false, status: 400, code: 'INVALID_SCHEDULE' });
  assert.equal((await row('s')).scheduled_at, new Date(now + 600e3).toISOString());
  db.close();
});

test('WebSocket host:reschedule is host-only and broadcasts the new time to everyone', async () => {
  const { createServer } = await import('node:http');
  const { WebSocket } = await import('ws');
  const { db, insert } = await setup();
  await insert('room_sched', 'SCHEDULED', 'LOBBY', new Date(Date.now() + 3600e3).toISOString());
  const hub = createWatchRoomHub(db);
  const server = createServer();
  hub.attachHttpServer(server);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const sockets: InstanceType<typeof WebSocket>[] = [];
  const open = async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/room`); sockets.push(ws);
    const inbox: any[] = [];
    ws.on('message', (d: Buffer | string) => inbox.push(JSON.parse(d.toString())));
    await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    const next = (pred: (m: any) => boolean) => new Promise<any>((resolve, reject) => {
      const deadline = Date.now() + 3000;
      const tick = () => { const i = inbox.findIndex(pred); if (i >= 0) return resolve(inbox.splice(i, 1)[0]); if (Date.now() > deadline) return reject(new Error('timeout')); setTimeout(tick, 10); };
      tick();
    });
    return { ws, next };
  };
  try {
    const host = await open(), viewer = await open();
    host.ws.send(JSON.stringify({ type: 'join', roomId: 'room_sched', nickname: 'Chủ', hostToken: 'tok' }));
    await host.next(m => m.type === 'room_snapshot');
    viewer.ws.send(JSON.stringify({ type: 'join', roomId: 'room_sched', nickname: 'Khách' }));
    await viewer.next(m => m.type === 'room_snapshot');

    const target = new Date(Date.now() + 1800e3).toISOString();
    viewer.ws.send(JSON.stringify({ type: 'host:reschedule', scheduledAt: target }));
    assert.equal((await viewer.next(m => m.type === 'error')).code, 'HOST_REQUIRED');

    host.ws.send(JSON.stringify({ type: 'host:reschedule', scheduledAt: target }));
    const seen = await viewer.next(m => m.type === 'schedule');
    assert.equal(seen.room.scheduledAt, target);
    assert.equal(seen.snapshot.status, 'LOBBY');
    assert.ok(seen.snapshot.countdownSeconds > 1790 && seen.snapshot.countdownSeconds <= 1800);
  } finally {
    for (const ws of sockets) ws.terminate();
    hub.close();
    server.close();
    db.close();
  }
});
