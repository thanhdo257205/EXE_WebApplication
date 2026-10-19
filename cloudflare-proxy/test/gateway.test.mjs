import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/index.ts';

const ORIGIN = 'https://game.example.test';
const SECRET = 'test-only-origin-secret-at-least-32-characters';
function limiter(max = Infinity) {
  const counts = new Map();
  return { async limit({ key }) { const count = (counts.get(key) ?? 0) + 1; counts.set(key, count); return { success: count <= max }; } };
}
function environment(overrides = {}) {
  return {
    PUBLIC_ORIGIN: ORIGIN, BACKEND_ORIGIN: 'https://backend.example.test', FRONTEND_ORIGIN: 'https://frontend.example.test',
    ORIGIN_PROXY_SECRET: SECRET, TURNSTILE_SECRET_KEY: 'test-secret',
    API_LIMITER: limiter(), LOGIN_LIMITER: limiter(), ACCOUNT_LIMITER: limiter(), ...overrides,
  };
}
function browser(path = '/api/v1/info', options = {}) {
  const headers = new Headers({ 'CF-Connecting-IP': '192.0.2.1', 'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Mode': 'cors' });
  new Headers(options.headers).forEach((value, key) => headers.set(key, value));
  return new Request(ORIGIN + path, { ...options, headers });
}
function login(overrides = {}) {
  return browser('/api/v1/auth/login', {
    method: 'POST', body: JSON.stringify({ email: 'member@example.test', password: 'test-password' }),
    headers: { 'Origin': ORIGIN, 'Content-Type': 'application/json', 'X-Turnstile-Token': 'test-token', ...overrides },
  });
}
const noUpstream = async () => { assert.fail('Request must not reach upstream'); };

