import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash, createHmac } from 'node:crypto';
import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';
import { database, initializeLocal, execute, all, uuid } from '../src/db.ts';
import { createApp } from '../src/app.ts';
import type { Config } from '../src/auth.ts';
import { detectImage, MAX_IMAGE_BYTES, r2Config, r2Store, signPut, type MediaStore } from '../src/media.ts';

const png = (extra = 40) => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...randomBytes(extra)]);
const webp = Uint8Array.from([...Buffer.from('RIFF'), 1, 2, 3, 4, ...Buffer.from('WEBP'), ...randomBytes(20)]);

async function fixture(store: MediaStore | null) {
  const db = database('file::memory:'); await initializeLocal(db);
  const config: Config = { production: false, publicOrigin: 'http://localhost:4200', proxySecret: 'test-proxy-secret-at-least-32-characters', jwtSecret: randomBytes(32).toString('base64'), googleClientId: '', googleClientSecret: '', googleEnabled: false, resetEnabled: false, resendKey: '', mailFrom: '' };
  const admin = uuid(), user = uuid();
  for (const [id, role] of [[admin, 'ADMIN'], [user, 'CUSTOMER']]) await execute(db, 'INSERT INTO app_users(id,email,password_hash,display_name,role) VALUES (?,?,?,?,?)', [id, id + '@example.test', await bcrypt.hash('x'.repeat(12), 4), role, role]);
  const token = (id: string) => new SignJWT({ ver: 0 }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setIssuer('exe-web-api').setAudience('exe-web').setSubject(id).setJti(uuid()).setIssuedAt().setExpirationTime('30m').sign(Buffer.from(config.jwtSecret, 'base64'));
  const tokens = { admin: await token(admin), user: await token(user) };
  const { app } = createApp(db, config, null, undefined, store);
  const upload = (who: 'admin' | 'user' | null, body: Uint8Array | undefined, headers: Record<string, string> = {}) => app.request('/api/v1/admin/media/card-image', {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream', ...(who ? { Cookie: `AUTH_TOKEN=${tokens[who]}; XSRF-TOKEN=t`, 'X-XSRF-TOKEN': 't' } : {}), ...headers }, ...(body ? { body: body as BodyInit } : {}),
  });
  return { db, upload };
}

test('nhận diện ảnh theo chữ ký byte, không theo Content-Type', () => {
  assert.equal(detectImage(png())?.ext, 'png');
  assert.equal(detectImage(webp)?.type, 'image/webp');
  assert.equal(detectImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...randomBytes(20)]))?.ext, 'jpg');
  assert.equal(detectImage(Buffer.from('<svg onload="alert(1)"></svg>......')), null);
  assert.equal(detectImage(Buffer.from('GIF89a..............')), null);
});

test('cấu hình R2: thiếu biến thì tắt, sai định dạng thì báo lỗi, không lộ giá trị', () => {
  assert.equal(r2Config({}), null);
  assert.equal(r2Config({ R2_ACCOUNT_ID: 'a'.repeat(32), R2_BUCKET: 'the-bai' }), null);
  assert.throws(() => r2Config({ R2_ACCOUNT_ID: 'x', R2_BUCKET: 'the-bai', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's' }), /Invalid R2 configuration/);
  assert.deepEqual(r2Config({ R2_ACCOUNT_ID: 'a'.repeat(32), R2_BUCKET: 'the-bai', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's' })?.bucket, 'the-bai');
});

