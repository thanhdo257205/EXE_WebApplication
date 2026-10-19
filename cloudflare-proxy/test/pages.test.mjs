import { test } from 'node:test';
import assert from 'node:assert/strict';
import pages from '../../cloudflare-pages/worker.js';
import { handle } from '../src/index.ts';

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
