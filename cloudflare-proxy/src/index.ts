interface Limiter { limit(input: { key: string }): Promise<{ success: boolean }>; }
export interface Env {
  PUBLIC_ORIGIN: string;
  BACKEND_ORIGIN: string;
  FRONTEND_ORIGIN: string;
  ORIGIN_PROXY_SECRET: string;
  TURNSTILE_SECRET_KEY: string;
  API_LIMITER: Limiter;
  LOGIN_LIMITER: Limiter;
  ACCOUNT_LIMITER: Limiter;
}

const LOGIN = '/api/v1/auth/login';
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
    if (backend.origin === publicUrl.origin || frontend.origin === publicUrl.origin) return problem(503, 'Invalid gateway configuration');
    const api = url.pathname === '/api' || url.pathname.startsWith('/api/');
    if (!api) {
      if (!['GET', 'HEAD'].includes(request.method)) return problem(405, 'Method not allowed');
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
    if (suppliedOrigin && suppliedOrigin !== publicUrl.origin) return problem(403, 'Origin not allowed');
    if (!oauthNavigation && suppliedOrigin !== publicUrl.origin
        && !(site === 'same-origin' && ['cors', 'same-origin'].includes(mode ?? ''))) {
      return problem(403, 'Browser request required');
    }
    if (!SAFE_METHODS.has(request.method) && suppliedOrigin !== publicUrl.origin) return problem(403, 'Origin required');
    if (request.method === 'OPTIONS') {
      // This is intentionally a same-origin gateway; cross-origin browser API access is not supported.
      return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    }
    if (!['GET', 'POST', 'HEAD', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return problem(405, 'Method not allowed');
    const authAttempt = (request.method === 'POST' && url.pathname === LOGIN) || url.pathname === OAUTH_START;
    if (authAttempt && !(await env.LOGIN_LIMITER.limit({ key: `login:${ip}` })).success) return problem(429, 'Too many login attempts', '60');
    const body = SAFE_METHODS.has(request.method) ? undefined : await readLimitedBody(request, 65536);
    if (body === null) return problem(413, 'Request too large');
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
      const value = request.headers.get(name); if (value) headers.set(name, value);
    }
    headers.set('X-Origin-Verify', env.ORIGIN_PROXY_SECRET);
    headers.set('X-Forwarded-Proto', publicUrl.protocol.slice(0, -1));
    headers.set('X-Forwarded-Host', publicUrl.host);
    headers.set('X-Forwarded-Port', publicUrl.port || (publicUrl.protocol === 'https:' ? '443' : '80'));
    const target = new URL(backend.origin); target.pathname = url.pathname; target.search = url.search;
    const upstream = await fetcher(target, {
      method: request.method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(60000),
    });
    const response = new Response(upstream.body, upstream);
    response.headers.set('Cache-Control', 'no-store');
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

export default { fetch: (request: Request, env: Env) => handle(request, env) };
