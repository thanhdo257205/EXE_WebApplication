import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pages from '../../cloudflare-pages/worker.js';
import { handle } from '../src/index.ts';

/** Pages applies public/_headers at the platform level, so the file itself is the only offline check. */
const headerRules = () => readFileSync(new URL('../../frontend/public/_headers', import.meta.url), 'utf8')
  .split('\n')
  .filter(line => line.trim() && !/^\s*#/.test(line))
  .reduce((rules, line) => {
    if (/^\s/.test(line)) {
      const [name, ...value] = line.trim().split(':');
      rules.at(-1).headers.push([name.trim(), value.join(':').trim()]);
      return rules;
    }
    rules.push({ path: line.trim(), headers: [] });
    return rules;
  }, []);

test('every SPA document is served with a deny-framing policy', () => {
  const document = headerRules().find(rule => rule.path === '/*');
  assert.ok(document, 'public/_headers must declare a /* rule; the SPA fallback serves index.html for every route');
  const headers = new Map(document.headers);
  assert.match(headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
  assert.equal(headers.get('X-Frame-Options'), 'DENY');
  assert.equal(headers.get('Referrer-Policy'), 'no-referrer');
});

test('Pages routes uploaded and migrated card images to gateway, with no HTML fallback on failure', async () => {
  for (const path of ['/media/cards/a.webp', '/assets/cards/card-01.svg', '/assets/models/default-card-poster.webp']) {
    const req = new Request('https://exe-webapp.pages.dev' + path);
    const res = await pages.fetch(req, { GATEWAY: { fetch: async r => { assert.equal(r, req); return new Response('image'); } } });
    assert.equal(await res.text(), 'image');
    assert.equal((await pages.fetch(req, {})).status, 503);
  }
});

test('Pages API preserves browser identity and request through internal gateway binding', async () => {
  const request = new Request('https://exe-webapp.pages.dev/api/v1/info', { headers: { Origin: 'https://exe-webapp.pages.dev', 'CF-Connecting-IP': '192.0.2.1' } });
  const limiter = { limit: async () => ({ success: true }) };
  const response = await pages.fetch(request, { GATEWAY: { fetch: req => handle(req, {
    PUBLIC_ORIGIN: 'https://exe-webapp.pages.dev', FRONTEND_ORIGIN: 'https://exe-webapp.pages.dev',
    BACKEND_ORIGIN: 'https://backend.example.test', ORIGIN_PROXY_SECRET: 'test-secret-at-least-thirty-two-characters',
    API_LIMITER: limiter, LOGIN_LIMITER: limiter, ACCOUNT_LIMITER: limiter,
  }, async (url, options) => {
    assert.equal(url.hostname, 'backend.example.test');
    assert.equal(options.headers.get('X-Forwarded-Host'), 'exe-webapp.pages.dev');
    return new Response('backend');
  }) } });
  assert.equal(await response.text(), 'backend');
});

test('Pages serves static requests from assets and fails closed when gateway is unavailable', async () => {
  const response = await pages.fetch(new Request('https://exe-webapp.pages.dev/'), { ASSETS: { fetch: async () => new Response('static') } });
  assert.equal(await response.text(), 'static');
  const failed = await pages.fetch(new Request('https://exe-webapp.pages.dev/api/v1/auth/login'), {});
  assert.equal(failed.status, 503);
});

test('Pages routes WebSocket handshakes to the gateway and preserves the upgrade response', async () => {
  const request = new Request('https://exe-webapp.pages.dev/ws/room', { headers: { Upgrade: 'websocket', Origin: 'https://exe-webapp.pages.dev' } });
  const upgrade = { status: 101, webSocket: {} };
  const response = await pages.fetch(request, { GATEWAY: { fetch: async req => { assert.equal(req, request); return upgrade; } } });
  assert.equal(response, upgrade);
  assert.equal((await pages.fetch(request, {})).status, 503);
  const prepare = readFileSync(new URL('../../.github/scripts/prepare-pages.mjs', import.meta.url), 'utf8');
  assert.ok(prepare.includes("'/ws/*'"));
});

// --- Link previews for /room/:id (Zalo, Facebook, Messenger read meta tags without running JS) ---
import { roomPreview, injectRoomMeta } from '../../cloudflare-pages/worker.js';

const INDEX = '<!doctype html><html><head>\n  <meta charset="utf-8">\n  <title>Nhà Này Hơi Báo! — Board Game Wiki</title>\n  <meta name="description" content="Website giới thiệu">\n</head><body><app-root></app-root></body></html>';
const assets = { fetch: async () => new Response(INDEX, { headers: { 'Content-Type': 'text/html; charset=utf-8', ETag: '"abc"' } }) };

test('room links preview the film title and the premiere time in Vietnam time', async () => {
  const seen = [];
  const gateway = { fetch: async req => { seen.push(req); return Response.json({
    id: 'room_lwqyjjyo5hs', title: 'Nên chờ hay nên quên', mode: 'SCHEDULED', scheduledAt: '2026-11-05T16:57:00.000Z',
    status: 'LOBBY', snapshot: { status: 'LOBBY' }, viewerCount: 1, streamUrl: 'https://secret.example/v.mp4?sig=x',
  }); } };
  const request = new Request('https://exe-webapp.pages.dev/room/room_lwqyjjyo5hs', { headers: { Cookie: 'session=abc', 'CF-Connecting-IP': '192.0.2.7' } });
  const response = await pages.fetch(request, { ASSETS: assets, GATEWAY: gateway });
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /<title>Nên chờ hay nên quên — 5 anh em siêu nhân<\/title>/);
  assert.match(html, /<meta property="og:title" content="Nên chờ hay nên quên — 5 anh em siêu nhân">/);
  assert.match(html, /<meta property="og:description" content="Công chiếu lúc 23:57 ngày 05\/11 \(giờ Việt Nam\)\./);
  assert.match(html, /<meta name="description" content="Công chiếu lúc 23:57/);
  assert.match(html, /<meta property="og:image" content="https:\/\/exe-webapp\.pages\.dev\/assets\/images\/room-share\.jpg">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/exe-webapp\.pages\.dev\/room\/room_lwqyjjyo5hs">/);
  assert.equal(html.match(/<title>/g).length, 1);
  assert.ok(!html.includes('secret.example'), 'stream URL must not leak into the page');
  assert.equal(response.headers.get('Cache-Control'), 'no-cache');
  assert.equal(response.headers.get('ETag'), null);
  // Internal call: same-origin GET of the public info, caller IP kept for rate limits, cookies not forwarded.
  assert.equal(seen.length, 1);
  assert.equal(new URL(seen[0].url).pathname, '/api/v1/watch-rooms/room_lwqyjjyo5hs');
  assert.equal(seen[0].headers.get('Origin'), 'https://exe-webapp.pages.dev');
  assert.equal(seen[0].headers.get('CF-Connecting-IP'), '192.0.2.7');
  assert.equal(seen[0].headers.get('Cookie'), null);
});

test('room previews escape the title and describe playing/ended rooms', () => {
  const html = injectRoomMeta(INDEX, roomPreview({ title: 'Phim "hay" <script>alert(1)</script>', mode: 'HOST_TRIGGER', status: 'PLAYING', snapshot: { status: 'PLAYING' }, viewerCount: 3 }), 'https://exe-webapp.pages.dev/room/room_abcd');
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.match(html, /Phim &quot;hay&quot; &lt;script&gt;/);
  assert.match(html, /Đang công chiếu · 3 người đang xem\./);
  assert.match(roomPreview({ title: 'X', status: 'ENDED', snapshot: { status: 'ENDED' } }).description, /đã kết thúc/);
  assert.match(roomPreview({ title: 'X', mode: 'HOST_TRIGGER', status: 'LOBBY' }).description, /^Sắp công chiếu\./);
});

test('room page still loads with a generic preview when the room is missing or the API is down', async () => {
  for (const gateway of [{ fetch: async () => Response.json({ code: 'ROOM_NOT_FOUND' }, { status: 404 }) }, { fetch: async () => { throw new Error('down'); } }]) {
    const response = await pages.fetch(new Request('https://exe-webapp.pages.dev/room/room_missing1'), { ASSETS: assets, GATEWAY: gateway });
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /<title>Phòng chiếu chung — 5 anh em siêu nhân<\/title>/);
    assert.match(html, /<app-root><\/app-root>/);
  }
});

test('only /room/<id> pages are rewritten; /room and other routes keep the static document', async () => {
  for (const path of ['/room', '/room/', '/wiki', '/room/not-a-room-id']) {
    let called = false;
    const response = await pages.fetch(new Request('https://exe-webapp.pages.dev' + path), { ASSETS: assets, GATEWAY: { fetch: async () => { called = true; return new Response('x'); } } });
    assert.match(await response.text(), /<title>Nhà Này Hơi Báo! — Board Game Wiki<\/title>/, path);
    assert.equal(called, false, path);
  }
  const prepare = readFileSync(new URL('../../.github/scripts/prepare-pages.mjs', import.meta.url), 'utf8');
  assert.ok(prepare.includes("'/room/*'"), 'Pages must run the worker for room pages');
});
