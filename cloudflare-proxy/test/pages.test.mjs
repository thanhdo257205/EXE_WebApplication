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
