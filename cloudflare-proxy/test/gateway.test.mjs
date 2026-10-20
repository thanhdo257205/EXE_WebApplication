import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, reconcilePayments } from '../src/index.ts';

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

test('admin SSE passes chunks immediately with cookies, private headers and cancellation', async () => {
  let controller, cancelled=false;
  const body=new ReadableStream({ start(value) { controller=value; }, cancel() { cancelled=true; } });
  const request=browser('/api/v1/admin/notifications/stream', {headers:{Accept:'text/event-stream',Cookie:'AUTH_TOKEN=test-jwt'}});
  const response=await handle(request,environment(),async (input,init)=>{
    assert.equal(init.headers.get('Cookie'),'AUTH_TOKEN=test-jwt');
    assert.equal(init.headers.get('Accept'),'text/event-stream');
    assert.equal(init.headers.get('X-Origin-Verify'),SECRET);
    return new Response(body,{headers:{'Content-Type':'text/event-stream','X-Accel-Buffering':'no'}});
  });
  assert.equal(response.headers.get('Cache-Control'),'no-store, no-transform');
  assert.equal(response.headers.get('Content-Type'),'text/event-stream');
  const reader=response.body.getReader();
  controller.enqueue(new TextEncoder().encode('event:summary\ndata:{"unreadCount":1}\n\n'));
  assert.match(new TextDecoder().decode((await reader.read()).value),/unreadCount/);
  controller.enqueue(new TextEncoder().encode(':heartbeat\n\n'));
  assert.match(new TextDecoder().decode((await reader.read()).value),/heartbeat/);
  await reader.cancel();assert.equal(cancelled,true);
  assert.equal((await handle(browser('/api/v1/admin/notifications/stream'),environment(),async()=>new Response(null,{status:403}))).status,403);
});

test('OAuth navigation gets a cold-start budget and never replays authorization or callbacks', async () => {
  const original = AbortSignal.timeout;
  const budgets = [];
  AbortSignal.timeout = ms => { budgets.push(ms); return new AbortController().signal; };
  try {
    for (const path of ['/api/v1/auth/oauth2/authorization/google', '/api/v1/auth/oauth2/callback/google?code=one-use&state=state']) {
      let calls = 0;
      const response = await handle(browser(path), environment(), async () => { calls++; throw new Error('Origin not ready'); });
      assert.equal(response.status, 503);
      assert.equal(calls, 1);
    }
    await handle(browser('/api/v1/auth/config'), environment(), async () => Response.json({ google: true }));
    assert.deepEqual(budgets, [180000, 180000, 60000]);
  } finally { AbortSignal.timeout = original; }
});

function recovery(path, payload, headers = {}) {
  return browser(`/api/v1/auth/${path}`, { method: 'POST', body: JSON.stringify(payload),
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...headers } });
}

test('recovery applies IP and normalized email limits without leaking or requiring a login challenge', async () => {
  const request = () => recovery('forgot-password', { email: 'Member@example.test' });
  assert.equal((await handle(request(), environment({ LOGIN_LIMITER: limiter(0) }), noUpstream)).status, 429);
  const env = environment({ ACCOUNT_LIMITER: limiter(1) });
  const upstream = async (input, init) => {
    assert.equal(String(input), 'https://backend.example.test/api/v1/auth/forgot-password');
    assert.equal(init.headers.get('X-Origin-Verify'), SECRET);
    return Response.json({ message: 'Generic acknowledgement' }, { status: 202 });
  };
  assert.equal((await handle(request(), env, upstream)).status, 202);
  assert.equal((await handle(recovery('forgot-password', { email: ' member@EXAMPLE.test ' }), env, noUpstream)).status, 429);
});

