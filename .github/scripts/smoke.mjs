import assert from 'node:assert/strict';

const origin = process.env.PUBLIC_ORIGIN;
const get = (url, headers = {}) => fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(60_000) });
for (const path of ['/', '/thu-vien', '/wiki', '/huong-dan']) {
  const page = await get(origin + path);
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
assert.equal(health.status, 200, 'Backend and PostgreSQL health');
assert.equal((await health.json()).status, 'UP');
console.log('Production smoke checks passed: static routes, tested API commit, origin guard and database health.');