test('SigV4: chữ ký khớp phép tính độc lập và thay đổi theo nội dung', () => {
  const cfg = { accountId: 'a'.repeat(32), bucket: 'the-bai', accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret-for-test' };
  const date = new Date('2026-10-23T12:00:00Z'), body = png();
  const { url, headers } = signPut(cfg, 'cards/abc.png', body, 'image/png', date);
  assert.equal(url, `https://${'a'.repeat(32)}.r2.cloudflarestorage.com/the-bai/cards/abc.png`);
  assert.equal(headers['x-amz-date'], '20261023T120000Z');
  const payload = createHash('sha256').update(body).digest('hex');
  assert.equal(headers['x-amz-content-sha256'], payload);
  const h = (k: string, d: string) => createHmac('sha256', k).update(d).digest();
  const canonical = ['PUT', '/the-bai/cards/abc.png', '', `content-type:image/png\n`, `host:${'a'.repeat(32)}.r2.cloudflarestorage.com\n`, `x-amz-content-sha256:${payload}\n`, `x-amz-date:20261023T120000Z\n`, 'content-type;host;x-amz-content-sha256;x-amz-date', payload].join('\n');
  const key = h(h(h(h('AWS4secret-for-test', '20261023') as any, 'auto') as any, 's3') as any, 'aws4_request');
  const sig = createHmac('sha256', key).update(['AWS4-HMAC-SHA256', '20261023T120000Z', '20261023/auto/s3/aws4_request', createHash('sha256').update(canonical).digest('hex')].join('\n')).digest('hex');
  assert.match(headers['authorization'], new RegExp(`Credential=AKIDEXAMPLE/20261023/auto/s3/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=${sig}$`));
  assert.notEqual(signPut(cfg, 'cards/abc.png', png(), 'image/png', date).headers['authorization'], headers['authorization']);
});

test('r2Store gửi PUT đã ký và báo lỗi khi kho từ chối', async () => {
  const cfg = { accountId: 'b'.repeat(32), bucket: 'the-bai', accessKeyId: 'k', secretAccessKey: 's' };
  let seen: { url: string; method?: string; auth?: string } | null = null;
  await r2Store(cfg, (async (url: string, init: RequestInit) => { seen = { url, method: init.method, auth: (init.headers as Record<string, string>).authorization }; return new Response(null, { status: 200 }); }) as any).put('cards/x.png', png(), 'image/png');
  assert.equal(seen!.method, 'PUT'); assert.match(seen!.auth!, /^AWS4-HMAC-SHA256 /);
  await assert.rejects(r2Store(cfg, (async () => new Response('denied', { status: 403 })) as any).put('cards/x.png', png(), 'image/png'), /rejected/);
});

test('tải ảnh thẻ: chỉ ADMIN, kiểm tra loại/dung lượng, khóa theo hash, ghi nhật ký', async t => {
  const puts: { key: string; bytes: number; type: string }[] = [];
  const f = await fixture({ put: async (key, body, type) => { puts.push({ key, bytes: body.length, type }); } }); t.after(() => f.db.close());
  const body = png(200);
  assert.equal((await f.upload(null, body)).status, 403);
  assert.equal((await f.upload('user', body)).status, 403);
  assert.equal((await f.upload('admin', body, { 'X-XSRF-TOKEN': 'wrong' })).status, 403);
  assert.equal((await f.upload('admin', undefined)).status, 400);
  assert.equal((await f.upload('admin', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).status, 415);
  assert.equal((await f.upload('admin', new Uint8Array(MAX_IMAGE_BYTES + 1).fill(1))).status, 413);
  assert.equal(puts.length, 0);
  const ok = await f.upload('admin', body); assert.equal(ok.status, 201);
  const json = await ok.json(); const hash = createHash('sha256').update(body).digest('hex');
  assert.equal(json.url, `/media/cards/${hash}.png`); assert.equal(json.contentType, 'image/png');
  assert.deepEqual(puts, [{ key: `cards/${hash}.png`, bytes: body.length, type: 'image/png' }]);
  assert.equal((await all(f.db, "SELECT * FROM audit_events WHERE action='MEDIA_CARD_IMAGE_UPLOADED'")).length, 1);
  assert.equal((await f.upload('admin', webp)).status, 201);
});

test('chưa cấu hình R2 thì 503 rõ ràng; lỗi kho trả 503 không lộ chi tiết', async t => {
  const off = await fixture(null); t.after(() => off.db.close());
  assert.equal((await off.upload('admin', png())).status, 503);
  const bad = await fixture({ put: async () => { throw Object.assign(new Error('secret-detail'), { code: 'HTTP_STORAGE_FAILED' }); } }); t.after(() => bad.db.close());
  const res = await bad.upload('admin', png()); assert.equal(res.status, 503);
  assert.doesNotMatch(await res.text(), /secret-detail/);
});
