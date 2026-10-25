// Tiny in-process cache for public, read-only responses. Published releases are immutable, so a short TTL plus
// invalidation on every successful admin mutation keeps data fresh without a Turso round trip per request.
// Failures are never cached and concurrent misses for one key share a single computation.
// One instance per app (never module-global) so separate apps/databases cannot see each other's entries.
export const PUBLIC_TTL_MS = 30_000;
const MAX_ENTRIES = 200;
// A release is budgeted at 500k characters, so one serialized response fits well under this. The global
// budget bounds memory when many distinct search terms are requested; entries are evicted least-recently-used.
const MAX_ENTRY_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const SWEEP_EVERY_MS = 60_000;

export type CacheOptions = { maxEntries?: number; maxEntryBytes?: number; maxTotalBytes?: number; sweepEveryMs?: number };
type Entry = { expires: number; value: Promise<unknown>; bytes: number };

const sizeOf = (value: unknown): number => {
  try { return Buffer.byteLength(JSON.stringify(value) ?? ''); } catch { return Infinity; }
};

export function createCache(clock: () => number = Date.now, options: CacheOptions = {}) {
  const maxEntries = options.maxEntries ?? MAX_ENTRIES;
  const maxEntryBytes = options.maxEntryBytes ?? MAX_ENTRY_BYTES;
  const maxTotalBytes = options.maxTotalBytes ?? MAX_TOTAL_BYTES;
  const sweepEveryMs = options.sweepEveryMs ?? SWEEP_EVERY_MS;
  const entries = new Map<string, Entry>();
  let totalBytes = 0, sweptAt = clock();

  const remove = (key: string) => {
    const entry = entries.get(key);
    if (!entry) return;
    entries.delete(key);
    totalBytes -= entry.bytes;
  };
  const sweep = () => {
    sweptAt = clock();
    for (const [key, entry] of entries) if (entry.expires <= sweptAt) remove(key);
  };
  const evict = () => {
    // Map keeps insertion order and hits re-insert their key, so the first key is the least recently used.
    while (entries.size > maxEntries || totalBytes > maxTotalBytes) {
      const oldest = entries.keys().next();
      if (oldest.done) return;
      remove(oldest.value);
    }
  };

  return {
    async cached<T>(key: string, ttlMs: number, compute: () => Promise<T>, entryLimit = maxEntryBytes): Promise<T> {
      const now = clock();
      if (now - sweptAt >= sweepEveryMs) sweep();
      const hit = entries.get(key);
      if (hit && hit.expires > now) {
        entries.delete(key); entries.set(key, hit);
        return hit.value as Promise<T>;
      }
      if (hit) remove(key);
      const value = compute();
      const entry: Entry = { expires: now + ttlMs, value, bytes: 0 };
      entries.set(key, entry);
      value.then(result => {
        if (entries.get(key) !== entry) return;
        const bytes = sizeOf(result);
        if (bytes > entryLimit) { remove(key); return; }
        entry.bytes = bytes;
        totalBytes += bytes;
        evict();
      }, () => { if (entries.get(key) === entry) remove(key); });
      return value;
    },
    clear: () => { entries.clear(); totalBytes = 0; },
    size: () => entries.size,
    bytes: () => totalBytes,
  };
}
export type Cache = ReturnType<typeof createCache>;
