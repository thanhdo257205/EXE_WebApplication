import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { SignJWT } from 'jose';
import { database, initializeLocal, execute, one, all, scalar, uuid, at } from '../src/db.ts';
import { createApp } from '../src/app.ts';
import { initializeRbac } from '../src/rbac.ts';
import { googleAccount } from '../src/accounts.ts';
import type { Config } from '../src/auth.ts';

async function fixture() {
  const db = database('file::memory:'); await initializeLocal(db);
  const owner = uuid(), admin = uuid(), customer = uuid(), other = uuid();
  for (const [id, role] of [[owner, 'ADMIN'], [customer, 'CUSTOMER'], [other, 'CUSTOMER']]) {
    await execute(db, 'INSERT INTO app_users(id,email,display_name,role) VALUES (?,?,?,?)', [id, id + '@example.test', role, role]);
  }
  await initializeRbac(db);
  await execute(db, 'INSERT INTO app_users(id,email,display_name,role) VALUES (?,?,?,?)', [admin, admin + '@example.test', 'Đồng quản trị', 'ADMIN']);
  const config: Config = { production: false, publicOrigin: 'http://localhost:4200', proxySecret: '', jwtSecret: randomBytes(32).toString('base64'), googleClientId: '', googleClientSecret: '', googleEnabled: false, resetEnabled: false, resendKey: '', mailFrom: '' };
  const { app } = createApp(db, config);
  const token = (id: string, version = 0) => new SignJWT({ ver: version, role: 'ADMIN', adminLevel: 'OWNER' }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setSubject(id).setIssuer('exe-web-api').setAudience('exe-web').setJti(uuid()).setIssuedAt().setExpirationTime('30m').sign(Buffer.from(config.jwtSecret, 'base64'));
  const tokens = new Map<string, string>(await Promise.all([owner, admin, customer, other].map(async id => [id, await token(id)] as const)));
  const request = (method: string, path: string, who: string | null, body?: unknown, csrf = true) => app.request(path, {
    method, headers: { ...(who ? { Cookie: `AUTH_TOKEN=${tokens.get(who)}; XSRF-TOKEN=t` } : {}), ...(csrf ? { 'X-XSRF-TOKEN': 't' } : {}), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const change = (who: string, id: string, role: string, expectedVersion = 0) => request('PUT', `/api/v1/admin/users/${id}/role`, who, { role, expectedVersion });
  const invite = (who: string, email: string) => request('POST', '/api/v1/admin/users/invites', who, { email });
  const revoke = (who: string, id: string) => request('DELETE', `/api/v1/admin/users/invites/${id}`, who);
  const register = (email: string, displayName = 'New member') => request('POST', '/api/v1/auth/register', customer, { email, displayName, password: 'a-valid-password' });
  const emailOf = async (id: string) => (await one(db, 'SELECT email FROM app_users WHERE id=?', [id])).email as string;
  return { db, owner, admin, customer, other, tokens, token, request, change, invite, revoke, register, emailOf };
}

test('ownership binds the sole existing admin once and never switches to a delegated admin', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  await initializeRbac(f.db);
  assert.equal((await one(f.db, 'SELECT user_id FROM rbac_owner')).user_id, f.owner);
  await execute(f.db, 'UPDATE app_users SET enabled=0 WHERE id=?', [f.owner]);
  await initializeRbac(f.db);
  assert.equal((await one(f.db, 'SELECT user_id FROM rbac_owner')).user_id, f.owner);
  assert.equal((await f.change(f.admin, f.customer, 'ADMIN')).status, 403);
});

test('additive upgrade refuses ambiguous admins; empty databases do not elect signups', async t => {
  const db = database('file::memory:'); t.after(() => db.close()); await initializeLocal(db);
  await execute(db, 'DROP TABLE rbac_owner');
  await initializeRbac(db);
  assert.equal(await scalar(db, 'SELECT COUNT(*) FROM rbac_owner'), 0);
  for (let i = 0; i < 2; i++) await execute(db, "INSERT INTO app_users(id,email,display_name,role) VALUES (?,?,?,'ADMIN')", [uuid(), `a${i}@example.test`, 'Admin']);
  await assert.rejects(initializeRbac(db), /ambiguous/);
  assert.equal(await scalar(db, 'SELECT COUNT(*) FROM rbac_owner'), 0);
});

test('owner and delegated admins operate normally but only owner receives manage-roles permission', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  for (const [id, level] of [[f.owner, 'OWNER'], [f.admin, 'DELEGATED']]) {
    const me = await (await f.request('GET', '/api/v1/auth/me', id)).json();
    assert.equal(me.role, 'ADMIN'); assert.equal(me.adminLevel, level);
    assert.equal(me.permissions.includes('users:manage-roles'), id === f.owner);
    assert.equal((await f.request('GET', '/api/v1/admin/dashboard', id)).status, 200);
    const list = await (await f.request('GET', '/api/v1/admin/users', id)).json();
    assert.equal(list.totalElements, 4); assert.equal(list.canManageRoles, id === f.owner);
    assert.equal(list.items.some((u: any) => 'passwordHash' in u || 'googleSubject' in u || 'password_hash' in u), false);
  }
});

test('anonymous, customer with forged owner claims and delegated admin cannot grant, revoke or self-promote', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  assert.equal((await f.request('GET', '/api/v1/admin/users', null)).status, 401);
  assert.equal((await f.request('GET', '/api/v1/admin/users', f.customer)).status, 403);
  for (const who of [f.customer, f.admin]) for (const role of ['ADMIN', 'CUSTOMER']) {
    assert.equal((await f.change(who, f.other, role)).status, 403);
  }
  assert.equal((await f.change(f.admin, f.admin, 'ADMIN')).status, 403);
  assert.equal(await scalar(f.db, "SELECT COUNT(*) FROM audit_events WHERE action='USER_ROLE_CHANGED'"), 0);
});

test('owner grant is atomic, audited and invalidates sessions and pending recovery links', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  await execute(f.db, 'INSERT INTO password_reset_tokens(user_id,token_hash,requested_at,expires_at) VALUES (?,?,?,?)', [f.customer, 'test-hash', at(Date.now()), at(Date.now() + 60000)]);
  const response = await f.change(f.owner, f.customer, 'ADMIN');
  assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.changed, true); assert.equal(result.item.version, 1); assert.equal(result.item.adminLevel, 'DELEGATED');
  assert.equal((await f.request('GET', '/api/v1/auth/me', f.customer)).status, 401);
  assert.equal(await scalar(f.db, 'SELECT COUNT(*) FROM password_reset_tokens WHERE user_id=?', [f.customer]), 0);
  const audit = await one(f.db, "SELECT * FROM audit_events WHERE action='USER_ROLE_CHANGED'");
  assert.equal(audit.actor_id, f.owner); assert.equal(audit.entity_id, f.customer); assert.match(audit.details_redacted, /CUSTOMER->ADMIN/);
  f.tokens.set(f.customer, await f.token(f.customer, 1));
  assert.equal((await f.request('GET', '/api/v1/admin/dashboard', f.customer)).status, 200);
  assert.equal((await f.change(f.customer, f.other, 'ADMIN')).status, 403);
});

