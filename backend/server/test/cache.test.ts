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
  cache.clear(); assert.equal(cache.size(), 0); assert.equal(cache.bytes(), 0);
});

test('oversized responses are served but never retained', async () => {
  const cache = createCache(Date.now, { maxEntryBytes: 100 }); let calls = 0;
  const compute = async () => { calls++; return { body: 'x'.repeat(200) }; };
  assert.equal((await cache.cached('big', 1000, compute)).body.length, 200);
  assert.equal(cache.size(), 0); assert.equal(cache.bytes(), 0);
  await cache.cached('big', 1000, compute);
  assert.equal(calls, 2);
});

test('the byte budget evicts the least recently used entry', async () => {
  const cache = createCache(Date.now, { maxTotalBytes: 250 }); const calls: Record<string, number> = {};
  const compute = (key: string) => async () => { calls[key] = (calls[key] ?? 0) + 1; return { value: key.repeat(100) }; };
  await cache.cached('a', 1000, compute('a'));
  await cache.cached('b', 1000, compute('b'));
  await cache.cached('a', 1000, compute('a')); // refresh a, so b is now the oldest
  await cache.cached('c', 1000, compute('c'));
  assert.equal(cache.size(), 2);
  assert.ok(cache.bytes() <= 250);
  await cache.cached('b', 1000, compute('b'));
  assert.equal(calls.b, 2);
  await cache.cached('c', 1000, compute('c'));
  assert.equal(calls.c, 1);
});

test('expired entries are swept on an interval', async () => {
  let time = 0; const cache = createCache(() => time, { sweepEveryMs: 100 });
  await cache.cached('a', 10, async () => 'a');
  time = 50; await cache.cached('b', 10, async () => 'b');
  assert.equal(cache.size(), 2);
  time = 120; await cache.cached('c', 1000, async () => 'c');
  assert.equal(cache.size(), 1);
});