test('reset validates payload, preserves JWT and CSRF cookies, and requires same origin', async () => {
  const payload = { token: 'a'.repeat(43), password: 'New-password-123!' };
  const valid = recovery('reset-password', payload, { Cookie: 'AUTH_TOKEN=signed; XSRF-TOKEN=csrf', 'X-XSRF-TOKEN': 'csrf-header' });
  assert.equal((await handle(valid, environment(), async (input, init) => {
    assert.equal(init.headers.get('Cookie'), 'AUTH_TOKEN=signed; XSRF-TOKEN=csrf');
    assert.equal(init.headers.get('X-XSRF-TOKEN'), 'csrf-header');
    assert.deepEqual(JSON.parse(new TextDecoder().decode(init.body)), payload);
    return new Response(null, { status: 204 });
  })).status, 204);
  assert.equal((await handle(recovery('reset-password', { ...payload, token: 'bad' }), environment(), noUpstream)).status, 400);
  assert.equal((await handle(recovery('reset-password', { ...payload, password: '界'.repeat(25) }), environment(), noUpstream)).status, 400);
  assert.equal((await handle(recovery('reset-password', payload, { Origin: 'https://evil.test' }), environment(), noUpstream)).status, 403);
  assert.equal((await handle(recovery('forgot-password', null), environment(), noUpstream)).status, 400);
});

test('only exact POST PayOS webhook bypasses browser metadata; cookies are stripped', async () => {
  const request = new Request(ORIGIN + '/api/v1/payments/payos/webhook', {
    method: 'POST', headers: { 'CF-Connecting-IP': '192.0.2.2', 'Content-Type': 'application/json', Cookie: 'SESSION=spoof' }, body: '{}',
  });
  const response = await handle(request, environment(), async (input, init) => {
    assert.equal(String(input), 'https://backend.example.test/api/v1/payments/payos/webhook');
    assert.equal(init.headers.get('X-Origin-Verify'), SECRET);
    assert.equal(init.headers.get('Cookie'), null);
    return Response.json({ error: 'invalid signature' }, { status: 400 });
  });
  assert.equal(response.status, 400);
  assert.equal((await handle(new Request(ORIGIN + '/api/v1/payments/payos/webhook/extra', {
    method: 'POST', headers: { 'CF-Connecting-IP': '192.0.2.2' }, body: '{}',
  }), environment(), noUpstream)).status, 403);
});
test('webhook retains body and rate limits', async () => {
  const request = () => new Request(ORIGIN + '/api/v1/payments/payos/webhook', {
    method: 'POST', headers: { 'CF-Connecting-IP': '192.0.2.2', 'Content-Type': 'application/json' }, body: 'x'.repeat(16385),
  });
  assert.equal((await handle(request(), environment(), noUpstream)).status, 413);
  assert.equal((await handle(request(), environment({ API_LIMITER: limiter(0) }), noUpstream)).status, 429);
});
test('internal reconciliation is inaccessible through public routes, even with forged browser headers', async () => {
  const request = browser('/api/v1/internal/payments/reconcile', { method: 'POST', headers: { Origin: ORIGIN, 'X-Origin-Verify': SECRET } });
  assert.equal((await handle(request, environment(), noUpstream)).status, 404);
});
test('PayOS return navigation is allowed but never confirms a payment', async () => {
  const request = new Request(ORIGIN + '/api/v1/payments/return/00000000-0000-0000-0000-000000000001?status=PAID', {
    headers: { 'CF-Connecting-IP': '192.0.2.2', 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate' },
  });
  assert.equal((await handle(request, environment(), async (input, init) => {
    assert.equal(init.method, 'GET'); return new Response('<html></html>');
  })).status, 200);
});
test('scheduled reconciliation calls only fixed backend and fails on upstream error', async () => {
  await reconcilePayments(environment(), async (input, init) => {
    assert.equal(String(input), 'https://backend.example.test/api/v1/internal/payments/reconcile');
    assert.equal(init.method, 'POST'); assert.equal(init.headers['X-Origin-Verify'], SECRET);
    assert.equal(init.redirect, 'manual'); return Response.json({ checked: 0 });
  });
  await assert.rejects(reconcilePayments(environment(), async () => new Response(null, { status: 503 })));
});
test('scheduled reconciliation retries cold-start errors and rejects HTML wake-up pages', async () => {
  let calls = 0;
  await reconcilePayments(environment(), async () => ++calls === 1
    ? new Response('Waking up', { status: 503 }) : Response.json({ checked: 0 }));
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(reconcilePayments(environment(), async () => {
    calls++; return new Response('<html>Waking up</html>', { headers: { 'Content-Type': 'text/html' } });
  }));
  assert.equal(calls, 2);
});

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
