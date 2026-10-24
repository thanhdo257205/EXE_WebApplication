interface Limiter { limit(input: { key: string }): Promise<{ success: boolean }>; }
/** Phần tối thiểu của R2 binding mà gateway dùng (không kéo cả @cloudflare/workers-types). `body` vắng khi điều kiện If-None-Match khớp. */
export interface R2BucketLike {
  get(key: string, options?: { onlyIf?: Headers }): Promise<{ httpEtag: string; size: number; body?: ReadableStream } | null>;
}

export interface Env {
  PUBLIC_ORIGIN: string;
  BACKEND_ORIGIN: string;
  FRONTEND_ORIGIN: string;
  ORIGIN_PROXY_SECRET: string;
  TURNSTILE_SECRET_KEY: string;
  API_LIMITER: Limiter;
  LOGIN_LIMITER: Limiter;
  ACCOUNT_LIMITER: Limiter;
  /** Bucket R2 chứa ảnh thẻ. Tùy chọn: chưa gắn thì `/media/*` trả 404 và gateway vẫn chạy bình thường. */
  CARD_IMAGES?: R2BucketLike;
  AZURE_MEDIA_ORIGIN?: string;
}

const MEDIA_UPLOAD = '/api/v1/admin/media/card-image';
const MEDIA_UPLOAD_MAX = 1024 * 1024 + 4096;
const MEDIA_PATH = /^\/media\/cards\/[a-f0-9]{64}\.(png|jpg|webp)$/;
const MEDIA_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