test('revocation takes effect immediately for old and newly signed tokens', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  assert.equal((await f.change(f.owner, f.admin, 'CUSTOMER')).status, 200);
  assert.equal((await f.request('GET', '/api/v1/admin/dashboard', f.admin)).status, 401);
  f.tokens.set(f.admin, await f.token(f.admin, 1));
  assert.equal((await f.request('GET', '/api/v1/admin/dashboard', f.admin)).status, 403);
  const me = await (await f.request('GET', '/api/v1/auth/me', f.admin)).json();
  assert.deepEqual(me.permissions, []); assert.equal(me.adminLevel, null);
});

test('owner is protected; payload cannot create another owner, bypass version checks or CSRF', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  assert.equal((await f.change(f.owner, f.owner, 'CUSTOMER')).status, 403);
  assert.equal((await f.change(f.owner, f.customer, 'OWNER')).status, 400);
  assert.equal((await f.request('PUT', `/api/v1/admin/users/${f.customer}/role`, f.owner, {role:'ADMIN',expectedVersion:0,adminLevel:'OWNER'})).status, 400);
  assert.equal((await f.change(f.owner, f.customer, 'ADMIN', 99)).status, 409);
  assert.equal((await f.request('PUT', `/api/v1/admin/users/${f.customer}/role`, f.owner, {role:'ADMIN',expectedVersion:0}, false)).status, 403);
  assert.equal((await f.request('PUT', '/api/v1/admin/users/not-an-id/role', f.owner, {role:'ADMIN',expectedVersion:0})).status, 400);
  assert.equal((await f.change(f.owner, uuid(), 'ADMIN')).status, 404);
  assert.equal((await one(f.db, 'SELECT role FROM app_users WHERE id=?', [f.customer])).role, 'CUSTOMER');
});

test('disabled users cannot be promoted; unchanged role does not invalidate sessions or add audit', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  await execute(f.db, 'UPDATE app_users SET enabled=0 WHERE id=?', [f.customer]);
  assert.equal((await f.change(f.owner, f.customer, 'ADMIN')).status, 409);
  const same = await (await f.change(f.owner, f.admin, 'ADMIN')).json();
  assert.equal(same.changed, false); assert.equal(same.item.version, 0);
  assert.equal(await scalar(f.db, "SELECT COUNT(*) FROM audit_events WHERE action='USER_ROLE_CHANGED'"), 0);
});

