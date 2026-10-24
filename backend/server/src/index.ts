import { serve } from '@hono/node-server';
import { randomBytes } from 'node:crypto';
import { database, initializeLocal, scalar, all, execute, uuid } from './db.ts';
import { azureMediaConfig, azureMediaStore, r2Config, r2Store } from './media.ts';
import { createApp } from './app.ts';
import { payosProvider } from './payments.ts';
import type { Config } from './auth.ts';
import bcrypt from 'bcryptjs';
import { initializeRbac } from './rbac.ts';

const production = process.env.NODE_ENV === 'production';
const config: Config = {
  production, publicOrigin: process.env.PUBLIC_ORIGIN || (production ? 'https://exe-webapp.pages.dev' : 'http://localhost:4200'),
  proxySecret: process.env.ORIGIN_PROXY_SECRET || '', jwtSecret: process.env.JWT_SECRET || (production ? '' : randomBytes(32).toString('base64')),
  googleClientId: process.env.GOOGLE_CLIENT_ID || process.env.SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || process.env.SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET || '',
  googleEnabled: process.env.GOOGLE_ENABLED === 'true', resetEnabled: process.env.PASSWORD_RESET_ENABLED === 'true', resendKey: process.env.RESEND_API_KEY || '', mailFrom: process.env.MAIL_FROM || '',
};
const origin = new URL(config.publicOrigin);
if (origin.origin !== config.publicOrigin || origin.username || origin.password || (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname)))) throw new Error('Invalid PUBLIC_ORIGIN');
if (Buffer.from(config.jwtSecret, 'base64').length < 32) throw new Error('JWT_SECRET must be a Base64 random key of at least 32 bytes');
if (production && config.proxySecret.length < 32) throw new Error('ORIGIN_PROXY_SECRET is required');
if (config.googleEnabled && (!config.googleClientId || !config.googleClientSecret)) throw new Error('Google OAuth credentials required');
if (config.resetEnabled && (!config.resendKey || !config.mailFrom || /[\r\n]/.test(config.mailFrom))) throw new Error('Mail credentials required');
if (production && (!process.env.TURSO_DATABASE_URL?.startsWith('libsql://') || !process.env.TURSO_AUTH_TOKEN)) throw new Error('Production requires remote TURSO_DATABASE_URL and TURSO_AUTH_TOKEN');
const db = database(process.env.TURSO_DATABASE_URL || 'file:local.sqlite', process.env.TURSO_AUTH_TOKEN);
await db.execute('PRAGMA foreign_keys=ON');
if (!production && !(await scalar(db, "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='runtime_schema'"))) await initializeLocal(db);
if (await scalar(db, 'SELECT MAX(version) FROM runtime_schema') !== 1) throw new Error('Unsupported database schema');
const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL, bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (bootstrapEmail || bootstrapPassword) {
  if (!bootstrapEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bootstrapEmail) || bootstrapEmail.length > 254 || !bootstrapPassword || bootstrapPassword.length < 12 || Buffer.byteLength(bootstrapPassword) > 72) throw new Error('Invalid bootstrap credentials');
  const email = bootstrapEmail.trim().toLowerCase();
  if (!(await all(db, 'SELECT id FROM app_users WHERE email=?', [email])).length) await execute(db, 'INSERT INTO app_users(id,email,password_hash,display_name,role) VALUES (?,?,?,?,?)', [uuid(), email, await bcrypt.hash(bootstrapPassword, 12), 'Administrator', 'ADMIN']);
}
await initializeRbac(db);
const r2 = r2Config(process.env);
const azure = azureMediaConfig(process.env);
const { app } = createApp(db, config, payosProvider(process.env), undefined, azure ? azureMediaStore(azure) : r2 ? r2Store(r2) : null);
const server = serve({ fetch: app.fetch, port: Number(process.env.PORT || 8080), hostname: '0.0.0.0' }, () => console.log('API listening'));
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { server.close(() => { db.close(); process.exit(0); }); setTimeout(() => { if ('closeAllConnections' in server) server.closeAllConnections(); db.close(); process.exit(0); }, 50_000).unref(); });
