import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCookie } from 'hono/cookie';
import { ZodError } from 'zod';
import type { Client } from '@libsql/client';
import { Problem, fail, scalar } from './db.ts';
import { authRoutes, authenticate, same, type ApiEnv, type Config } from './auth.ts';
import { contentRoutes } from './content.ts';
import { feedbackRoutes } from './feedback.ts';
import { Payments, paymentRoutes, type Provider } from './payments.ts';

export function createApp(db: Client, config: Config, provider: Provider | null = null, sendMail?: (email: string, url: string) => Promise<void>) {
  const app = new Hono<ApiEnv>();
  app.onError((error, c) => {
    let status = 500, code = 'INTERNAL_ERROR';
    if (error instanceof Problem) { status = error.status; code = error.code; }
    else if (error instanceof ZodError || error instanceof SyntaxError) { status = 400; code = 'INVALID_REQUEST'; }
    else if ('code' in error && String(error.code).startsWith('SQLITE_CONSTRAINT')) { status = 409; code = 'CONSTRAINT_VIOLATION'; }
    else if ('code' in error && /SQLITE_BUSY|SQLITE_LOCKED|TIMEOUT|TRANSACTION|SERVER_ERROR|FETCH_FAILED|HTTP_/.test(String(error.code))) { status = 503; code = 'DATABASE_UNAVAILABLE'; }
    // Never log raw request bodies, provider errors, SQL parameters or driver URLs/tokens.
    if (status === 500) console.error('API request failed', { type: error.name });
    return c.json({ type: 'about:blank', title: code, status, code }, status as 400);
  });
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store'); c.header('X-Content-Type-Options', 'nosniff');
    const health = c.req.method === 'GET' && c.req.path === '/actuator/health';
    if (config.production && !health && (!config.proxySecret || !same(c.req.header('X-Origin-Verify') || '', config.proxySecret))) return fail(403, 'PROXY_REQUIRED');
    // Protect the reconcile endpoint even in local mode: it has no user/CSRF authentication.
    if (c.req.path === '/api/v1/internal/payments/reconcile' && (!config.proxySecret || !same(c.req.header('X-Origin-Verify') || '', config.proxySecret))) return fail(403, 'PROXY_REQUIRED');
    const origin = c.req.header('Origin');
    if (origin && origin !== config.publicOrigin) return fail(403, 'ORIGIN_NOT_ALLOWED');
    await next();
  });
  app.use('/api/*', async (c, next) => {
    const length = c.req.path === '/api/v1/payments/payos/webhook' ? 16384 : 65536;
    return bodyLimit({ maxSize: length, onError: () => fail(413, 'REQUEST_TOO_LARGE') })(c, next);
  });
  app.get('/actuator/health', async c => { await scalar(db, 'SELECT 1'); return c.json({ status: 'UP' }); });
  app.get('/api/v1/info', c => c.json({ application: 'EXE_WebApplication', version: '0.1.0', stage: config.production ? 'production' : 'local', commit: process.env.RENDER_GIT_COMMIT || process.env.RELEASE_SHA || 'local', storage: 'turso' }));
  app.use('/api/*', async (c, next) => { c.set('actor', await authenticate(db, config, getCookie(c, 'AUTH_TOKEN'))); await next(); });
  authRoutes(app, db, config, sendMail);
  contentRoutes(app, db);
  feedbackRoutes(app, db, config);
  const payments = new Payments(db, provider, config.publicOrigin); paymentRoutes(app, db, payments);
  app.notFound(c => c.json({ type: 'about:blank', title: 'Not Found', status: 404 }, 404));
  return { app, payments };
}