test('audit failures roll back both role and session-version changes', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  await execute(f.db, "CREATE TRIGGER reject_role_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
  assert.equal((await f.change(f.owner, f.customer, 'ADMIN')).status, 409);
  const user = await one(f.db, 'SELECT role,auth_version FROM app_users WHERE id=?', [f.customer]);
  assert.equal(user.role, 'CUSTOMER'); assert.equal(user.auth_version, 0);
});

test('user search escapes SQL wildcard characters and validates pagination', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const result = await (await f.request('GET', '/api/v1/admin/users?q=%25', f.owner)).json();
  assert.equal(result.totalElements, 0);
  const paged = await (await f.request('GET', '/api/v1/admin/users?size=2&page=1', f.owner)).json();
  assert.equal(paged.items.length, 2); assert.equal(paged.totalPages, 2);
  assert.equal((await f.request('GET', '/api/v1/admin/users?size=101', f.owner)).status, 400);
});

test('registration cannot inject admin privileges or ownership', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const response = await f.request('POST', '/api/v1/auth/register', f.customer, {
    email:'new-member@example.test',displayName:'New member',password:'a-valid-password',role:'ADMIN',adminLevel:'OWNER',permissions:['users:manage-roles'],
  });
  assert.equal(response.status, 200);
  const registered = await response.json();
  assert.equal(registered.role, 'CUSTOMER'); assert.equal(registered.adminLevel, null); assert.deepEqual(registered.permissions, []);
  assert.equal((await one(f.db, 'SELECT user_id FROM rbac_owner')).user_id, f.owner);
});

test('password registration never consumes an invite or grants admin without mailbox proof', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const created = await f.invite(f.owner, '  Future.Admin@Example.Test ');
  assert.equal(created.status, 200);
  const pending = await created.json();
  assert.equal(pending.status, 'INVITED');
  assert.equal(pending.invite.email, 'future.admin@example.test');
  assert.equal(pending.invite.invitedByName, 'ADMIN');
  assert.equal(await scalar(f.db, "SELECT COUNT(*) FROM app_users WHERE email='future.admin@example.test'"), 0);
  assert.equal(await scalar(f.db, "SELECT COUNT(*) FROM audit_events WHERE action='ADMIN_INVITE_CREATED'"), 1);

  const response = await f.register('future.admin@example.test', 'Future co-admin');
  assert.equal(response.status, 200);
  const account = await response.json();
  assert.equal(account.role, 'CUSTOMER'); assert.equal(account.adminLevel, null);
  assert.deepEqual(account.permissions, []);
  assert.equal(await scalar(f.db, 'SELECT COUNT(*) FROM admin_invites'), 1);
  assert.equal((await one(f.db, 'SELECT user_id FROM rbac_owner')).user_id, f.owner);
  assert.equal(await scalar(f.db, "SELECT COUNT(*) FROM audit_events WHERE action='ADMIN_INVITE_ACCEPTED'"), 0);
  f.tokens.set(account.id, await f.token(account.id));
  assert.equal((await f.request('GET', '/api/v1/admin/dashboard', account.id)).status, 403);
  assert.equal((await f.change(f.owner, account.id, 'ADMIN')).status, 200);
  assert.equal((await f.request('GET', '/api/v1/admin/dashboard', account.id)).status, 401);
});

test('verified Google registration accepts a pending invite without granting ownership', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  assert.equal((await f.invite(f.owner, 'google.new@example.test')).status, 200);
  const account = await googleAccount(f.db, { subject: 'google-new-subject', email: 'google.new@example.test', displayName: 'Google co-admin' });
  assert.equal(account.role, 'ADMIN');
  assert.equal(await scalar(f.db, 'SELECT COUNT(*) FROM admin_invites'), 0);
  assert.equal((await one(f.db, 'SELECT user_id FROM rbac_owner')).user_id, f.owner);
  const accepted = await one(f.db, "SELECT * FROM audit_events WHERE action='ADMIN_INVITE_ACCEPTED'");
  assert.equal(accepted.entity_id, account.id); assert.match(accepted.details_redacted, /source=google-registration/);
});