/** Only this project's image paths may reach a fixed public Azure container. Never forward credentials. */
async function serveAzureMedia(request: Request, env: Env, pathname: string, fetcher: typeof fetch): Promise<Response> {
  const uploaded = MEDIA_PATH.exec(pathname);
  const asset = /^\/assets\/cards\/(?:pokemon\/)?[a-z0-9-]+\.(svg|webp)$/.exec(pathname);
  const defaultPoster = pathname === '/assets/models/default-card-poster.webp';
  if (!uploaded && !asset && !defaultPoster) return problem(404, 'Not found');
  if (!env.AZURE_MEDIA_ORIGIN || !/^https:\/\/[a-z0-9]{3,24}\.blob\.core\.windows\.net\/[a-z0-9][a-z0-9-]{2,62}$/.test(env.AZURE_MEDIA_ORIGIN)) return problem(503, 'Media unavailable');
  const key = uploaded ? pathname.slice(7) : pathname.slice(1);
  const headers = new Headers();
  for (const name of ['if-none-match', 'if-modified-since']) {
    const value = request.headers.get(name); if (value) headers.set(name, value);
  }
  const response = await fetcher(`${env.AZURE_MEDIA_ORIGIN}/${key}`, { method: request.method, headers, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  if (![200, 304].includes(response.status)) return problem(response.status === 404 ? 404 : 503, 'Media unavailable');
  const ext = uploaded?.[1] || asset?.[1] || 'webp';
  const result = new Headers({
    'Content-Type': ext === 'svg' ? 'image/svg+xml' : MEDIA_TYPES[ext],
    'Cache-Control': uploaded ? 'public, max-age=31536000, immutable' : 'public, max-age=86400',
    'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'none'; sandbox", 'X-Media-Storage': 'azure-blob',
  });
  for (const name of ['etag', 'last-modified', 'content-length']) {
    const value = response.headers.get(name); if (value) result.set(name, value);
  }
  return new Response(request.method === 'HEAD' || response.status === 304 ? null : response.body, { status: response.status, headers: result });
}

/** Ảnh thẻ trên R2: tên file là hash nội dung nên nội dung không bao giờ đổi → cache vĩnh viễn, hỗ trợ ETag/304. */
async function serveMedia(request: Request, env: Env, pathname: string): Promise<Response> {
  const hit = MEDIA_PATH.exec(pathname);
  if (!hit || !env.CARD_IMAGES) return problem(404, 'Not found');
  const object = await env.CARD_IMAGES.get(pathname.slice(7), { onlyIf: request.headers });
  if (!object) return problem(404, 'Not found');
  const headers = new Headers({
    'Content-Type': MEDIA_TYPES[hit[1]], 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox", 'Cross-Origin-Resource-Policy': 'same-origin', ETag: object.httpEtag,
  });
  if (!('body' in object)) return new Response(null, { status: 304, headers });
  headers.set('Content-Length', String(object.size));
  return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
}

const LOGIN = '/api/v1/auth/login';
const REGISTER = '/api/v1/auth/register';
const FORGOT_PASSWORD = '/api/v1/auth/forgot-password';
const RESET_PASSWORD = '/api/v1/auth/reset-password';
const PAYOS_WEBHOOK = '/api/v1/payments/payos/webhook';
const OAUTH_START = '/api/v1/auth/oauth2/authorization/google';
const OAUTH_CALLBACK = '/api/v1/auth/oauth2/callback/google';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function problem(status: number, title: string, retryAfter?: string) {
  const headers = new Headers({ 'Content-Type': 'application/problem+json', 'Cache-Control': 'no-store' });
  if (retryAfter) headers.set('Retry-After', retryAfter);
  return new Response(JSON.stringify({ type: 'about:blank', title, status }), { status, headers });
}

function origin(value: string): URL {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:'))
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Invalid configured origin');
  }
  return url;
}

async function readLimitedBody(request: Request, max: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  return body;
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}

export async function handle(request: Request, env: Env, fetcher: typeof fetch = fetch): Promise<Response> {
  try {
    const publicUrl = origin(env.PUBLIC_ORIGIN);
    const backend = origin(env.BACKEND_ORIGIN);
    const frontend = origin(env.FRONTEND_ORIGIN);
    const url = new URL(request.url);
    if (url.origin !== publicUrl.origin) return problem(403, 'Unexpected host');
    if (backend.origin === publicUrl.origin) return problem(503, 'Invalid gateway configuration');
    const api = url.pathname === '/api' || url.pathname.startsWith('/api/');
    if (decodeURIComponent(url.pathname).startsWith('/api/v1/internal')) return problem(404, 'Not found');
    if (!api) {
      if (!['GET', 'HEAD'].includes(request.method)) return problem(405, 'Method not allowed');
      if (env.AZURE_MEDIA_ORIGIN && (url.pathname.startsWith('/media/') || url.pathname.startsWith('/assets/cards/') || url.pathname === '/assets/models/default-card-poster.webp')) return await serveAzureMedia(request, env, url.pathname, fetcher);
      if (url.pathname.startsWith('/media/')) return await serveMedia(request, env, url.pathname);
      if (frontend.origin === publicUrl.origin) return problem(503, 'Static assets must be served by Pages');
      // Static requests never carry authentication, origin secrets or user-controlled forwarding headers.
      const headers = new Headers();
      for (const name of ['accept', 'accept-language', 'if-none-match', 'if-modified-since']) {
        const value = request.headers.get(name); if (value) headers.set(name, value);
      }
      const target = new URL(frontend.origin); target.pathname = url.pathname; target.search = url.search;
      return await fetcher(target, { method: request.method, headers, redirect: 'manual' });
    }
    if (!env.ORIGIN_PROXY_SECRET || env.ORIGIN_PROXY_SECRET.length < 32) return problem(503, 'Gateway unavailable');
    const ip = request.headers.get('CF-Connecting-IP');
    if (!ip) return problem(403, 'Client identity unavailable');
    if (!(await env.API_LIMITER.limit({ key: `api:${ip}` })).success) return problem(429, 'Too many requests', '60');
    const suppliedOrigin = request.headers.get('Origin');
    const site = request.headers.get('Sec-Fetch-Site');
    const mode = request.headers.get('Sec-Fetch-Mode');
    const oauthNavigation = request.method === 'GET' && [OAUTH_START, OAUTH_CALLBACK].includes(url.pathname);
    const notificationStream = request.method === 'GET' && url.pathname === '/api/v1/admin/notifications/stream';
    const paymentNavigation = request.method === 'GET' && /^\/api\/v1\/payments\/return\/[a-f0-9-]{36}$/.test(url.pathname);
    const webhook = request.method === 'POST' && url.pathname === PAYOS_WEBHOOK;
    if (url.pathname === PAYOS_WEBHOOK && !webhook) return problem(405, 'Method not allowed');
    if (suppliedOrigin && suppliedOrigin !== publicUrl.origin) return problem(403, 'Origin not allowed');
    if (!webhook && !oauthNavigation && !paymentNavigation && suppliedOrigin !== publicUrl.origin
        && !(site === 'same-origin' && ['cors', 'same-origin'].includes(mode ?? ''))) {
      return problem(403, 'Browser request required');
    }
    if (!webhook && !SAFE_METHODS.has(request.method) && suppliedOrigin !== publicUrl.origin) return problem(403, 'Origin required');
    if (webhook && !request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return problem(415, 'JSON required');
    if (request.method === 'OPTIONS') {
      // This is intentionally a same-origin gateway; cross-origin browser API access is not supported.
      return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    }
    if (!['GET', 'POST', 'HEAD', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return problem(405, 'Method not allowed');
    const recovery = request.method === 'POST' && [FORGOT_PASSWORD, RESET_PASSWORD].includes(url.pathname);
    const authAttempt = (request.method === 'POST' && [LOGIN, REGISTER].includes(url.pathname)) || url.pathname === OAUTH_START || recovery;
    if (authAttempt && !(await env.LOGIN_LIMITER.limit({ key: `login:${ip}` })).success) return problem(429, 'Too many login attempts', '60');
    const body = SAFE_METHODS.has(request.method) ? undefined : await readLimitedBody(request, webhook ? 16384 : url.pathname === MEDIA_UPLOAD ? MEDIA_UPLOAD_MAX : 65536);
    if (body === null) return problem(413, 'Request too large');
    if (recovery) {
      if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return problem(415, 'JSON required');
      let payload: { email?: unknown; token?: unknown; password?: unknown };
      try {
        payload = JSON.parse(new TextDecoder().decode(body));
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return problem(400, 'Invalid recovery request');
      } catch { return problem(400, 'Invalid JSON'); }
      if (url.pathname === FORGOT_PASSWORD) {
        if (typeof payload.email !== 'string' || !payload.email.trim() || payload.email.length > 254) return problem(400, 'Invalid recovery request');
        const key = await digest(payload.email.trim().toLowerCase());
        if (!(await env.ACCOUNT_LIMITER.limit({ key: `recovery:${key}` })).success) return problem(429, 'Too many recovery attempts', '60');
      } else if (typeof payload.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(payload.token)
          || typeof payload.password !== 'string' || payload.password.length < 8
          || new TextEncoder().encode(payload.password).length > 72) return problem(400, 'Invalid recovery request');
    }
    if (request.method === 'POST' && url.pathname === REGISTER) {
      if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return problem(415, 'JSON required');
      let email: unknown;
      try { email = JSON.parse(new TextDecoder().decode(body)).email; }
      catch { return problem(400, 'Invalid JSON'); }
      if (typeof email !== 'string' || email.length > 254) return problem(400, 'Invalid register request');
      const key = await digest(email.trim().toLowerCase());
      if (!(await env.ACCOUNT_LIMITER.limit({ key: `register:${key}` })).success) return problem(429, 'Too many register attempts', '60');
    }
    if (request.method === 'POST' && url.pathname === LOGIN) {
      if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return problem(415, 'JSON required');
      let email: unknown;
      try { email = JSON.parse(new TextDecoder().decode(body)).email; }
      catch { return problem(400, 'Invalid JSON'); }
      if (typeof email !== 'string' || email.length > 254) return problem(400, 'Invalid login request');
      const key = await digest(email.trim().toLowerCase());
      if (!(await env.ACCOUNT_LIMITER.limit({ key: `account:${key}` })).success) return problem(429, 'Too many login attempts', '60');
      const token = request.headers.get('X-Turnstile-Token');
      if (!env.TURNSTILE_SECRET_KEY) return problem(503, 'Login protection unavailable');
      if (!token || token.length > 2048) return problem(403, 'Challenge required');
      const verification = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip }),
        signal: AbortSignal.timeout(5000),
      });
      if (!verification.ok) return problem(503, 'Challenge service unavailable');
      const result = await verification.json() as { success?: boolean; hostname?: string; action?: string };
      if (!result.success || result.hostname !== publicUrl.hostname || result.action !== 'login') return problem(403, 'Challenge rejected');
    }
    const headers = new Headers();
    for (const name of ['Accept', 'Content-Type', 'Cookie', 'X-XSRF-TOKEN']) {
      if (webhook && ['Cookie', 'X-XSRF-TOKEN'].includes(name)) continue;
      const value = request.headers.get(name); if (value) headers.set(name, value);
    }
    headers.set('X-Origin-Verify', env.ORIGIN_PROXY_SECRET);
    headers.set('X-Forwarded-Proto', publicUrl.protocol.slice(0, -1));
    headers.set('X-Forwarded-Host', publicUrl.host);
    headers.set('X-Forwarded-Port', publicUrl.port || (publicUrl.protocol === 'https:' ? '443' : '80'));
    const target = new URL(backend.origin); target.pathname = url.pathname; target.search = url.search;
    const upstreamTimeout = AbortSignal.timeout(oauthNavigation || notificationStream ? 180000 : 60000);
    const upstream = await fetcher(target, {
      // OAuth browser navigation can arrive at a sleeping origin (~147s observed).
      // Wait for the original exchange; never replay a state/code-bearing request.
      method: request.method, headers, body, redirect: 'manual',
      signal: notificationStream ? AbortSignal.any([request.signal, upstreamTimeout]) : upstreamTimeout,
    });
    const response = new Response(upstream.body, upstream);
    response.headers.set('Cache-Control', notificationStream ? 'no-store, no-transform' : 'no-store');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.delete('X-Origin-Verify');
    response.headers.delete('Server');
    const location = response.headers.get('Location');
    if (location) {
      const redirect = new URL(location, publicUrl.origin);
      if (redirect.origin === backend.origin) {
        redirect.protocol = publicUrl.protocol; redirect.host = publicUrl.host;
        response.headers.set('Location', redirect.toString());
      }
    }
    return response;
  } catch {
    // Fail closed on limiter, upstream, validation or configuration failures. Never log credentials.
    return problem(503, 'Gateway unavailable');
  }
}

