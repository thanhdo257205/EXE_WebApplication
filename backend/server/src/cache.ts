// Tiny in-process cache for public, read-only responses. Published releases are immutable, so a short TTL plus
// invalidation on every successful admin mutation keeps data fresh without a Turso round trip per request.
// Failures are never cached and concurrent misses for one key share a single computation.
// One instance per app (never module-global) so separate apps/databases cannot see each other's entries.
export const PUBLIC_TTL_MS = 30_000;
const MAX_ENTRIES = 200;

export function createCache(clock: () => number = Date.now) {
  const entries = new Map<string, { expires: number; value: Promise<unknown> }>();
  return {
    async cached<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
      const hit = entries.get(key);
      if (hit && hit.expires > clock()) return hit.value as Promise<T>;
      const value = compute();
      entries.set(key, { expires: clock() + ttlMs, value });
      if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value as string);
      value.catch(() => { if (entries.get(key)?.value === value) entries.delete(key); });
      return value;
    },
    clear: () => entries.clear(),
    size: () => entries.size,
  };
}
export type Cache = ReturnType<typeof createCache>;
