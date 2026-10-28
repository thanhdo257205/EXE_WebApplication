import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { SignJWT } from 'jose';
import { database, initializeLocal, execute, one, scalar, uuid } from '../src/db.ts';
import { createApp } from '../src/app.ts';
import { initializeRbac } from '../src/rbac.ts';
import { initializeAssistantSettings } from '../src/assistant-settings.ts';
import { initializeAssistantCredentials } from '../src/assistant-credentials.ts';
import { initializeAssistantUsage } from '../src/assistant-usage.ts';
import { initializeContentAuthorship } from '../src/content.ts';
import { assistantFromEnv, type FetchLike } from '../src/assistant-providers.ts';
import { DEFAULT_DELEGATED_PERMISSIONS, GRANTABLE_PERMISSIONS, OWNER_ONLY_PERMISSIONS, decodePermissions, effectivePermissions, normalizePermissions } from '../src/rbac-policy.ts';
import type { Config } from '../src/auth.ts';
import type { MediaStore } from '../src/media.ts';

const webp = Uint8Array.from([...Buffer.from('RIFF'), 1, 2, 3, 4, ...Buffer.from('WEBP'), ...randomBytes(20)]);

/** The catalog is the contract the UI mirrors: keys stay stable, module reads are implied. */
test('permission catalog normalizes dependencies, keeps canonical order and ignores unknown keys', () => {
  assert.deepEqual(normalizePermissions(['cards:update', 'cards:update', 'bogus:x']), ['content:read', 'cards:update']);
  assert.deepEqual(normalizePermissions(['assistant:keys:manage']), ['assistant:read', 'assistant:keys:read', 'assistant:keys:reveal', 'assistant:keys:test', 'assistant:keys:revoke', 'assistant:keys:manage']);
  assert.deepEqual(normalizePermissions(['assistant:keys:read']), ['assistant:read', 'assistant:keys:read']);
  assert.deepEqual(normalizePermissions(['assistant:read', 'assistant:usage:read']), ['assistant:read', 'assistant:usage:read']);
  assert.deepEqual(normalizePermissions(['media:upload']), ['content:read', 'media:upload']);
  assert.deepEqual(normalizePermissions(['cards:create', 'cards:create'].concat(OWNER_ONLY_PERMISSIONS as unknown as string[])), ['content:read', 'cards:create']);
  assert.deepEqual(decodePermissions('{"not":"an array"}'), []);
  assert.deepEqual(decodePermissions('null'), []);
  assert.deepEqual(decodePermissions('[1,"cards:update",null]'), ['content:read', 'cards:update']);
  assert.deepEqual(effectivePermissions('CUSTOMER', false, null), []);
  assert.deepEqual(effectivePermissions('ADMIN', true, []), [...GRANTABLE_PERMISSIONS, ...OWNER_ONLY_PERMISSIONS]);
  assert.deepEqual(effectivePermissions('ADMIN', false, null), [...DEFAULT_DELEGATED_PERMISSIONS]);
  assert.deepEqual(effectivePermissions('ADMIN', false, []), []);
  assert.equal(DEFAULT_DELEGATED_PERMISSIONS.includes('assistant:keys:manage'), false);
  assert.equal(GRANTABLE_PERMISSIONS.some(permission => (OWNER_ONLY_PERMISSIONS as readonly string[]).includes(permission)), false);
});

