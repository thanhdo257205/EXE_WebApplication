import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { SignJWT } from 'jose';
import type { Client } from '@libsql/client';
import { database, initializeLocal, execute, one, scalar, uuid, now } from '../src/db.ts';
import { createApp } from '../src/app.ts';
import { initializeRbac } from '../src/rbac.ts';
import { assistantFromEnv, type FetchLike } from '../src/assistant-providers.ts';
import { decodeMasterKey, decryptSecret, encryptSecret, fingerprintSecret, maskAccount, maskSecret } from '../src/assistant-crypto.ts';
import type { Config } from '../src/auth.ts';

const master = Buffer.alloc(32, 7);
const masterBase64 = master.toString('base64');

function fetchFixture() {
  const calls: string[] = [];
  const fetch: FetchLike = async (_url, init) => {
    const authorization = String((init.headers as Record<string, string>).Authorization ?? '');
    calls.push(authorization.replace(/^Bearer /, ''));
    if (authorization === 'Bearer db-key-1234') return Response.json({ choices: [{ message: { content: 'db answer' } }] });
    if (authorization === 'Bearer env-key') return Response.json({ choices: [{ message: { content: 'env answer' } }] });
    if (authorization === 'Bearer delegated-key-9999') return Response.json({ choices: [{ message: { content: 'delegated answer' } }] });
    return new Response(null, { status: 429 });
  };
  return { fetch, calls };
}

async function publishRelease(db: Client) {
  await execute(db, "INSERT INTO content_releases(id,version_label,title,status,current_slot,published_at) VALUES (?,'v1','Bản thử','PUBLISHED',1,?)", [uuid(), now()]);
}

