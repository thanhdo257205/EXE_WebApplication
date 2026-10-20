import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportPublicContent } from './export-public-content.mjs';

const id = '11111111-1111-4111-8111-111111111111';
function snapshot() {
  return { schemaVersion: 1, release: { id, versionLabel: 'test-release', title: 'Test', version: 4, publishedAt: '2026-10-20T00:00:00Z' },
    content: { characters: [], 'card-sets': [], cards: [], 'wiki-pages': [] } };
}
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'exe-public-content-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, 'snapshot.json');
  await writeFile(output, 'previous snapshot');
  return output;
}
const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

test('export freezes a pinned public release without sending credentials', async t => {
  const output = await fixture(t);
  const result = await exportPublicContent({ url: 'https://example.test', output, releaseId: id,
    fetcher: async (url, options) => {
      assert.equal(url.pathname, '/api/v1/content/snapshot');
      assert.equal(url.searchParams.get('releaseId'), id);
      assert.deepEqual(options.headers, { Accept: 'application/json', Origin: 'https://example.test' });
      assert.equal(options.redirect, 'error');
      return json(snapshot());
    } });
  assert.equal(result, id);
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), snapshot());
});
test('HTTP failure or wrong pinned release leaves the previous artifact intact', async t => {
  const output = await fixture(t);
  for (const fetcher of [async () => new Response('', { status: 404 }), async () => new Response('', { status: 503 }),
    async () => json({ ...snapshot(), release: { ...snapshot().release, id: '22222222-2222-4222-8222-222222222222' } })]) {
    await assert.rejects(exportPublicContent({ url: 'https://example.test', output, releaseId: id, fetcher }));
    assert.equal(await readFile(output, 'utf8'), 'previous snapshot');
  }
});
test('private metadata, non-JSON and oversized responses are rejected before replacing output', async t => {
  const output = await fixture(t), privateSnapshot = snapshot();
  privateSnapshot.release.createdBy = id;
  const privateItem = snapshot(); privateItem.content.cards.push({ id, slug: 'test', contactEmail: 'private@example.test' });
  for (const fetcher of [async () => json(privateSnapshot), async () => json(privateItem),
    async () => new Response('<html>login</html>', { headers: { 'Content-Type': 'text/html' } }),
    async () => new Response('x'.repeat(4 * 1024 * 1024 + 1), { headers: { 'Content-Type': 'application/json' } })]) {
    await assert.rejects(exportPublicContent({ url: 'https://example.test', output, fetcher }));
    assert.equal(await readFile(output, 'utf8'), 'previous snapshot');
  }
});
test('unsafe origins are rejected without making a request', async t => {
  const output = await fixture(t);
  for (const url of ['https://user:password@example.test', 'http://example.test', 'https://example.test/admin/preview'])
    await assert.rejects(exportPublicContent({ url, output, fetcher: () => assert.fail('Must not fetch') }));
});