async function fixture() {
  const db = database('file::memory:'); await initializeLocal(db);
  await initializeRbac(db);
  await initializeAssistantSettings(db);
  await initializeAssistantCredentials(db);
  await initializeAssistantUsage(db);
  const owner = uuid(), co = uuid(), customer = uuid();
  for (const [id, role] of [[owner, 'ADMIN'], [co, 'ADMIN'], [customer, 'CUSTOMER']] as const) {
    await execute(db, 'INSERT INTO app_users(id,email,display_name,role) VALUES (?,?,?,?)', [id, id + '@example.test', role, role]);
  }
  await execute(db, 'INSERT INTO rbac_owner(slot,user_id) VALUES (1,?)', [owner]);
  const config: Config = { production: false, publicOrigin: 'http://localhost:4200', proxySecret: '', jwtSecret: randomBytes(32).toString('base64'), googleClientId: '', googleClientSecret: '', googleEnabled: false, resetEnabled: false, resendKey: '', mailFrom: '' };
  const uploaded: string[] = [];
  const store: MediaStore = { put: async key => { uploaded.push(key); } };
  const fetchImpl: FetchLike = async () => Response.json({ choices: [{ message: { content: 'ok' } }] });
  const assistant = assistantFromEnv({ GROQ_API_KEY: 'env-key', ASSISTANT_KEY_SECRET: Buffer.alloc(32, 7).toString('base64') }, fetchImpl);
  const { app } = createApp(db, config, null, undefined, store, assistant);
  const tokens = new Map<string, string>();
  const sign = async (id: string, version = 0) => {
    tokens.set(id, await new SignJWT({ ver: version }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(id).setIssuer('exe-web-api').setAudience('exe-web').setJti(uuid()).setIssuedAt().setExpirationTime('30m')
      .sign(Buffer.from(config.jwtSecret, 'base64')));
  };
  for (const id of [owner, co, customer]) await sign(id);
  const request = (method: string, path: string, who: string | null, body?: unknown, csrf = true) => app.request(path, {
    method,
    headers: {
      ...(who ? { Cookie: `AUTH_TOKEN=${tokens.get(who)}; XSRF-TOKEN=t` } : {}),
      ...(csrf ? { 'X-XSRF-TOKEN': 't' } : {}),
      ...(!body || body instanceof Uint8Array ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: body instanceof Uint8Array ? (body as BodyInit) : JSON.stringify(body) }),
  });
  const assign = (who: string | null, id: string, permissions: string[], expectedVersion: number) =>
    request('PUT', `/api/v1/admin/users/${id}/permissions`, who, { permissions, expectedVersion });
  const me = async (who: string) => (await request('GET', '/api/v1/auth/me', who)).json();
  // A draft release with one set and one card, written by the owner: version is 2 afterwards.
  const release = await (await request('POST', '/api/v1/admin/content/releases', owner, { title: 'Nội dung thử', versionLabel: 'rbac-v1' })).json();
  const set = await (await request('POST', `/api/v1/admin/content/releases/${release.id}/card-sets`, owner, { expectedVersion: 0, code: 'TEST', slug: 'test-set', name: 'Bộ thử' })).json();
  const card = { expectedVersion: 1, code: 'CARD', slug: 'the-thu', name: 'Thẻ thử', cardSetId: set.entityId, effectText: 'Hiệu ứng', ruleStatus: 'CONFIRMED', copiesInDeck: 1 };
  const createdCard = await (await request('POST', `/api/v1/admin/content/releases/${release.id}/cards`, owner, card)).json();
  return { db, owner, co, customer, request, assign, me, sign, release, set, card, cardId: createdCard.entityId as string, uploaded };
}

test('owner stores a normalized set that replaces the default and gates each module', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const before = await f.me(f.co);
  assert.deepEqual(before.permissions, [...DEFAULT_DELEGATED_PERMISSIONS]);
  assert.equal(before.customPermissions, false);

  const stored = await (await f.assign(f.owner, f.co, ['cards:update', 'wiki:create', 'feedback:read'], 0)).json();
  assert.equal(stored.changed, true);
  assert.equal(stored.account.customPermissions, true);
  assert.equal(stored.account.permissionsVersion, 1);
  assert.deepEqual(stored.account.permissions, ['content:read', 'cards:update', 'wiki:create', 'feedback:read']);
  assert.deepEqual((await f.me(f.co)).permissions, stored.account.permissions);

  // The two granted writes work, and the implied content:read keeps the module usable.
  assert.equal((await f.request('GET', `/api/v1/admin/content/releases/${f.release.id}`, f.co)).status, 200);
  assert.equal((await f.request('PUT', `/api/v1/admin/content/releases/${f.release.id}/cards/${f.cardId}`, f.co, { ...f.card, expectedVersion: 2, name: 'Thẻ đổi' })).status, 200);
  assert.equal((await f.request('POST', `/api/v1/admin/content/releases/${f.release.id}/wiki-pages`, f.co, { expectedVersion: 3, code: 'FAQ', slug: 'hoi-dap', pageType: 'FAQ', title: 'Hỏi đáp', bodyMarkdown: 'nội dung', ruleStatus: 'CONFIRMED' })).status, 201);
  assert.equal((await f.request('GET', '/api/v1/admin/feedback', f.co)).status, 200);

  const denied = async (method: string, path: string, body?: unknown) => {
    const response = await f.request(method, path, f.co, body);
    assert.equal(response.status, 403, `${method} ${path}`);
    assert.equal((await response.json()).code, 'PERMISSION_REQUIRED');
  };
  await denied('POST', '/api/v1/admin/content/releases', { title: 'Khác', versionLabel: 'rbac-v2' });
  await denied('PUT', `/api/v1/admin/content/releases/${f.release.id}`, { expectedVersion: 4, title: 'Đổi tên' });
  await denied('POST', `/api/v1/admin/content/releases/${f.release.id}/cards`, { ...f.card, expectedVersion: 4, code: 'NEW', slug: 'the-moi' });
  await denied('DELETE', `/api/v1/admin/content/releases/${f.release.id}/cards/${f.cardId}?expectedVersion=4`);
  await denied('POST', '/api/v1/admin/media/card-image', webp);
  await denied('GET', '/api/v1/admin/users');
  await denied('GET', '/api/v1/admin/assistant/settings');
  await denied('POST', '/api/v1/admin/assistant/keys', { provider: 'groq', label: 'Key', apiKey: 'some-key-1' });
  assert.equal(f.uploaded.length, 0);

  const audit = await one(f.db, "SELECT * FROM audit_events WHERE action='USER_PERMISSIONS_CHANGED'");
  assert.equal(audit.actor_id, f.owner); assert.equal(audit.entity_id, f.co);
  // The diff is against the effective set, so nothing here is really new for a default co-admin.
  assert.match(audit.details_redacted, /^added=;removed=/);
  assert.match(audit.details_redacted, /removed=[^;]*assistant:read/);
  assert.match(audit.details_redacted, /version=1;source=admin-permissions/);
});