test('inviting an existing member promotes at once, invalidates old sessions and is audited', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const response = await f.invite(f.owner, (await f.emailOf(f.customer)).toUpperCase());
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.status, 'PROMOTED');
  assert.equal(result.account.adminLevel, 'DELEGATED'); assert.equal(result.account.version, 1);
  assert.equal((await f.request('GET', '/api/v1/auth/me', f.customer)).status, 401);
  assert.equal(await scalar(f.db, 'SELECT COUNT(*) FROM admin_invites'), 0);
  const audit = await one(f.db, "SELECT * FROM audit_events WHERE action='USER_ROLE_CHANGED'");
  assert.equal(audit.actor_id, f.owner); assert.match(audit.details_redacted, /CUSTOMER->ADMIN/);
  assert.match(audit.details_redacted, /source=admin-invite/);
  f.tokens.set(f.customer, await f.token(f.customer, 1));
  assert.equal((await f.request('GET', '/api/v1/admin/dashboard', f.customer)).status, 200);
  assert.equal((await f.change(f.customer, f.other, 'ADMIN')).status, 403);
});

test('only the owner manages invites and duplicates, protected or disabled accounts are rejected', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  assert.equal((await f.request('GET', '/api/v1/admin/users/invites', null)).status, 401);
  assert.equal((await f.request('GET', '/api/v1/admin/users/invites', f.customer)).status, 403);
  assert.equal((await f.invite(f.customer, 'blocked@example.test')).status, 403);
  assert.equal((await f.request('GET', '/api/v1/admin/users/invites', f.admin)).status, 403);
  assert.equal((await f.invite(f.admin, 'blocked@example.test')).status, 403);
  assert.equal(await scalar(f.db, 'SELECT COUNT(*) FROM admin_invites'), 0);

  assert.equal((await (await f.invite(f.owner, await f.emailOf(f.owner))).json()).code, 'ALREADY_OWNER');
  assert.equal((await (await f.invite(f.owner, await f.emailOf(f.admin))).json()).code, 'ALREADY_ADMIN');
  await execute(f.db, 'UPDATE app_users SET enabled=0 WHERE id=?', [f.customer]);
  assert.equal((await (await f.invite(f.owner, await f.emailOf(f.customer))).json()).code, 'ACCOUNT_DISABLED');

  assert.equal((await f.invite(f.owner, 'pending@example.test')).status, 200);
  const duplicate = await f.invite(f.owner, 'PENDING@example.test');
  assert.equal(duplicate.status, 409); assert.equal((await duplicate.json()).code, 'INVITE_EXISTS');
  assert.equal((await f.request('POST', '/api/v1/admin/users/invites', f.owner, { email: 'ok@example.test', role: 'ADMIN' })).status, 400);
  assert.equal((await f.request('POST', '/api/v1/admin/users/invites', f.owner, { email: 'not-an-email' })).status, 400);
  assert.equal((await f.request('POST', '/api/v1/admin/users/invites', f.owner, { email: 'ok@example.test' }, false)).status, 403);

  const ownerList = await (await f.request('GET', '/api/v1/admin/users/invites', f.owner)).json();
  assert.equal(ownerList.items.length, 1); assert.equal(ownerList.items[0].email, 'pending@example.test');
  assert.equal(ownerList.canManageRoles, true);
  const inviteId = ownerList.items[0].id;
  assert.equal((await f.revoke(f.admin, inviteId)).status, 403);
  assert.equal((await f.revoke(f.owner, inviteId)).status, 200);
  assert.equal(await scalar(f.db, 'SELECT COUNT(*) FROM admin_invites'), 0);
  assert.equal((await f.revoke(f.owner, inviteId)).status, 404);
  assert.equal((await f.revoke(f.owner, 'not-an-id')).status, 400);
  assert.equal(await scalar(f.db, "SELECT COUNT(*) FROM audit_events WHERE action='ADMIN_INVITE_REVOKED'"), 1);
  assert.equal(await scalar(f.db, "SELECT COUNT(*) FROM audit_events WHERE action='ADMIN_INVITE_CREATED'"), 1);
});

test('invite acceptance rolls back the new Google account when the audit cannot be written', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  assert.equal((await f.invite(f.owner, 'audit-fail@example.test')).status, 200);
  await execute(f.db, "CREATE TRIGGER reject_invite_audit BEFORE INSERT ON audit_events WHEN NEW.action='ADMIN_INVITE_ACCEPTED' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
  await assert.rejects(googleAccount(f.db, { subject: 'audit-fail-subject', email: 'audit-fail@example.test', displayName: 'Rollback' }), /audit unavailable/);
  assert.equal(await scalar(f.db, "SELECT COUNT(*) FROM app_users WHERE email='audit-fail@example.test'"), 0);
  assert.equal(await scalar(f.db, 'SELECT COUNT(*) FROM admin_invites'), 1);
  assert.equal(await scalar(f.db, 'SELECT COUNT(*) FROM admin_registration_notifications'), 0);
});