async function fixture(options: { secret?: string | null } = {}) {
  const db = database('file::memory:'); await initializeLocal(db);
  const owner = uuid(), delegated = uuid(), customer = uuid();
  await execute(db, 'INSERT INTO app_users(id,email,display_name,role) VALUES (?,?,?,?)', [owner, owner + '@example.test', 'Chủ sở hữu', 'ADMIN']);
  await initializeRbac(db);
  for (const [id, role] of [[delegated, 'ADMIN'], [customer, 'CUSTOMER']] as const) {
    await execute(db, 'INSERT INTO app_users(id,email,display_name,role) VALUES (?,?,?,?)', [id, id + '@example.test', role, role]);
  }
  await publishRelease(db);
  const config: Config = { production: false, publicOrigin: 'http://localhost:4200', proxySecret: '', jwtSecret: randomBytes(32).toString('base64'), googleClientId: '', googleClientSecret: '', googleEnabled: false, resetEnabled: false, resendKey: '', mailFrom: '' };
  const env = { GROQ_API_KEY: 'env-key', GROQ_MODEL: 'env-model' };
  const fetchCalls = fetchFixture();
  const assistant = assistantFromEnv({ ...env, ...(options.secret === null ? {} : { ASSISTANT_KEY_SECRET: options.secret ?? masterBase64 }) }, fetchCalls.fetch);
  const { app, usage } = createApp(db, config, null, undefined, undefined, assistant);
  const token = (id: string, version = 0) => new SignJWT({ ver: version }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer('exe-web-api').setAudience('exe-web').setSubject(id).setJti(uuid()).setIssuedAt().setExpirationTime('30m')
    .sign(Buffer.from(config.jwtSecret, 'base64'));
  const tokens = new Map<string, string>(await Promise.all([owner, delegated, customer].map(async id => [id, await token(id)] as const)));
  const request = (method: string, path: string, who: string | null, body?: unknown, csrf = true) => app.request(path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(who ? { Cookie: `AUTH_TOKEN=${tokens.get(who)}; XSRF-TOKEN=test` } : {}),
      ...(csrf ? { 'X-XSRF-TOKEN': 'test' } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const createKey = (who: string, body: Record<string, unknown>) => request('POST', '/api/v1/admin/assistant/keys', who, body);
  const ask = (who: string, message: string) => request('POST', '/api/v1/assistant/chat', who, { message });
  return { db, app, owner, delegated, customer, request, createKey, ask, fetchCalls, usage };
}

test('AES-256-GCM credentials round-trip, bind owner/provider and reject tampering', () => {
  const encoded = encryptSecret(master, JSON.stringify({ key: 'secret-key' }), 'aad-1');
  assert.match(encoded, /^v1\./);
  assert.equal(decryptSecret(master, encoded, 'aad-1'), '{"key":"secret-key"}');
  assert.throws(() => decryptSecret(master, encoded, 'aad-2'));
  assert.throws(() => decryptSecret(Buffer.alloc(32, 8), encoded, 'aad-1'));
  // Flip the first Base64 character of the IV: the last character can share decoded bytes via unused bits.
  const tampered = encoded.slice(0, 3) + (encoded[3] === 'A' ? 'B' : 'A') + encoded.slice(4);
  assert.throws(() => decryptSecret(master, tampered, 'aad-1'));
  assert.equal(fingerprintSecret(master, 'groq', 'secret-key'), fingerprintSecret(master, 'groq', 'secret-key'));
  assert.notEqual(fingerprintSecret(master, 'groq', 'secret-key'), fingerprintSecret(master, 'gemini', 'secret-key'));
  assert.equal(maskSecret('abcdefgh1234'), '••••1234');
  assert.equal(maskAccount('account-id-12345678'), 'acco…5678');
  assert.equal(decodeMasterKey(masterBase64)?.length, 32);
  assert.equal(decodeMasterKey('not-base64!'), null);
  assert.equal(decodeMasterKey(Buffer.alloc(16).toString('base64')), null);
});

test('owner keys activate immediately, stay masked and every reveal is audited', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const created = await f.createKey(f.owner, { provider: 'groq', label: 'Groq chính', apiKey: 'db-key-1234' });
  assert.equal(created.status, 200);
  const item = (await created.json()).item;
  assert.equal(item.status, 'ACTIVE');
  assert.equal(item.hint, '••••1234');
  assert.equal(item.ownerDisplayName, 'Chủ sở hữu');
  assert.equal(item.canReveal, true);
  const stored = await one(f.db, 'SELECT * FROM assistant_credentials WHERE id=?', [item.id]);
  assert.match(stored.secret_enc, /^v1\./);
  assert.equal(String(stored.secret_enc).includes('db-key-1234'), false);
  assert.equal(stored.key_hint, '••••1234');

  const list = await (await f.request('GET', '/api/v1/admin/assistant/keys', f.owner)).json();
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].hint, '••••1234');
  assert.equal('secretEnc' in list.items[0], false);
  assert.equal('apiKey' in list.items[0], false);
  assert.equal(list.storageAvailable, true);
  assert.equal(list.items[0].canTest, true);

  const duplicate = await f.createKey(f.owner, { provider: 'groq', label: 'Trùng', apiKey: 'db-key-1234' });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).code, 'DUPLICATE_KEY');

  const reveal = await f.request('POST', `/api/v1/admin/assistant/keys/${item.id}/reveal`, f.owner);
  assert.equal(reveal.status, 200);
  assert.equal(reveal.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await reveal.json(), { apiKey: 'db-key-1234', accountId: null });
  const audit = await one(f.db, "SELECT * FROM audit_events WHERE action='ASSISTANT_KEY_REVEALED'");
  assert.equal(audit.entity_id, item.id);
  assert.match(audit.details_redacted, /scope=own/);

  assert.equal((await f.createKey(f.customer, { provider: 'groq', label: 'Khách', apiKey: 'customer-key-1' })).status, 403);
  assert.equal((await f.request('GET', '/api/v1/admin/assistant/keys', f.customer)).status, 403);
  assert.equal((await f.request('GET', '/api/v1/admin/assistant/keys', null)).status, 401);
});

