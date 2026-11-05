import type { NavigationError } from '@angular/router';

/**
 * After a deploy, a tab still running the previous build asks Pages for lazy chunks
 * that no longer exist. Pages answers with the SPA fallback (index.html, 200,
 * text/html), the dynamic import() rejects and the router leaves the outlet empty:
 * header visible, page blank. Reloading the target URL picks up the new build.
 */
const CHUNK_ERROR = /dynamically imported module|Failed to load module script|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk [\w-]+ failed/i;
const GUARD_KEY = 'exe.stale-chunk-reload';
/** A second failure for the same URL within this window is a real outage, not a stale tab: stop reloading. */
const GUARD_MS = 60_000;

export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? '');
  return CHUNK_ERROR.test(message);
}

/**
 * Router navigation error handler: full-page load of the failed URL once per minute per URL.
 * Returns true when a reload was started (for tests).
 */
export function reloadOnStaleChunk(
  event: Pick<NavigationError, 'error' | 'url'>,
  win: Pick<Window, 'location' | 'sessionStorage'> | undefined = typeof window === 'undefined' ? undefined : window,
  now = Date.now(),
): boolean {
  if (!win || !isStaleChunkError(event.error)) return false;
  try {
    const last = JSON.parse(win.sessionStorage.getItem(GUARD_KEY) || 'null') as { url?: string; at?: number } | null;
    if (last?.url === event.url && typeof last.at === 'number' && now - last.at < GUARD_MS) return false;
    win.sessionStorage.setItem(GUARD_KEY, JSON.stringify({ url: event.url, at: now }));
  } catch {
    // Storage blocked: still reload once; the next load starts a fresh app either way.
  }
  win.location.assign(event.url);
  return true;
}