test('ordinary Postman request without browser context is rejected', async () => {
  const req = new Request(ORIGIN + '/api/v1/info', { headers: { 'CF-Connecting-IP': '192.0.2.1', 'User-Agent': 'PostmanRuntime/7' } });
  assert.equal((await handle(req, environment(), noUpstream)).status, 403);
});
test('foreign origin and missing write Origin are rejected', async () => {
  assert.equal((await handle(browser('/api/v1/info', { headers: { Origin: 'https://evil.test' } }), environment(), noUpstream)).status, 403);
  const req = login(); req.headers.delete('Origin');
  assert.equal((await handle(req, environment(), noUpstream)).status, 403);
});
test('API rate limit returns 429 and Retry-After without contacting backend', async () => {
  const env = environment({ API_LIMITER: limiter(1) });
  assert.equal((await handle(browser(), env, async () => new Response('{}'))).status, 200);
  const limited = await handle(browser(), env, noUpstream);
  assert.equal(limited.status, 429); assert.equal(limited.headers.get('Retry-After'), '60');
});
test('login IP and account limits are applied before authentication', async () => {
  assert.equal((await handle(login(), environment({ LOGIN_LIMITER: limiter(0) }), noUpstream)).status, 429);
  assert.equal((await handle(login(), environment({ ACCOUNT_LIMITER: limiter(0) }), noUpstream)).status, 429);
});
test('missing challenge and unavailable challenge configuration fail closed', async () => {
  const req = login(); req.headers.delete('X-Turnstile-Token');
  assert.equal((await handle(req, environment(), noUpstream)).status, 403);
  assert.equal((await handle(login(), environment({ TURNSTILE_SECRET_KEY: '' }), noUpstream)).status, 503);
});
test('Turnstile success must match hostname AND action', async () => {
  for (const result of [
    { success: false },
    { success: true, hostname: 'evil.test', action: 'login' },
    { success: true, hostname: 'game.example.test', action: 'different' },
  ]) {
    assert.equal((await handle(login(), environment(), async input => {
      assert.equal(String(input), 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
      return Response.json(result);
    })).status, 403);
  }
});
test('verified login forwards credentials and session cookies, strips spoofed trusted headers', async () => {
  let calls = 0;
  const response = await handle(login({ 'X-Origin-Verify': 'attacker', 'X-Forwarded-Host': 'evil.test' }), environment(), async (input, init) => {
    calls++;
    if (String(input).startsWith('https://challenges.cloudflare.com/')) {
      return Response.json({ success: true, hostname: 'game.example.test', action: 'login' });
    }
    assert.equal(String(input), 'https://backend.example.test/api/v1/auth/login');
    assert.equal(init.headers.get('X-Origin-Verify'), SECRET);
    assert.equal(init.headers.get('X-Forwarded-Host'), 'game.example.test');
    assert.equal(init.headers.get('X-Turnstile-Token'), null);
    assert.equal(init.redirect, 'manual');
    assert.equal(JSON.parse(new TextDecoder().decode(init.body)).email, 'member@example.test');
    return new Response('{}', { headers: { 'Set-Cookie': 'SESSION=test; HttpOnly; Secure; Path=/api', 'X-Origin-Verify': SECRET } });
  });
  assert.equal(calls, 2); assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Origin-Verify'), null);
  assert.match(response.headers.get('Set-Cookie'), /HttpOnly/);
});
test('session and CSRF header reach only the configured backend', async () => {
  const req = browser('/api/v1/auth/logout', { method: 'POST', headers: { Origin: ORIGIN, Cookie: 'SESSION=test', 'X-XSRF-TOKEN': 'csrf-test' } });
  const res = await handle(req, environment(), async (input, init) => {
    assert.equal(new URL(input).origin, 'https://backend.example.test');
    assert.equal(init.headers.get('Cookie'), 'SESSION=test');
    assert.equal(init.headers.get('X-XSRF-TOKEN'), 'csrf-test');
    return new Response(null, { status: 204 });
  });
  assert.equal(res.status, 204);
});
test('static page requests never forward cookies or secrets', async () => {
  const response = await handle(browser('/wiki', { headers: { Cookie: 'SESSION=private', 'X-Origin-Verify': SECRET } }), environment(), async (input, init) => {
    assert.equal(String(input), 'https://frontend.example.test/wiki');
    assert.equal(init.headers.get('Cookie'), null);
    assert.equal(init.headers.get('X-Origin-Verify'), null);
    return new Response('<html></html>');
  });
  assert.equal(response.status, 200);
});
test('OAuth callback navigation from Google is forwarded; Spring validates state', async () => {
  const req = browser('/api/v1/auth/oauth2/callback/google?code=test&state=test', { headers: { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate' } });
  assert.equal((await handle(req, environment(), async (input, init) => {
    assert.equal(init.headers.get('X-Origin-Verify'), SECRET);
    assert.equal(new URL(input).searchParams.get('state'), 'test');
    return new Response(null, { status: 302, headers: { Location: '/' } });
  })).status, 302);
});
test('oversized body is rejected, including without Content-Length', async () => {
  const req = browser('/api/v1/auth/login', { method: 'POST', headers: { Origin: ORIGIN }, body: 'x'.repeat(65537) });
  assert.equal((await handle(req, environment(), noUpstream)).status, 413);
});
test('upstream and limiter failures do not bypass protection', async () => {
  assert.equal((await handle(browser(), environment(), async () => { throw Error('offline'); })).status, 503);
  assert.equal((await handle(browser(), environment({ API_LIMITER: { async limit() { throw Error('offline'); } } }), noUpstream)).status, 503);
  assert.equal((await handle(browser(), environment({ ORIGIN_PROXY_SECRET: '' }), noUpstream)).status, 503);
});
test('browser headers can be forged: they are a filter, not authentication', async () => {
  const request = browser('/api/v1/auth/me', { headers: { 'User-Agent': 'PostmanRuntime/7' } });
  assert.equal((await handle(request, environment(), async () => new Response('{}', { status: 401 }))).status, 401);
});