test('delegated keys stay pending, are owner-approved and scoped to their creator', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const ownerKey = (await (await f.createKey(f.owner, { provider: 'groq', label: 'Owner key', apiKey: 'db-key-1234' })).json()).item;
  const pending = await f.createKey(f.delegated, { provider: 'groq', label: 'Key phụ', apiKey: 'delegated-key-9999' });
  assert.equal(pending.status, 200);
  const delegatedKey = (await pending.json()).item;
  assert.equal(delegatedKey.status, 'PENDING');
  assert.equal(delegatedKey.isMine, true);

  const ownList = await (await f.request('GET', '/api/v1/admin/assistant/keys', f.delegated)).json();
  assert.equal(ownList.canManage, false);
  assert.deepEqual(ownList.items.map((item: any) => item.id), [delegatedKey.id]);
  assert.equal((await f.request('POST', `/api/v1/admin/assistant/keys/${ownerKey.id}/reveal`, f.delegated)).status, 404);
  assert.equal((await f.request('PATCH', `/api/v1/admin/assistant/keys/${delegatedKey.id}`, f.delegated, { status: 'ACTIVE' })).status, 403);

  const ownerList = await (await f.request('GET', '/api/v1/admin/assistant/keys', f.owner)).json();
  assert.deepEqual(new Set(ownerList.items.map((item: any) => item.id)), new Set([ownerKey.id, delegatedKey.id]));
  assert.equal(ownerList.canManage, true);

  const approved = await f.request('PATCH', `/api/v1/admin/assistant/keys/${delegatedKey.id}`, f.owner, { status: 'ACTIVE' });
  assert.equal(approved.status, 200);
  assert.equal((await approved.json()).item.status, 'ACTIVE');
  assert.equal(await scalar(f.db, "SELECT COUNT(*) FROM audit_events WHERE action='ASSISTANT_KEY_APPROVED'"), 1);

  const ownReveal = await f.request('POST', `/api/v1/admin/assistant/keys/${delegatedKey.id}/reveal`, f.delegated);
  assert.equal(ownReveal.status, 200);
  assert.equal((await ownReveal.json()).apiKey, 'delegated-key-9999');
  assert.match((await one(f.db, "SELECT details_redacted FROM audit_events WHERE action='ASSISTANT_KEY_REVEALED'")).details_redacted, /scope=own/);

  const revoked = await f.request('DELETE', `/api/v1/admin/assistant/keys/${delegatedKey.id}`, f.delegated);
  assert.equal(revoked.status, 200);
  assert.equal((await f.request('POST', `/api/v1/admin/assistant/keys/${delegatedKey.id}/reveal`, f.owner)).status, 409);
  const afterRevoke = await (await f.request('GET', '/api/v1/admin/assistant/keys', f.owner)).json();
  assert.deepEqual(afterRevoke.items.map((item: any) => item.id), [ownerKey.id]);
  assert.equal((await one(f.db, 'SELECT secret_enc FROM assistant_credentials WHERE id=?', [delegatedKey.id])).secret_enc, '');
});

test('active database keys are used before env keys and fall back after disable', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const created = (await (await f.createKey(f.owner, { provider: 'groq', label: 'DB key', apiKey: 'db-key-1234' })).json()).item;

  const settings = await (await f.request('GET', '/api/v1/admin/assistant/settings', f.owner)).json();
  const groq = settings.providers.find((provider: any) => provider.id === 'groq');
  assert.deepEqual(groq.slots.map((slot: any) => slot.slot), [`db:${created.id}`, 'groq#1']);

  const first = await f.ask(f.customer, 'Cách chơi?');
  assert.equal(first.status, 200);
  assert.equal((await first.json()).answer, 'db answer');
  assert.deepEqual(f.fetchCalls.calls, ['db-key-1234']);

  assert.equal((await f.request('PATCH', `/api/v1/admin/assistant/keys/${created.id}`, f.owner, { status: 'DISABLED' })).status, 200);
  const second = await f.ask(f.customer, 'Luật chơi là gì?');
  assert.equal(second.status, 200);
  assert.equal((await second.json()).answer, 'env answer');
  assert.deepEqual(f.fetchCalls.calls, ['db-key-1234', 'env-key']);

  await f.usage.flush();
  const usage = await (await f.request('GET', '/api/v1/admin/assistant/usage?days=7', f.owner)).json();
  assert.deepEqual(new Set(usage.slots.map((slot: any) => slot.slot)), new Set([`db:${created.id}`, 'groq#1']));
  assert.ok(usage.providers.some((provider: any) => provider.provider === 'groq'));
});

test('without the master key key management is disabled while env providers keep working', async t => {
  const f = await fixture({ secret: null }); t.after(() => f.db.close());
  const list = await f.request('GET', '/api/v1/admin/assistant/keys', f.owner);
  assert.equal(list.status, 200);
  assert.equal((await list.json()).storageAvailable, false);
  const created = await f.createKey(f.owner, { provider: 'groq', label: 'Blocked', apiKey: 'blocked-key-1' });
  assert.equal(created.status, 503);
  assert.equal((await created.json()).code, 'KEY_STORAGE_UNAVAILABLE');
  assert.equal((await f.ask(f.customer, 'Cách chơi?')).status, 200);
  const tested = await f.request('POST', `/api/v1/admin/assistant/keys/${uuid()}/test`, f.owner);
  assert.equal(tested.status, 503);
  assert.equal((await tested.json()).code, 'KEY_STORAGE_UNAVAILABLE');
});

