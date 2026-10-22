import assert from 'node:assert/strict';

const origin = process.env.PUBLIC_ORIGIN;
const get = (url, headers = {}, redirect = 'manual') => fetch(url, { headers, redirect, signal: AbortSignal.timeout(60_000) });
for (const path of ['/', '/thu-vien', '/wiki', '/huong-dan']) {
  // Pages redirects prerendered directories to a trailing slash.
  const page = await get(origin + path, {}, 'follow');
  assert.equal(new URL(page.url).origin, origin, `Static page origin ${path}`);
  assert.equal(page.status, 200, `Static page ${path}`);
  assert.match(page.headers.get('content-type'), /text\/html/);
}
const info = await get(`${origin}/api/v1/info`, { Origin: origin });
assert.equal(info.status, 200, 'Gateway API');
const body = await info.json();
assert.equal(body.application, 'EXE_WebApplication');
assert.equal(body.commit, process.env.RELEASE_SHA, 'Live backend commit');
assert.equal((await get(`${origin}/api/v1/info`)).status, 403, 'Missing browser metadata');
assert.equal((await get(`${origin}/api/v1/info`, { Origin: 'https://example.org' })).status, 403, 'Foreign origin');
assert.equal((await get(`${process.env.BACKEND_ORIGIN}/api/v1/info`)).status, 403, 'Direct backend guard');
const health = await get(`${process.env.BACKEND_ORIGIN}/actuator/health`);
assert.equal(health.status, 200, 'Backend and Turso health');
assert.equal(body.storage, 'turso', 'Migrated storage');
assert.equal((await health.json()).status, 'UP');
const paymentConfig = await get(`${origin}/api/v1/payments/config`, { Origin: origin });
assert.equal(paymentConfig.status, 200, 'Payment configuration');
assert.equal((await paymentConfig.json()).enabled, true, 'PayOS merchant credentials configured');
assert.equal((await get(`${origin}/api/v1/orders`, { Origin: origin })).status, 401, 'Orders require authentication');
assert.equal((await get(`${origin}/api/v1/internal/payments/reconcile`, { Origin: origin })).status, 404, 'Internal reconciliation hidden');
const invalidWebhook = await fetch(`${origin}/api/v1/payments/payos/webhook`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(60_000),
});
assert.equal(invalidWebhook.status, 400, 'Unsigned webhook rejected by backend');
console.log('Production smoke checks passed: static routes, tested API commit, origin guard, database health and PayOS guards.');
