import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { SignJWT } from 'jose';
import { database, initializeLocal, execute, one, scalar, uuid } from '../src/db.ts';
import { createApp } from '../src/app.ts';
import { initializeRbac } from '../src/rbac.ts';
import { initializeContentAuthorship } from '../src/content.ts';
import type { Config } from '../src/auth.ts';

async function fixture() {
  const db = database('file::memory:'); await initializeLocal(db);
  await initializeRbac(db);
  await initializeContentAuthorship(db);
  const owner = uuid(), co = uuid(), customer = uuid();
  for (const [id, role] of [[owner, 'ADMIN'], [co, 'ADMIN'], [customer, 'CUSTOMER']] as const) {
    await execute(db, 'INSERT INTO app_users(id,email,display_name,role) VALUES (?,?,?,?)', [id, id + '@example.test', role, role]);
  }
  await execute(db, 'INSERT INTO rbac_owner(slot,user_id) VALUES (1,?)', [owner]);
  const config: Config = { production: false, publicOrigin: 'http://localhost:4200', proxySecret: '', jwtSecret: randomBytes(32).toString('base64'), googleClientId: '', googleClientSecret: '', googleEnabled: false, resetEnabled: false, resendKey: '', mailFrom: '' };
  const { app } = createApp(db, config, null);
  const tokens = new Map<string, string>();
  for (const id of [owner, co, customer]) {
    tokens.set(id, await new SignJWT({ ver: 0 }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(id).setIssuer('exe-web-api').setAudience('exe-web').setJti(uuid()).setIssuedAt().setExpirationTime('30m')
      .sign(Buffer.from(config.jwtSecret, 'base64')));
  }
  const request = (method: string, path: string, who: string | null, body?: unknown, csrf = true) => app.request(path, {
    method,
    headers: {
      ...(who ? { Cookie: `AUTH_TOKEN=${tokens.get(who)}; XSRF-TOKEN=t` } : {}),
      ...(csrf ? { 'X-XSRF-TOKEN': 't' } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const assign = (id: string, permissions: string[], expectedVersion: number) =>
    request('PUT', `/api/v1/admin/users/${id}/permissions`, owner, { permissions, expectedVersion });
  const draft = async (versionLabel: string, title = 'Bản nháp ' + versionLabel) => {
    const response = await request('POST', '/api/v1/admin/content/releases', owner, { title, versionLabel });
    assert.equal(response.status, 201);
    return response.json();
  };
  const wiki = async (releaseId: string, expectedVersion: number, slug: string, title = 'Bài ' + slug) => {
    const response = await request('POST', `/api/v1/admin/content/releases/${releaseId}/wiki-pages`, owner, { expectedVersion, slug, pageType: 'RULE', title, bodyMarkdown: 'Nội dung luật.', ruleStatus: 'CONFIRMED' });
    assert.equal(response.status, 201);
    return response.json();
  };
  const publish = (releaseId: string, who: string | null, expectedVersion: number, csrf = true) =>
    request('POST', `/api/v1/admin/content/releases/${releaseId}/publish`, who, { expectedVersion }, csrf);
  return { db, owner, co, customer, request, assign, draft, wiki, publish };
}

test('publishing a draft makes it the current public release and refuses later edits', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  assert.equal((await f.request('GET', '/api/v1/content/release', null)).status, 404, 'nothing is public before the first publish');

  const release = await f.draft('pub-v1');
  const set = await (await f.request('POST', `/api/v1/admin/content/releases/${release.id}/card-sets`, f.owner, { expectedVersion: 0, code: 'BASE', slug: 'bo-co-ban', name: 'Bộ cơ bản' })).json();
  const card = await (await f.request('POST', `/api/v1/admin/content/releases/${release.id}/cards`, f.owner, { expectedVersion: 1, code: 'C1', slug: 'the-dau-tien', name: 'Thẻ đầu tiên', cardSetId: set.entityId, effectText: 'Nhận 1 Tiền.', ruleStatus: 'CONFIRMED', copiesInDeck: 1 })).json();
  assert.equal(card.releaseVersion, 2);

  // The co-admin uses the default delegated set, which includes releases:publish.
  const published = await f.publish(release.id, f.co, 2);
  assert.equal(published.status, 200);
  const body = await published.json();
  assert.equal(body.status, 'PUBLISHED');
  assert.equal(body.currentSlot, 1);
  assert.equal(body.version, 3);
  assert.ok(body.publishedAt);

  // The admin write cleared the public cache: the release is readable without waiting for the TTL.
  const current = await (await f.request('GET', '/api/v1/content/release', null)).json();
  assert.equal(current.id, release.id);
  assert.equal(current.version, 3);
  assert.equal(current.publishedAt, body.publishedAt);
  const snapshot = await (await f.request('GET', '/api/v1/content/snapshot', null)).json();
  assert.equal(snapshot.release.id, release.id);
  assert.deepEqual(snapshot.content.cards.map((row: any) => row.name), ['Thẻ đầu tiên']);
  assert.deepEqual(snapshot.content['wiki-pages'], []);

  const audit = await one(f.db, "SELECT * FROM audit_events WHERE action='CONTENT_RELEASE_PUBLISHED'");
  assert.equal(audit.actor_id, f.co);
  assert.equal(audit.entity_id, release.id);
  assert.equal(audit.details_redacted, `releaseId=${release.id};version=3`);

  // A published release is immutable: no re-publish and no title edit.
  const again = await f.publish(release.id, f.owner, 3);
  assert.equal(again.status, 409);
  assert.equal((await again.json()).code, 'RELEASE_IMMUTABLE');
  const edit = await f.request('PUT', `/api/v1/admin/content/releases/${release.id}`, f.owner, { expectedVersion: 3, title: 'Đổi tên' });
  assert.equal(edit.status, 409);
  assert.equal((await edit.json()).code, 'RELEASE_IMMUTABLE');
});

test('publishing a new draft archives the previous current release but keeps it readable by id', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const first = await f.draft('first-v1');
  await f.wiki(first.id, 0, 'luat-cu', 'Luật cũ');
  assert.equal((await f.publish(first.id, f.owner, 1)).status, 200);
  const firstAfter = await one(f.db, 'SELECT * FROM content_releases WHERE id=?', [first.id]);
  assert.equal(firstAfter.status, 'PUBLISHED');
  assert.ok(firstAfter.published_at);

  const second = await f.draft('second-v1');
  await f.wiki(second.id, 0, 'luat-moi', 'Luật mới');
  const published = await f.publish(second.id, f.owner, 1);
  assert.equal(published.status, 200);
  const body = await published.json();
  assert.equal(body.currentSlot, 1);
  assert.equal(body.version, 2);

  const archived = await one(f.db, 'SELECT * FROM content_releases WHERE id=?', [first.id]);
  assert.equal(archived.status, 'ARCHIVED');
  assert.equal(archived.current_slot, null);
  assert.ok(archived.published_at, 'an archived release keeps its publish time for versioned links');
  assert.equal(archived.version, 3, 'archiving bumps the release version');

  const current = await (await f.request('GET', '/api/v1/content/release', null)).json();
  assert.equal(current.id, second.id);
  const previous = await f.request('GET', `/api/v1/content/release?releaseId=${first.id}`, null);
  assert.equal(previous.status, 200);
  assert.equal((await previous.json()).id, first.id);
  const list = await (await f.request('GET', '/api/v1/content/wiki-pages', null)).json();
  assert.deepEqual(list.result.items.map((row: any) => row.title), ['Luật mới']);

  const archivedAudit = await one(f.db, "SELECT * FROM audit_events WHERE action='CONTENT_RELEASE_ARCHIVED'");
  assert.equal(archivedAudit.entity_id, first.id);
  assert.equal(archivedAudit.details_redacted, `releaseId=${first.id};version=3;replacedBy=${second.id}`);
  assert.equal(await scalar(f.db, "SELECT COUNT(*) FROM audit_events WHERE action='CONTENT_RELEASE_PUBLISHED'"), 2);
});

test('publish requires the module right, rejects stale versions and never publishes an empty release', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const release = await f.draft('guarded-v1');
  await f.wiki(release.id, 0, 'luat-thu');

  // A custom set without releases:publish is refused even though the account can read content.
  assert.equal((await f.assign(f.co, ['content:read'], 0)).status, 200);
  const denied = await f.publish(release.id, f.co, 1);
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).code, 'PERMISSION_REQUIRED');
  assert.equal((await f.publish(release.id, f.customer, 1)).status, 403);
  const anonymous = await f.publish(release.id, null, 1);
  assert.equal(anonymous.status, 403);
  assert.equal((await anonymous.json()).code, 'CSRF_REQUIRED');

  const stale = await f.publish(release.id, f.owner, 99);
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).code, 'VERSION_CONFLICT');

  const empty = await f.draft('empty-v1');
  const refused = await f.publish(empty.id, f.owner, 0);
  assert.equal(refused.status, 409);
  assert.equal((await refused.json()).code, 'RELEASE_EMPTY');
  const emptyRow = await one(f.db, 'SELECT * FROM content_releases WHERE id=?', [empty.id]);
  assert.equal(emptyRow.status, 'DRAFT');
  assert.equal(emptyRow.current_slot, null);
  assert.equal(await scalar(f.db, "SELECT COUNT(*) FROM content_releases WHERE status='PUBLISHED'"), 0);
  assert.equal(await scalar(f.db, "SELECT COUNT(*) FROM audit_events WHERE action='CONTENT_RELEASE_PUBLISHED'"), 0);
});