test('manual key test reports the provider outcome, is audited and never changes key state', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const good = (await (await f.createKey(f.owner, { provider: 'groq', label: 'Key tốt', apiKey: 'db-key-1234' })).json()).item;
  const exhausted = (await (await f.createKey(f.owner, { provider: 'groq', label: 'Hết hạn mức', apiKey: 'quota-key-0000' })).json()).item;

  const ok = await f.request('POST', `/api/v1/admin/assistant/keys/${good.id}/test`, f.owner);
  assert.equal(ok.status, 200);
  const okBody = await ok.json();
  assert.equal(okBody.status, 'OK');
  assert.equal(okBody.code, null);
  assert.equal(okBody.provider, 'groq');
  assert.equal(okBody.model, 'env-model');
  assert.equal(typeof okBody.latencyMs, 'number');
  assert.match(okBody.testedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(JSON.stringify(okBody).includes('db-key-1234'), false);
  assert.ok(f.fetchCalls.calls.includes('db-key-1234'));
  assert.equal((await one(f.db, 'SELECT status FROM assistant_credentials WHERE id=?', [good.id])).status, 'ACTIVE');
  const auditRow = await one(f.db, "SELECT * FROM audit_events WHERE action='ASSISTANT_KEY_TESTED' AND entity_id=?", [good.id]);
  assert.equal(auditRow.outcome, 'SUCCESS');
  assert.equal(String(auditRow.details_redacted).includes('db-key-1234'), false);
  assert.match(auditRow.details_redacted, /result=OK/);

  const failed = await f.request('POST', `/api/v1/admin/assistant/keys/${exhausted.id}/test`, f.owner);
  assert.equal(failed.status, 200);
  const failedBody = await failed.json();
  assert.equal(failedBody.status, 'FAILED');
  assert.equal(failedBody.code, 'QUOTA');
  assert.equal((await one(f.db, 'SELECT status FROM assistant_credentials WHERE id=?', [exhausted.id])).status, 'ACTIVE');
  const failedAudit = await one(f.db, "SELECT * FROM audit_events WHERE action='ASSISTANT_KEY_TESTED' AND entity_id=?", [exhausted.id]);
  assert.equal(failedAudit.outcome, 'FAILURE');
  assert.match(failedAudit.details_redacted, /code=QUOTA/);

  const retry = await f.request('POST', `/api/v1/admin/assistant/keys/${exhausted.id}/test`, f.owner);
  assert.equal(retry.status, 429);
  assert.equal((await retry.json()).code, 'KEY_TEST_COOLDOWN');
  assert.ok(Number(retry.headers.get('retry-after')) > 0);

  assert.equal((await f.request('DELETE', `/api/v1/admin/assistant/keys/${good.id}`, f.owner)).status, 200);
  const revoked = await f.request('POST', `/api/v1/admin/assistant/keys/${good.id}/test`, f.owner);
  assert.equal(revoked.status, 409);
  assert.equal((await revoked.json()).code, 'KEY_REVOKED');
});

test('key tests follow reveal scoping and leave pending keys pending', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const ownerKey = (await (await f.createKey(f.owner, { provider: 'groq', label: 'Owner key', apiKey: 'db-key-1234' })).json()).item;
  const pending = (await (await f.createKey(f.delegated, { provider: 'groq', label: 'Key phụ', apiKey: 'delegated-key-9999' })).json()).item;

  const foreign = await f.request('POST', `/api/v1/admin/assistant/keys/${ownerKey.id}/test`, f.delegated);
  assert.equal(foreign.status, 404);
  assert.equal((await f.request('POST', `/api/v1/admin/assistant/keys/${pending.id}/test`, f.customer)).status, 403);
  // Without a session the CSRF middleware rejects the unsafe method before authentication.
  assert.equal((await f.request('POST', `/api/v1/admin/assistant/keys/${pending.id}/test`, null)).status, 403);

  const own = await f.request('POST', `/api/v1/admin/assistant/keys/${pending.id}/test`, f.delegated);
  assert.equal(own.status, 200);
  assert.equal((await own.json()).status, 'OK');
  assert.equal((await one(f.db, 'SELECT status FROM assistant_credentials WHERE id=?', [pending.id])).status, 'PENDING');

  const ownerTest = await f.request('POST', `/api/v1/admin/assistant/keys/${ownerKey.id}/test`, f.owner);
  assert.equal(ownerTest.status, 200);
  assert.equal((await ownerTest.json()).status, 'OK');
});
