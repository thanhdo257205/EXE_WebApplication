import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const common = ['id', 'slug', 'sortOrder'];
const fields = {
  characters: [...common, 'code', 'name', 'biography', 'abilityText', 'portraitUrl'],
  'card-sets': [...common, 'code', 'name', 'description'],
  cards: [...common, 'code', 'cardSetId', 'characterId', 'name', 'effectText', 'rulingNotes', 'ruleStatus', 'copiesInDeck', 'artworkUrl'],
  'wiki-pages': [...common, 'pageType', 'title', 'summary', 'bodyMarkdown', 'ruleStatus'],
};
function keys(value, allowed) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(key => allowed.includes(key));
}
function validate(snapshot, releaseId) {
  if (!keys(snapshot, ['schemaVersion', 'release', 'content']) || snapshot.schemaVersion !== 1
      || !keys(snapshot.release, ['id', 'versionLabel', 'title', 'publishedAt', 'version'])
      || !uuid.test(snapshot.release.id) || !Number.isSafeInteger(snapshot.release.version) || snapshot.release.version < 0
      || typeof snapshot.release.versionLabel !== 'string' || typeof snapshot.release.title !== 'string'
      || typeof snapshot.release.publishedAt !== 'string' || !Number.isFinite(Date.parse(snapshot.release.publishedAt))
      || (releaseId && snapshot.release.id.toLowerCase() !== releaseId.toLowerCase())
      || !keys(snapshot.content, Object.keys(fields))) throw new Error('Invalid public snapshot metadata');
  let count = 0;
  for (const [kind, allowed] of Object.entries(fields)) {
    const items = snapshot.content[kind];
    if (!Array.isArray(items)) throw new Error('Missing public content collection');
    const ids = new Set();
    for (const item of items) {
      if (!keys(item, allowed) || !uuid.test(item.id) || typeof item.slug !== 'string' || ids.has(item.id))
        throw new Error('Invalid or private content in snapshot');
      ids.add(item.id);
    }
    count += items.length;
  }
  if (count > 2000) throw new Error('Public snapshot exceeds item limit');
}

// No admin cookies, credentials, proxy secrets or preview endpoints are accepted by this exporter.
export async function exportPublicContent({ url, output, releaseId, fetcher = fetch }) {
  const origin = new URL(url);
  if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash
      || !(origin.protocol === 'https:' || (origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname))))
    throw new Error('Use an HTTPS public origin or localhost');
  if (!output || (releaseId && !uuid.test(releaseId))) throw new Error('Output and valid release ID are required');
  const target = new URL('/api/v1/content/snapshot', origin);
  if (releaseId) target.searchParams.set('releaseId', releaseId);
  const response = await fetcher(target, {
    headers: { Accept: 'application/json', Origin: origin.origin },
    redirect: 'error', signal: AbortSignal.timeout(240_000),
  });
  if (!response.ok) throw new Error(`Public snapshot request failed (HTTP ${response.status})`);
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json'))
    throw new Error('Public snapshot must be JSON');
  const chunks = []; let length = 0;
  for await (const chunk of response.body) {
    length += chunk.byteLength;
    if (length > 4 * 1024 * 1024) throw new Error('Public snapshot exceeds 4 MiB');
    chunks.push(chunk);
  }
  const snapshot = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  validate(snapshot, releaseId);
  const destination = resolve(output), temporary = `${destination}.${randomUUID()}.tmp`;
  await mkdir(dirname(destination), { recursive: true });
  try {
    await writeFile(temporary, `${JSON.stringify(snapshot)}\n`, { flag: 'wx' });
    await rename(temporary, destination);
  } finally { await rm(temporary, { force: true }); }
  return snapshot.release.id;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2), options = {};
    for (let i = 0; i < args.length; i += 2) {
      if (!['--url', '--output', '--release-id'].includes(args[i]) || !args[i + 1]) throw new Error('Invalid export arguments');
      options[args[i]] = args[i + 1];
    }
    const id = await exportPublicContent({ url: options['--url'], output: options['--output'], releaseId: options['--release-id'] });
    console.log(`Exported public release ${id}`);
  } catch { console.error('Public content export failed; existing snapshot preserved. Check origin, published release and output path.'); process.exitCode = 1; }
}