test('permission writes are owner-only, validated, versioned and never disturb the session', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  assert.equal((await f.assign(f.co, f.co, ['cards:update'], 0)).status, 403);
  assert.equal((await f.assign(f.customer, f.co, ['cards:update'], 0)).status, 403);
  assert.equal((await f.assign(null, f.co, ['cards:update'], 0)).status, 403, 'an anonymous write fails the CSRF check before the actor check');
  assert.equal((await f.assign(f.owner, f.owner, [], 0)).status, 403);
  assert.equal((await f.assign(f.owner, f.customer, [], 0)).status, 409);
  assert.equal((await f.assign(f.owner, uuid(), [], 0)).status, 404);

  assert.equal((await f.assign(f.owner, f.co, ['users:manage-roles'], 0)).status, 400);
  assert.equal((await f.assign(f.owner, f.co, ['permissions:manage'], 0)).status, 400);
  assert.equal((await f.assign(f.owner, f.co, ['content:admin'], 0)).status, 400);
  assert.equal((await f.request('PUT', `/api/v1/admin/users/${f.co}/permissions`, f.owner, { permissions: [], expectedVersion: 0, role: 'ADMIN' })).status, 400);

  const first = await (await f.assign(f.owner, f.co, ['cards:update'], 0)).json();
  assert.equal(first.account.version, 0, 'a permission change keeps the current session valid');
  assert.equal((await f.request('GET', '/api/v1/admin/users', f.co)).status, 403);
  assert.equal((await f.assign(f.owner, f.co, ['wiki:update'], 99)).status, 409);
  const second = await (await f.assign(f.owner, f.co, ['wiki:update'], 1)).json();
  assert.deepEqual(second.account.permissions, ['content:read', 'wiki:update']);
  assert.equal(second.account.permissionsVersion, 2);
  const unchanged = await (await f.assign(f.owner, f.co, ['content:read', 'wiki:update'], 2)).json();
  assert.equal(unchanged.changed, false);
  assert.equal(unchanged.account.permissionsVersion, 2);
  assert.equal(await scalar(f.db, "SELECT COUNT(*) FROM audit_events WHERE action='USER_PERMISSIONS_CHANGED'"), 2);

  // keys:manage is not part of the default set, so the audit diff records it as an addition.
  assert.equal((await f.assign(f.owner, f.co, ['assistant:keys:manage'], 2)).status, 200);
  const widened = await one(f.db, "SELECT details_redacted FROM audit_events WHERE action='USER_PERMISSIONS_CHANGED' AND details_redacted LIKE '%version=3;%'");
  assert.match(widened.details_redacted, /added=[^;]*assistant:keys:manage/);
  assert.match(widened.details_redacted, /removed=[^;]*wiki:update/);

  // A disabled account keeps its stored set but cannot use it, and no write is accepted for it.
  await execute(f.db, 'UPDATE app_users SET enabled=0 WHERE id=?', [f.co]);
  assert.equal((await f.assign(f.owner, f.co, ['cards:update'], 3)).status, 409);
  assert.equal((await f.request('GET', '/api/v1/auth/me', f.co)).status, 401);
});

