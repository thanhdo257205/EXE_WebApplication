import { describe, expect, it, vi } from 'vitest';
import { isStaleChunkError, reloadOnStaleChunk } from './stale-chunk';

function fakeWindow() {
  const store = new Map<string, string>();
  return {
    location: { assign: vi.fn() } as unknown as Location,
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    } as unknown as Storage,
  };
}

describe('stale chunk recovery', () => {
  it('recognises chunk load failures from Chromium, Firefox and Safari', () => {
    expect(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/chunk-AB.js'))).toBe(true);
    expect(isStaleChunkError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isStaleChunkError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isStaleChunkError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isStaleChunkError(undefined)).toBe(false);
  });

  it('reloads the target URL once, then stops for a repeat failure within a minute', () => {
    const win = fakeWindow();
    const error = new TypeError('Failed to fetch dynamically imported module: https://x/chunk-AB.js');
    expect(reloadOnStaleChunk({ error, url: '/' }, win, 1_000)).toBe(true);
    expect(win.location.assign).toHaveBeenCalledWith('/');
    expect(reloadOnStaleChunk({ error, url: '/' }, win, 30_000)).toBe(false);
    expect(win.location.assign).toHaveBeenCalledTimes(1);
    expect(reloadOnStaleChunk({ error, url: '/wiki' }, win, 31_000)).toBe(true);
    expect(reloadOnStaleChunk({ error, url: '/' }, win, 120_000)).toBe(true);
  });

  it('ignores ordinary navigation errors', () => {
    const win = fakeWindow();
    expect(reloadOnStaleChunk({ error: new Error('resolver failed'), url: '/' }, win)).toBe(false);
    expect(win.location.assign).not.toHaveBeenCalled();
  });
});