export async function reconcilePayments(env: Env, fetcher: typeof fetch = fetch): Promise<void> {
  if (!env.ORIGIN_PROXY_SECRET || env.ORIGIN_PROXY_SECRET.length < 32) throw new Error('Missing proxy credential');
  const backend = origin(env.BACKEND_ORIGIN);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetcher(new URL('/api/v1/internal/payments/reconcile', backend), {
        method: 'POST', headers: { 'X-Origin-Verify': env.ORIGIN_PROXY_SECRET, Accept: 'application/json' },
        // A cold start was observed taking ~147s. Allow startup plus the batch and one recovery attempt.
        redirect: 'manual', signal: AbortSignal.timeout(300000),
      });
      if (!response.ok) throw new Error('Reconciliation unavailable');
      const result = await response.json() as { checked?: number };
      if (!Number.isInteger(result.checked) || result.checked! < 0 || result.checked! > 5) {
        throw new Error('Unexpected reconciliation response');
      }
      return;
    } catch {
      // The endpoint is idempotent. A second call can recover from an origin wake-up/error page.
      if (attempt === 1) throw new Error('Payment reconciliation unavailable after retry');
    }
  }
}

export default {
  fetch: (request: Request, env: Env) => handle(request, env),
  scheduled: (_event: unknown, env: Env, ctx: { waitUntil(promise: Promise<unknown>): void }) => ctx.waitUntil(reconcilePayments(env)),
};