test('an empty set locks every admin write while the admin can still reach the console', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const stored = await (await f.assign(f.owner, f.co, [], 0)).json();
  assert.equal(stored.changed, true);
  assert.deepEqual(stored.account.permissions, []);
  assert.equal((await f.request('GET', '/api/v1/admin/users', f.co)).status, 403);
  assert.equal((await f.request('POST', '/api/v1/admin/content/releases', f.co, { title: 'Khóa', versionLabel: 'lock-v1' })).status, 403);
  assert.equal((await f.request('GET', '/api/v1/admin/assistant/settings', f.co)).status, 403);
  assert.equal((await f.request('GET', '/api/v1/admin/assistant/keys', f.co)).status, 403);
  // The overview and the notification tray stay ADMIN-only so a locked co-admin is not locked out of sign-in.
  assert.equal((await f.request('GET', '/api/v1/admin/dashboard', f.co)).status, 200);
  assert.equal((await f.request('GET', '/api/v1/admin/notifications', f.co)).status, 200);
});

test('role changes drop custom grants and the promoted account returns to the default set', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  await f.assign(f.owner, f.co, ['cards:update'], 0);
  assert.equal((await f.me(f.co)).customPermissions, true);

  assert.equal((await f.request('PUT', `/api/v1/admin/users/${f.co}/role`, f.owner, { role: 'CUSTOMER', expectedVersion: 0 })).status, 200);
  assert.equal(await scalar(f.db, 'SELECT COUNT(*) FROM admin_permission_sets'), 0);
  await f.sign(f.co, 1);
  assert.deepEqual((await f.me(f.co)).permissions, []);

  await f.sign(f.co, 1);
  assert.equal((await f.request('PUT', `/api/v1/admin/users/${f.co}/role`, f.owner, { role: 'ADMIN', expectedVersion: 1 })).status, 200);
  await f.sign(f.co, 2);
  const promoted = await f.me(f.co);
  assert.deepEqual(promoted.permissions, [...DEFAULT_DELEGATED_PERMISSIONS]);
  assert.equal(promoted.customPermissions, false);
  assert.equal(await scalar(f.db, 'SELECT COUNT(*) FROM admin_permission_sets'), 0);
});

test('the users list exposes stored sets only to the owner and an audit failure rolls the set back', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  await f.assign(f.owner, f.co, ['cards:update', 'users:read'], 0);
  const ownerList = await (await f.request('GET', '/api/v1/admin/users', f.owner)).json();
  assert.equal(ownerList.canManageRoles, true);
  assert.equal(ownerList.canManagePermissions, true);
  assert.deepEqual(ownerList.items.find((item: any) => item.id === f.co).permissions, ['content:read', 'cards:update', 'users:read']);
  assert.equal(ownerList.items.find((item: any) => item.id === f.owner).customPermissions, false);

  const delegatedList = await (await f.request('GET', '/api/v1/admin/users', f.co)).json();
  assert.equal(delegatedList.canManagePermissions, false);
  assert.equal(delegatedList.items.every((item: any) => !('permissions' in item)), true);

  await execute(f.db, "CREATE TRIGGER reject_permission_audit BEFORE INSERT ON audit_events WHEN NEW.action='USER_PERMISSIONS_CHANGED' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
  assert.equal((await f.assign(f.owner, f.co, ['wiki:update'], 1)).status, 409);
  const stored = await one(f.db, 'SELECT permissions,version FROM admin_permission_sets WHERE user_id=?', [f.co]);
  assert.equal(stored.version, 1);
  assert.deepEqual(JSON.parse(stored.permissions), ['content:read', 'cards:update', 'users:read']);
});

