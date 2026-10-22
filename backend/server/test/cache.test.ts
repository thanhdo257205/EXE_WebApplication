import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCache } from '../src/cache.ts';

test('cache computes once per key within the TTL and recomputes after it', async () => {
  let time = 1000, calls = 0; const cache = createCache(() => time);
  const compute = async () => ++calls;
  assert.equal(await cache.cached('k', 100, compute), 1);
  assert.equal(await cache.cached('k', 100, compute), 1);
  time += 101;
  assert.equal(await cache.cached('k', 100, compute), 2);
  assert.equal(await cache.cached('other', 100, compute), 3);
});

test('concurrent misses share one computation and failures are never cached', async () => {
  const cache = createCache(); let calls = 0;
  const slow = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); return 'ok'; };
  assert.deepEqual(await Promise.all([cache.cached('a', 1000, slow), cache.cached('a', 1000, slow)]), ['ok', 'ok']);
  assert.equal(calls, 1);
  await assert.rejects(cache.cached('b', 1000, async () => { throw new Error('boom'); }));
  assert.equal(await cache.cached('b', 1000, async () => 'recovered'), 'recovered');
});

test('clear drops entries and the cache is bounded', async () => {
  const cache = createCache();
  for (let i = 0; i < 260; i++) await cache.cached(`k${i}`, 1000, async () => i);
  assert.ok(cache.size() <= 200);
  cache.clear(); assert.equal(cache.size(), 0);
});
