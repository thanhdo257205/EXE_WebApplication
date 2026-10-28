import type { Hono, Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { Client } from '@libsql/client';
import { all, one, execute, transaction, uuid, now, at, fail, type Row, type Executor } from './db.ts';
import { accessView } from './rbac-policy.ts';
import { googleAccount, registerPasswordAccount } from './accounts.ts';

export interface Config {
  production: boolean; publicOrigin: string; proxySecret: string; jwtSecret: string;
  googleClientId: string; googleClientSecret: string; googleEnabled: boolean;
  resetEnabled: boolean; resendKey: string; mailFrom: string;
}
export interface Actor { id: string; email: string; role: string; version: number; expires: number; }
export type ApiEnv = { Variables: { actor: Actor | null } };
export type Api = Hono<ApiEnv>;
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('base64url');
export const same = (a: string, b: string) => Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const requireActor = (c: Context<ApiEnv>, admin = false): Actor => {
  const user = c.get('actor');
  if (!user) return fail(401, 'AUTH_REQUIRED');
  if (admin && user.role !== 'ADMIN') return fail(403, 'ADMIN_REQUIRED');
  return user;
};
export async function authorize(db: Executor, actor: Actor, admin = false): Promise<Row> {
  const rows = await all(db, 'SELECT * FROM app_users WHERE id=?', [actor.id]);
  const user = rows[0];
  if (!user || !user.enabled || user.auth_version !== actor.version || (admin && user.role !== 'ADMIN')) return fail(403, 'AUTH_REQUIRED');
  return user;
}
/** Re-checks the live session/role and then the fine-grained permission under the same executor. */
export async function authorizePermission(db: Executor, actor: Actor, permission: string) {
  const user = await authorize(db, actor, true);
  const access = await accessView(db, user);
  if (!access.permissions.includes(permission)) return fail(403, 'PERMISSION_REQUIRED');
  return { user, access };
}
const userView = async (db: Executor, u: Row) => ({ id: u.id, email: u.email, displayName: u.display_name, role: u.role, ...await accessView(db, u) });
const email = z.string().trim().email().max(254).transform(s => s.toLowerCase());
const password = z.string().min(1).max(72).refine(s => Buffer.byteLength(s) <= 72);
const loginSchema = z.object({ email, password });
const registerSchema = loginSchema.extend({ displayName: z.string().trim().min(1).max(120), password: password.min(6) });
const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export async function authenticate(db: Client, config: Config, token?: string): Promise<Actor | null> {
  if (!token || token.length > 2048) return null;
  let claims;
  try { claims = (await jwtVerify(token, Buffer.from(config.jwtSecret, 'base64'), { issuer: 'exe-web-api', audience: 'exe-web', algorithms: ['HS256'], typ: 'JWT' })).payload; }
  catch { return null; }
  if (!claims.sub || !claims.jti || !claims.iat || claims.iat > Date.now() / 1000 + 30 || !Number.isSafeInteger(claims.ver) || !claims.exp) return null;
  const rows = await all(db, 'SELECT id,email,role,enabled,auth_version FROM app_users WHERE id=?', [claims.sub]);
  const u = rows[0];
  if (!u || !u.enabled || u.auth_version !== claims.ver) return null;
  return { id: u.id, email: u.email, role: u.role, version: u.auth_version, expires: claims.exp };
}
export function authRoutes(app: Api, db: Client, cfg: Config, sendMail?: (email: string, url: string) => Promise<void>) {
  const cookie = { httpOnly: true, secure: cfg.production, sameSite: 'Lax' as const, path: '/api' };
  const csrf = (c: Context<ApiEnv>) => { const token = random(); setCookie(c, 'XSRF-TOKEN', token, cookie); return token; };
  async function issue(c: Context<ApiEnv>, u: Row) {
    const jwt = await new SignJWT({ ver: u.auth_version }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setSubject(u.id)
      .setIssuer('exe-web-api').setAudience('exe-web').setJti(uuid()).setIssuedAt().setExpirationTime('30m').sign(Buffer.from(cfg.jwtSecret, 'base64'));
    setCookie(c, 'AUTH_TOKEN', jwt, { ...cookie, maxAge: 1800 });
    deleteCookie(c, 'XSRF-TOKEN', cookie);
    return userView(db, u);
  }
  app.get('/api/v1/auth/config', c => c.json({ password: true, google: cfg.googleEnabled, googleLoginUrl: cfg.googleEnabled ? '/api/v1/auth/oauth2/authorization/google' : null }));
  app.get('/api/v1/auth/csrf', c => {
    const token = getCookie(c, 'XSRF-TOKEN') || csrf(c);
    return c.json({ headerName: 'X-XSRF-TOKEN', token });
  });
  // Enforce CSRF before every mutation except signature/credential-protected provider endpoints.
  app.use('/api/*', async (c, next) => {
    const exempt = ['/api/v1/payments/payos/webhook', '/api/v1/internal/payments/reconcile'].includes(c.req.path);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && !exempt) {
      const token = getCookie(c, 'XSRF-TOKEN'); const supplied = c.req.header('X-XSRF-TOKEN');
      if (!token || !supplied || !same(token, supplied)) return fail(403, 'CSRF_REQUIRED');
    }
    await next();
  });
  // A fixed dummy hash gives missing accounts the same expensive password verification path.
  const dummyHash = bcrypt.hashSync(random(), 12);
  app.post('/api/v1/auth/login', async c => {
    const body = loginSchema.parse(await c.req.json());
    const u = (await all(db, 'SELECT * FROM app_users WHERE email=?', [body.email]))[0];
    const valid = await bcrypt.compare(body.password, u?.password_hash || dummyHash);
    if (!u || !u.enabled || !u.password_hash || !valid) return fail(401, 'INVALID_CREDENTIALS');
    // Keep the pre-verification version: a concurrent password reset invalidates this token.
    return c.json(await issue(c, u));
  });
  app.post('/api/v1/auth/register', async c => {
    const b = registerSchema.parse(await c.req.json());
    const existing = (await all(db, 'SELECT id FROM app_users WHERE email=?', [b.email]))[0];
    if (existing) return fail(409, 'ACCOUNT_EXISTS');
    const hash = await bcrypt.hash(b.password, 12);
    const u = await registerPasswordAccount(db, { email: b.email, passwordHash: hash, displayName: b.displayName });
    return c.json(await issue(c, u));
  });
  app.get('/api/v1/auth/me', async c => c.json(await userView(db, await authorize(db, requireActor(c)))));
  app.post('/api/v1/auth/logout', async c => {
    const actor = c.get('actor');
    if (actor) await execute(db, 'UPDATE app_users SET auth_version=auth_version+1 WHERE id=? AND auth_version=?', [actor.id, actor.version]);
    deleteCookie(c, 'AUTH_TOKEN', cookie); deleteCookie(c, 'XSRF-TOKEN', cookie); deleteCookie(c, 'SESSION', cookie);
    return c.body(null, 204);
  });
  let activeMail = 0; const mailQueue: Array<() => Promise<void>> = [];
  const drain = () => { while (activeMail < 2 && mailQueue.length) { activeMail++; void mailQueue.shift()!().catch(() => console.warn('Password recovery delivery failed')).finally(() => { activeMail--; drain(); }); } };
  const mail = sendMail ?? (async (recipient: string, url: string) => {
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${cfg.resendKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: cfg.mailFrom, to: [recipient], subject: 'Đặt lại mật khẩu — Nhà Này Hơi Báo!', text: `Mở liên kết sau trong vòng 15 phút để đặt lại mật khẩu:\n\n${url}\n\nNếu bạn không yêu cầu, hãy bỏ qua email này.` }) });
    if (!response.ok) throw new Error('Mail delivery failed');
  });
  app.post('/api/v1/auth/forgot-password', async c => {
    const b = z.object({ email }).parse(await c.req.json());
    if (!cfg.resetEnabled) return fail(503, 'RECOVERY_UNAVAILABLE');
    if (mailQueue.length >= 20) return fail(503, 'RECOVERY_BUSY');
    {
      mailQueue.push(async () => {
        const token = random(); const time = now();
        const delivery = await transaction(db, async tx => {
          const u = (await all(tx, 'SELECT * FROM app_users WHERE email=?', [b.email]))[0];
          if (!u?.enabled || !u.password_hash) return null;
          if ((await all(tx, 'SELECT user_id FROM password_reset_tokens WHERE user_id=? AND requested_at>?', [u.id, at(Date.now() - 60_000)])).length) return null;
          const previous = (await all(tx, 'SELECT * FROM password_reset_tokens WHERE user_id=?', [u.id]))[0];
          await execute(tx, 'DELETE FROM password_reset_tokens WHERE user_id=?', [u.id]);
          await execute(tx, 'INSERT INTO password_reset_tokens VALUES (?,?,?,?)', [u.id, digest(token), time, at(Date.now() + 900_000)]);
          return { email: u.email as string, id: u.id as string, version: u.auth_version, previous };
        });
        // Network I/O must not occupy Turso's write lock. On delivery failure, restore the
        // previous link only if this issuance is still current and no reset/revocation won the race.
        if (delivery) try { await mail(delivery.email, `${cfg.publicOrigin}/dat-lai-mat-khau#token=${token}`); }
        catch (error) {
          await transaction(db, async tx => {
            const current = (await all(tx, 'SELECT token_hash FROM password_reset_tokens WHERE user_id=?', [delivery.id]))[0];
            const u = (await all(tx, 'SELECT auth_version FROM app_users WHERE id=?', [delivery.id]))[0];
            if (current?.token_hash !== digest(token) || u?.auth_version !== delivery.version) return;
            await execute(tx, 'DELETE FROM password_reset_tokens WHERE user_id=?', [delivery.id]);
            const old = delivery.previous;
            if (old && old.expires_at > now()) await execute(tx, 'INSERT INTO password_reset_tokens VALUES (?,?,?,?)', [delivery.id, old.token_hash, old.requested_at, old.expires_at]);
          });
          throw error;
        }
      }); drain();
    }
    return c.json({ message: 'Nếu email thuộc tài khoản dùng mật khẩu, bạn sẽ nhận được liên kết khôi phục. Hãy kiểm tra cả thư rác.' }, 202);
  });
  app.post('/api/v1/auth/reset-password', async c => {
    if (!cfg.resetEnabled) return fail(503, 'RECOVERY_UNAVAILABLE');
    const b = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), password: password.min(8) }).parse(await c.req.json());
    const hash = await bcrypt.hash(b.password, 12);
    await transaction(db, async tx => {
      const rows = await all(tx, 'SELECT u.id FROM app_users u JOIN password_reset_tokens t ON t.user_id=u.id WHERE t.token_hash=? AND t.expires_at>? AND u.enabled=1 AND u.password_hash IS NOT NULL', [digest(b.token), now()]);
      if (!rows.length) return fail(400, 'INVALID_RESET_LINK');
      await execute(tx, 'UPDATE app_users SET password_hash=?,auth_version=auth_version+1 WHERE id=?', [hash, rows[0].id]);
      await execute(tx, 'DELETE FROM password_reset_tokens WHERE user_id=?', [rows[0].id]);
    });
    deleteCookie(c, 'AUTH_TOKEN', cookie); return c.body(null, 204);
  });
  app.get('/api/v1/auth/oauth2/authorization/google', async c => {
    if (!cfg.googleEnabled) return fail(404, 'NOT_FOUND');
    const state = random(), verifier = random(), nonce = random();
    await execute(db, 'DELETE FROM oauth_states WHERE expires_at<?', [now()]);
    await execute(db, 'INSERT INTO oauth_states VALUES (?,?,?,?)', [digest(state), verifier, nonce, at(Date.now() + 300_000)]);
    setCookie(c, 'OAUTH_STATE', state, { ...cookie, maxAge: 300 });
    const query = new URLSearchParams({ client_id: cfg.googleClientId, redirect_uri: `${cfg.publicOrigin}/api/v1/auth/oauth2/callback/google`, response_type: 'code', scope: 'openid email profile', state, nonce, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
    return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${query}`);
  });
  app.get('/api/v1/auth/oauth2/callback/google', async c => {
    deleteCookie(c, 'OAUTH_STATE', cookie);
    try {
      if (!cfg.googleEnabled) return fail(404, 'NOT_FOUND');
      const state = c.req.query('state') || '', code = c.req.query('code');
      if (!code || code.length > 4096 || !state || !same(state, getCookie(c, 'OAUTH_STATE') || '')) return fail(400, 'INVALID_OAUTH_STATE');
      const saved = await transaction(db, async tx => {
        const row = await one(tx, 'SELECT * FROM oauth_states WHERE state_hash=? AND expires_at>?', [digest(state), now()]);
        await execute(tx, 'DELETE FROM oauth_states WHERE state_hash=?', [digest(state)]); return row;
      });
      const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000), body: new URLSearchParams({ client_id: cfg.googleClientId, client_secret: cfg.googleClientSecret, code, code_verifier: saved.verifier, grant_type: 'authorization_code', redirect_uri: `${cfg.publicOrigin}/api/v1/auth/oauth2/callback/google` }) });
      if (!response.ok) return fail(401, 'OAUTH_FAILED');
      const tokens = await response.json() as { id_token: string };
      const { payload } = await jwtVerify(tokens.id_token, jwks, { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: cfg.googleClientId, algorithms: ['RS256'] });
      if (payload.nonce !== saved.nonce || payload.email_verified !== true || typeof payload.email !== 'string' || !payload.sub) return fail(401, 'OAUTH_FAILED');
      const normalizedEmail = email.parse(payload.email);
      const u = await googleAccount(db, { subject: payload.sub, email: normalizedEmail, displayName: String(payload.name || normalizedEmail).slice(0, 120) });
      await issue(c, u); return c.redirect('/');
    } catch { return c.redirect('/dang-nhap?authError=google'); }
  });
}