test('assistant settings require the permission of each changed field instead of a blanket admin switch', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const full = await (await f.request('GET', '/api/v1/admin/assistant/settings', f.co)).json();
  assert.equal(full.canManage, true);
  assert.equal(full.canReadUsage, true);
  assert.deepEqual(full.settings.order, ['groq']);

  await f.assign(f.owner, f.co, ['assistant:models:update'], 0);
  const body = async (override: Record<string, unknown> = {}) => {
    const { settings } = await (await f.request('GET', '/api/v1/admin/assistant/settings', f.co)).json();
    return { order: settings.order, models: settings.models, disabledSlots: settings.disabledSlots, tokenBudgets: settings.tokenBudgets, expectedVersion: settings.version, ...override };
  };
  const limited = await (await f.request('GET', '/api/v1/admin/assistant/settings', f.co)).json();
  assert.equal(limited.canEditModels, true);
  assert.equal(limited.canReorder, false);
  assert.equal(limited.canManageSlots, false);
  assert.equal(limited.canEditBudgets, false);
  assert.equal(limited.canReadUsage, false);
  assert.equal((await f.request('GET', '/api/v1/admin/assistant/usage', f.co)).status, 403);

  const saved = await f.request('PUT', '/api/v1/admin/assistant/settings', f.co, await body({ models: { ...limited.settings.models, groq: 'groq-fast' } }));
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).changed, true);

  // An unrelated field is refused before anything is written.
  const refused = await f.request('PUT', '/api/v1/admin/assistant/settings', f.co, await body({ tokenBudgets: { groq: 1000 } }));
  assert.equal(refused.status, 403);
  assert.equal((await refused.json()).code, 'PERMISSION_REQUIRED');
  assert.equal((await (await f.request('GET', '/api/v1/admin/assistant/settings', f.co)).json()).settings.tokenBudgets.groq, undefined);

  // A replay that changes nothing needs no write permission and leaves the version alone.
  const noop = await (await f.request('PUT', '/api/v1/admin/assistant/settings', f.co, await body())).json();
  assert.equal(noop.changed, false);
  assert.equal(noop.settings.version, 1);
  assert.equal(await scalar(f.db, "SELECT COUNT(*) FROM audit_events WHERE action='ASSISTANT_SETTINGS_UPDATED'"), 1);
});

test('key permissions scope each action to the creator unless keys:manage is granted', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const ownerKey = (await (await f.request('POST', '/api/v1/admin/assistant/keys', f.owner, { provider: 'groq', label: 'Key chủ', apiKey: 'owner-key-1234' })).json()).item;
  await f.assign(f.owner, f.co, ['assistant:keys:create', 'assistant:keys:reveal', 'assistant:keys:test', 'assistant:keys:revoke'], 0);

  const created = await (await f.request('POST', '/api/v1/admin/assistant/keys', f.co, { provider: 'groq', label: 'Key phụ', apiKey: 'co-key-5678' })).json();
  assert.equal(created.item.status, 'PENDING', 'only keys:manage activates a key on creation');
  assert.equal(created.item.canReveal, true);
  assert.equal(created.item.canRevoke, true);
  assert.equal(created.item.canManageStatus, false);

  const list = await (await f.request('GET', '/api/v1/admin/assistant/keys', f.co)).json();
  assert.equal(list.canManage, false);
  assert.equal(list.canCreate, true);
  assert.deepEqual(list.items.map((item: any) => item.id), [created.item.id]);
  assert.equal((await f.request('POST', `/api/v1/admin/assistant/keys/${ownerKey.id}/reveal`, f.co)).status, 404);
  assert.equal((await f.request('POST', `/api/v1/admin/assistant/keys/${ownerKey.id}/test`, f.co)).status, 404);
  assert.equal((await f.request('DELETE', `/api/v1/admin/assistant/keys/${ownerKey.id}`, f.co)).status, 404);
  assert.equal((await f.request('PATCH', `/api/v1/admin/assistant/keys/${created.item.id}`, f.co, { status: 'ACTIVE' })).status, 403);
  assert.equal((await f.request('POST', `/api/v1/admin/assistant/keys/${created.item.id}/reveal`, f.co)).status, 200);

  // Dropping the action grants locks the plaintext and the delete, even for the creator's own key.
  await f.assign(f.owner, f.co, ['assistant:keys:read'], 1);
  assert.equal((await f.request('POST', `/api/v1/admin/assistant/keys/${created.item.id}/reveal`, f.co)).status, 403);
  assert.equal((await f.request('DELETE', `/api/v1/admin/assistant/keys/${created.item.id}`, f.co)).status, 403);
  assert.equal((await f.request('POST', '/api/v1/admin/assistant/keys', f.co, { provider: 'groq', label: 'Khác', apiKey: 'third-key-1' })).status, 403);
  const scoped = await (await f.request('GET', '/api/v1/admin/assistant/keys', f.co)).json();
  assert.deepEqual(scoped.items.map((item: any) => [item.canReveal, item.canTest, item.canRevoke]), [[false, false, false]]);

  // keys:manage widens the list, the status switch and the reach into other people's keys.
  await f.assign(f.owner, f.co, ['assistant:keys:manage'], 2);
  const managed = await (await f.request('GET', '/api/v1/admin/assistant/keys', f.co)).json();
  assert.equal(managed.canManage, true);
  assert.equal(managed.items.length, 2);
  assert.equal((await f.request('PATCH', `/api/v1/admin/assistant/keys/${created.item.id}`, f.co, { status: 'ACTIVE' })).status, 200);
  assert.equal((await f.request('POST', `/api/v1/admin/assistant/keys/${ownerKey.id}/reveal`, f.co)).status, 200);
  assert.match((await one(f.db, "SELECT details_redacted FROM audit_events WHERE action='ASSISTANT_KEY_REVEALED' AND entity_id=?", [ownerKey.id])).details_redacted, /scope=managed/);
});

test('a delegated admin edits and deletes only the rows it authored while content:read remains', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  await f.assign(f.owner, f.co, ['cards:create', 'card-sets:create', 'releases:create'], 0);
  const denied = async (method: string, path: string, body?: unknown) => {
    const response = await f.request(method, path, f.co, body);
    assert.equal(response.status, 403, `${method} ${path}`);
    assert.equal((await response.json()).code, 'PERMISSION_REQUIRED');
  };

  // A release authored by the co-admin is editable without releases:update, the owner's is not.
  const ownRelease = await (await f.request('POST', '/api/v1/admin/content/releases', f.co, { title: 'Bản nháp phụ', versionLabel: 'co-v1' })).json();
  assert.equal(ownRelease.createdBy, f.co);
  assert.equal((await f.request('PUT', `/api/v1/admin/content/releases/${ownRelease.id}`, f.co, { expectedVersion: 0, title: 'Bản nháp phụ đổi' })).status, 200);
  await denied('PUT', `/api/v1/admin/content/releases/${f.release.id}`, { expectedVersion: 2, title: 'Đổi trộm' });

  // Same for a card set and a card created inside the owner's draft release.
  const ownSet = await (await f.request('POST', `/api/v1/admin/content/releases/${f.release.id}/card-sets`, f.co, { expectedVersion: 2, code: 'CO-SET', slug: 'bo-co', name: 'Bộ phụ' })).json();
  assert.equal((await f.request('PUT', `/api/v1/admin/content/releases/${f.release.id}/card-sets/${ownSet.entityId}`, f.co, { expectedVersion: 3, code: 'CO-SET', slug: 'bo-co', name: 'Bộ phụ đổi' })).status, 200);
  const ownCard = await (await f.request('POST', `/api/v1/admin/content/releases/${f.release.id}/cards`, f.co, { ...f.card, expectedVersion: 4, code: 'CO-CARD', slug: 'the-co', name: 'Thẻ phụ', cardSetId: ownSet.entityId })).json();
  assert.equal((await f.request('PUT', `/api/v1/admin/content/releases/${f.release.id}/cards/${ownCard.entityId}`, f.co, { ...f.card, expectedVersion: 5, code: 'CO-CARD', slug: 'the-co', name: 'Thẻ phụ đổi', cardSetId: ownSet.entityId })).status, 200);
  assert.equal((await one(f.db, 'SELECT created_by FROM card_revisions WHERE release_id=? AND card_id=?', [f.release.id, ownCard.entityId])).created_by, f.co);

  // The owner's card stays out of reach for both update and delete.
  await denied('PUT', `/api/v1/admin/content/releases/${f.release.id}/cards/${f.cardId}`, { ...f.card, expectedVersion: 6, name: 'Đổi trộm' });
  await denied('DELETE', `/api/v1/admin/content/releases/${f.release.id}/cards/${f.cardId}?expectedVersion=6`);
  assert.equal((await f.request('DELETE', `/api/v1/admin/content/releases/${f.release.id}/cards/${ownCard.entityId}?expectedVersion=6`, f.co)).status, 200);
  assert.equal((await f.request('DELETE', `/api/v1/admin/content/releases/${f.release.id}/card-sets/${ownSet.entityId}?expectedVersion=7`, f.co)).status, 200);

  // content:read is the floor: without it even the author is frozen out of the rows it created.
  await f.assign(f.owner, f.co, ['content:read'], 1);
  assert.equal((await f.request('PUT', `/api/v1/admin/content/releases/${ownRelease.id}`, f.co, { expectedVersion: 1, title: 'Đổi lần nữa' })).status, 200);
  await f.assign(f.owner, f.co, ['feedback:read'], 2);
  await denied('PUT', `/api/v1/admin/content/releases/${ownRelease.id}`, { expectedVersion: 2, title: 'Sau khi khóa' });
});

test('a clone attributes the copied rows to the cloning account and leaves the source authors alone', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  await f.assign(f.owner, f.co, ['releases:clone'], 0);
  const clone = await (await f.request('POST', `/api/v1/admin/content/releases/${f.release.id}/clone`, f.co, { versionLabel: 'co-clone', title: 'Bản sao', sourceVersion: 2 })).json();
  assert.equal(clone.createdBy, f.co);
  assert.equal((await one(f.db, 'SELECT created_by FROM card_revisions WHERE release_id=? AND card_id=?', [clone.id, f.cardId])).created_by, f.co);
  assert.equal((await one(f.db, 'SELECT created_by FROM card_revisions WHERE release_id=? AND card_id=?', [f.release.id, f.cardId])).created_by, f.owner);

  // releases:clone brings content:read, so the co-admin may edit the copy but not the source.
  assert.equal((await f.request('PUT', `/api/v1/admin/content/releases/${clone.id}/cards/${f.cardId}`, f.co, { ...f.card, expectedVersion: 0, name: 'Thẻ sao đổi' })).status, 200);
  const denied = async (method: string, path: string, body?: unknown) => {
    const response = await f.request(method, path, f.co, body);
    assert.equal(response.status, 403, `${method} ${path}`);
    assert.equal((await response.json()).code, 'PERMISSION_REQUIRED');
  };
  await denied('PUT', `/api/v1/admin/content/releases/${f.release.id}/cards/${f.cardId}`, { ...f.card, expectedVersion: 2, name: 'Đổi trộm' });
  await denied('PUT', `/api/v1/admin/content/releases/${f.release.id}`, { expectedVersion: 2, title: 'Đổi trộm' });
});

test('the authorship initializer adds the author column to databases created before it', async t => {
  const db = database('file::memory:'); t.after(() => db.close());
  await execute(db, 'PRAGMA foreign_keys=ON');
  await execute(db, 'CREATE TABLE app_users (id TEXT PRIMARY KEY)');
  const tables = ['character_revisions', 'card_set_revisions', 'card_revisions', 'wiki_page_revisions'];
  // Populated tables with foreign keys on are the production shape: the ALTER must still be accepted.
  for (const table of tables) { await execute(db, `CREATE TABLE ${table} (id TEXT PRIMARY KEY)`); await execute(db, `INSERT INTO ${table}(id) VALUES ('x')`); }
  await initializeContentAuthorship(db);
  for (const table of tables) assert.equal(await scalar(db, `SELECT COUNT(*) FROM pragma_table_info('${table}') WHERE name='created_by'`), 1, table);
  assert.equal((await one(db, 'SELECT created_by FROM card_revisions WHERE id=?', ['x'])).created_by, null);
  await initializeContentAuthorship(db);
});
