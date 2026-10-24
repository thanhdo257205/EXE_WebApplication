import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { SignJWT } from 'jose';
import { database, initializeLocal, execute, scalar, uuid, transaction, one } from '../src/db.ts';
import { createApp } from '../src/app.ts';
import type { Config } from '../src/auth.ts';
import { initializeRegistrationNotifications, notifyRegistration } from '../src/registration-notifications.ts';
import { googleAccount } from '../src/accounts.ts';

async function fixture() {
  const db = database('file::memory:');
  await initializeLocal(db);

  const admin1 = uuid(), admin2 = uuid(), customer = uuid();
  for (const [id, role] of [[admin1, 'ADMIN'], [admin2, 'ADMIN'], [customer, 'CUSTOMER']]) {
    await execute(db, 'INSERT INTO app_users(id,email,display_name,role) VALUES (?,?,?,?)', [id, id + '@example.test', role, role]);
  }
  const config: Config = { production: false, publicOrigin: 'http://localhost:4200', proxySecret: '', jwtSecret: randomBytes(32).toString('base64'), googleClientId: '', googleClientSecret: '', googleEnabled: false, resetEnabled: false, resendKey: '', mailFrom: '' };
  const { app } = createApp(db, config);
  const token = (id: string, role = 'ADMIN') => new SignJWT({ ver: 0, role }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setSubject(id).setIssuer('exe-web-api').setAudience('exe-web').setJti(uuid()).setIssuedAt().setExpirationTime('30m').sign(Buffer.from(config.jwtSecret, 'base64'));
  const tokens = new Map<string, string>([
    [admin1, await token(admin1, 'ADMIN')],
    [admin2, await token(admin2, 'ADMIN')],
    [customer, await token(customer, 'CUSTOMER')],
  ]);
  const request = (method: string, path: string, who: string | null = admin1, body?: unknown, csrf = true) => app.request(path, {
    method,
    headers: {
      Cookie: `XSRF-TOKEN=t${who ? `; AUTH_TOKEN=${tokens.get(who)}` : ''}`,
      ...(csrf ? { 'X-XSRF-TOKEN': 't' } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  return { db, app, config, admin1, admin2, customer, request };
}

test('helper deduplicates insertion and inserts once per user', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const newUser = uuid();
  await execute(f.db, 'INSERT INTO app_users(id,email,display_name,role) VALUES (?,?,?,?)', [newUser, 'new@example.test', 'New User', 'CUSTOMER']);
  await notifyRegistration(f.db, newUser);
  assert.equal(await scalar(f.db, 'SELECT COUNT(*) FROM admin_registration_notifications WHERE user_id=?', [newUser]), 1);
  // Second call with the same user_id is ignored (ON CONFLICT DO NOTHING)
  await notifyRegistration(f.db, newUser);
  assert.equal(await scalar(f.db, 'SELECT COUNT(*) FROM admin_registration_notifications WHERE user_id=?', [newUser]), 1);
});

test('notifyRegistration participates in transaction and rolls back on failure', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const failedUser = uuid();
  await assert.rejects(
    transaction(f.db, async tx => {
      await execute(tx, 'INSERT INTO app_users(id,email,display_name,role) VALUES (?,?,?,?)', [failedUser, 'fail@example.test', 'Fail User', 'CUSTOMER']);
      await notifyRegistration(tx, failedUser);
      throw new Error('Simulated registration failure');
    }),
    /Simulated registration failure/
  );
  assert.equal(await scalar(f.db, 'SELECT COUNT(*) FROM app_users WHERE id=?', [failedUser]), 0);
  assert.equal(await scalar(f.db, 'SELECT COUNT(*) FROM admin_registration_notifications WHERE user_id=?', [failedUser]), 0);
});

test('mixed pagination merges feedback and registration with deterministic order and composite latestId', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  // 1. Feedback notification
  const fbFeedbackId = uuid();
  await execute(f.db, 'INSERT INTO player_feedback(id,user_id,category,message) VALUES (?,?,?,?)', [fbFeedbackId, f.customer, 'OTHER', 'Cần hỗ trợ']);
  await execute(f.db, 'INSERT INTO admin_notifications(id,feedback_id,created_at) VALUES (1,?,?)', [fbFeedbackId, '2026-10-24T10:00:00.000Z']);

  // 2. User registration notifications
  const user1 = uuid(), user2 = uuid();
  await execute(f.db, 'INSERT INTO app_users(id,email,display_name,role) VALUES (?,?,?,?)', [user1, 'u1@example.test', 'User One', 'CUSTOMER']);
  await execute(f.db, 'INSERT INTO app_users(id,email,display_name,role) VALUES (?,?,?,?)', [user2, 'u2@example.test', 'User Two', 'CUSTOMER']);
  await execute(f.db, 'INSERT INTO admin_registration_notifications(id,user_id,created_at) VALUES (1,?,?)', [user1, '2026-10-24T11:00:00.000Z']);
  await execute(f.db, 'INSERT INTO admin_registration_notifications(id,user_id,created_at) VALUES (2,?,?)', [user2, '2026-10-24T09:00:00.000Z']);

  // Check page 0, size 2
  const resPage0 = await f.request('GET', '/api/v1/admin/notifications?page=0&size=2');
  assert.equal(resPage0.status, 200);
  const data0 = await resPage0.json();
  assert.equal(data0.totalElements, 3);
  assert.equal(data0.unreadCount, 3);
  assert.equal(data0.items.length, 2);

  // Item 0 is user1 (newest created_at: 11:00)
  assert.equal(data0.items[0].id, 'registration:1');
  assert.equal(data0.items[0].type, 'USER_REGISTERED');
  assert.equal(data0.items[0].title, 'Có tài khoản mới đăng ký');
  assert.equal(data0.items[0].sourceId, user1);
  assert.equal(data0.items[0].href, '/admin/users');
  assert.equal(data0.items[0].read, false);
  // Ensure no sensitive fields leaked
  assert.equal((data0.items[0] as any).email, undefined);
  assert.equal((data0.items[0] as any).password, undefined);
  assert.equal((data0.items[0] as any).passwordHash, undefined);
  assert.equal((data0.items[0] as any).displayName, undefined);

  // Item 1 is feedback (created_at: 10:00)
  assert.equal(data0.items[1].id, '1');
  assert.equal(data0.items[1].type, 'FEEDBACK_NEW');
  assert.equal(data0.items[1].title, 'Có phản hồi người chơi mới');
  assert.equal(data0.items[1].sourceId, fbFeedbackId);
  assert.equal(data0.items[1].href, '/admin');
  assert.equal(data0.items[1].read, false);

  // Check page 1, size 2
  const resPage1 = await f.request('GET', '/api/v1/admin/notifications?page=1&size=2');
  assert.equal(resPage1.status, 200);
  const data1 = await resPage1.json();
  assert.equal(data1.items.length, 1);
  assert.equal(data1.items[0].id, 'registration:2');
  assert.equal(data1.items[0].type, 'USER_REGISTERED');
  assert.equal(data1.items[0].sourceId, user2);
});

test('old feedback notifications retain legacy ID format, title, href, and read state', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const fbFeedbackId = uuid();
  await execute(f.db, 'INSERT INTO player_feedback(id,user_id,category,message) VALUES (?,?,?,?)', [fbFeedbackId, f.customer, 'OTHER', 'Góp ý']);
  await execute(f.db, 'INSERT INTO admin_notifications(id,feedback_id,created_at) VALUES (42,?,?)', [fbFeedbackId, '2026-10-24T10:00:00.000Z']);

  const list = await (await f.request('GET', '/api/v1/admin/notifications')).json();
  assert.equal(list.items[0].id, '42');
  assert.equal(list.items[0].type, 'FEEDBACK_NEW');
  assert.equal(list.items[0].title, 'Có phản hồi người chơi mới');
  assert.equal(list.items[0].href, '/admin');
  assert.equal(list.items[0].read, false);

  const mark = await f.request('POST', '/api/v1/admin/notifications/42/read');
  assert.equal(mark.status, 200);
  const markRes = await mark.json();
  assert.equal(markRes.id, '42');
  assert.equal(markRes.read, true);

  const after = await (await f.request('GET', '/api/v1/admin/notifications')).json();
  assert.equal(after.unreadCount, 0);
  assert.equal(after.items[0].read, true);
  assert.equal(await scalar(f.db, 'SELECT COUNT(*) FROM admin_notification_reads WHERE notification_id=42'), 1);
});

test('read isolation between admins is maintained for registration notifications', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const newUser = uuid();
  await execute(f.db, 'INSERT INTO app_users(id,email,display_name,role) VALUES (?,?,?,?)', [newUser, 'iso@example.test', 'Iso User', 'CUSTOMER']);
  await execute(f.db, 'INSERT INTO admin_registration_notifications(id,user_id) VALUES (10,?)', [newUser]);

  // Both admins see it unread
  const a1Before = await (await f.request('GET', '/api/v1/admin/notifications', f.admin1)).json();
  const a2Before = await (await f.request('GET', '/api/v1/admin/notifications', f.admin2)).json();
  assert.equal(a1Before.unreadCount, 1);
  assert.equal(a1Before.items[0].read, false);
  assert.equal(a2Before.unreadCount, 1);
  assert.equal(a2Before.items[0].read, false);

  // Admin1 marks read
  const mark = await f.request('POST', '/api/v1/admin/notifications/registration:10/read', f.admin1);
  assert.equal(mark.status, 200);
  assert.deepEqual(await mark.json(), { id: 'registration:10', read: true });

  // Admin1 sees unreadCount 0 and read: true
  const a1After = await (await f.request('GET', '/api/v1/admin/notifications', f.admin1)).json();
  assert.equal(a1After.unreadCount, 0);
  assert.equal(a1After.items[0].read, true);

  // Admin2 STILL sees unreadCount 1 and read: false
  const a2After = await (await f.request('GET', '/api/v1/admin/notifications', f.admin2)).json();
  assert.equal(a2After.unreadCount, 1);
  assert.equal(a2After.items[0].read, false);

  // Admin2 can also mark read
  const mark2 = await f.request('POST', '/api/v1/admin/notifications/registration:10/read', f.admin2);
  assert.equal(mark2.status, 200);
  const a2Final = await (await f.request('GET', '/api/v1/admin/notifications', f.admin2)).json();
  assert.equal(a2Final.unreadCount, 0);
  assert.equal(a2Final.items[0].read, true);
});

test('non-admin denied and missing or malformed notification IDs are rejected', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const newUser = uuid();
  await execute(f.db, 'INSERT INTO app_users(id,email,display_name,role) VALUES (?,?,?,?)', [newUser, 'auth@example.test', 'Auth User', 'CUSTOMER']);
  await execute(f.db, 'INSERT INTO admin_registration_notifications(id,user_id) VALUES (1,?)', [newUser]);

  // Non-admin (customer) denied
  assert.equal((await f.request('GET', '/api/v1/admin/notifications', f.customer)).status, 403);
  assert.equal((await f.request('POST', '/api/v1/admin/notifications/registration:1/read', f.customer)).status, 403);

  // Anonymous denied
  assert.equal((await f.request('GET', '/api/v1/admin/notifications', null)).status, 401);
  assert.equal((await f.request('POST', '/api/v1/admin/notifications/registration:1/read', null)).status, 401);

  // Missing/non-existent IDs -> 404
  assert.equal((await f.request('POST', '/api/v1/admin/notifications/registration:99999/read')).status, 404);
  assert.equal((await f.request('POST', '/api/v1/admin/notifications/99999/read')).status, 404);

  // Malformed IDs -> 400
  assert.equal((await f.request('POST', '/api/v1/admin/notifications/0/read')).status, 400);
  assert.equal((await f.request('POST', '/api/v1/admin/notifications/-5/read')).status, 400);
  assert.equal((await f.request('POST', '/api/v1/admin/notifications/abc/read')).status, 400);
  assert.equal((await f.request('POST', '/api/v1/admin/notifications/registration:0/read')).status, 400);
  assert.equal((await f.request('POST', '/api/v1/admin/notifications/registration:-1/read')).status, 400);
  assert.equal((await f.request('POST', '/api/v1/admin/notifications/registration:abc/read')).status, 400);
  assert.equal((await f.request('POST', '/api/v1/admin/notifications/registration:9007199254740992/read')).status, 400);
  assert.equal((await f.request('POST', '/api/v1/admin/notifications/registration:1/read', f.admin1, undefined, false)).status, 403);
});

test('password signup emits once; duplicate signup and subsequent login do not emit', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const account = { email:'signup@example.test',password:'valid-password',displayName:'New member' };
  const signup = await f.request('POST','/api/v1/auth/register', null, account);
  assert.equal(signup.status,200);
  const user = await signup.json();
  assert.equal((await one(f.db,'SELECT user_id FROM admin_registration_notifications')).user_id,user.id);
  assert.equal((await f.request('POST','/api/v1/auth/register',null,account)).status,409);
  assert.equal((await f.request('POST','/api/v1/auth/login',null,account)).status,200);
  assert.equal(await scalar(f.db,'SELECT COUNT(*) FROM admin_registration_notifications'),1);
  const list = await (await f.request('GET','/api/v1/admin/notifications')).json();
  assert.equal(list.items[0].type,'USER_REGISTERED');
  assert.equal(list.items[0].sourceId,user.id);
});

test('signup rolls back the account when notification persistence fails', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  await execute(f.db,"CREATE TRIGGER reject_registration_event BEFORE INSERT ON admin_registration_notifications BEGIN SELECT RAISE(ABORT,'event unavailable'); END");
  const response = await f.request('POST','/api/v1/auth/register',null,{email:'rollback@example.test',password:'valid-password',displayName:'Rollback'});
  assert.equal(response.status,409);
  assert.equal(await scalar(f.db,"SELECT COUNT(*) FROM app_users WHERE email='rollback@example.test'"),0);
  assert.equal(await scalar(f.db,'SELECT COUNT(*) FROM admin_registration_notifications'),0);
  assert.equal(response.headers.get('set-cookie')?.includes('AUTH_TOKEN='), undefined);
});

test('verified Google account persistence notifies only the first creation and preserves linking protections', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const identity = {subject:'test-google-subject',email:'google@example.test',displayName:'Google member'};
  const first = await googleAccount(f.db,identity);
  const again = await googleAccount(f.db,identity);
  assert.equal(again.id,first.id);
  assert.equal(await scalar(f.db,'SELECT COUNT(*) FROM admin_registration_notifications'),1);
  await assert.rejects(googleAccount(f.db,{...identity,subject:'different-subject'}),{code:'ACCOUNT_LINK_REQUIRED'});
  await execute(f.db,'UPDATE app_users SET enabled=0 WHERE id=?',[first.id]);
  await assert.rejects(googleAccount(f.db,identity),{code:'OAUTH_FAILED'});
  assert.equal(await scalar(f.db,'SELECT COUNT(*) FROM admin_registration_notifications'),1);
});

test('Google account persistence rolls back when event insertion fails', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  await execute(f.db,"CREATE TRIGGER reject_registration_event BEFORE INSERT ON admin_registration_notifications BEGIN SELECT RAISE(ABORT,'event unavailable'); END");
  await assert.rejects(googleAccount(f.db,{subject:'rollback-google',email:'rollback-google@example.test',displayName:'Rollback'}));
  assert.equal(await scalar(f.db,"SELECT COUNT(*) FROM app_users WHERE google_subject='rollback-google'"),0);
});

test('startup upgrade preserves feedback events/read receipts, is repeatable and does not backfill accounts', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const feedback = uuid();
  await execute(f.db,"INSERT INTO player_feedback(id,user_id,category,message) VALUES (?,?,'OTHER','Original')",[feedback,f.customer]);
  await execute(f.db,'INSERT INTO admin_notifications(id,feedback_id) VALUES (42,?)',[feedback]);
  await execute(f.db,'INSERT INTO admin_notification_reads(notification_id,user_id) VALUES (42,?)',[f.admin1]);
  await execute(f.db,'DROP TABLE admin_registration_notification_reads');
  await execute(f.db,'DROP TABLE admin_registration_notifications');
  await initializeRegistrationNotifications(f.db);
  await initializeRegistrationNotifications(f.db);
  assert.equal(await scalar(f.db,'SELECT COUNT(*) FROM admin_registration_notifications'),0);
  const feed = await (await f.request('GET','/api/v1/admin/notifications')).json();
  assert.equal(feed.items[0].id,'42'); assert.equal(feed.items[0].read,true); assert.equal(feed.unreadCount,0);
});

test('SSE summary detects registration events even below the highest feedback ID', {timeout:15000}, async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const feedback = uuid();
  await execute(f.db,"INSERT INTO player_feedback(id,user_id,category,message) VALUES (?,?,'OTHER','Original')",[feedback,f.customer]);
  await execute(f.db,'INSERT INTO admin_notifications(id,feedback_id) VALUES (42,?)',[feedback]);
  const response = await f.request('GET','/api/v1/admin/notifications/stream');
  const reader = response.body!.getReader(); const decoder = new TextDecoder();
  let buffer = '';
  const nextSummary = async () => {
    for (;;) {
      const end = buffer.indexOf('\n\n');
      if (end >= 0) {
        const event = buffer.slice(0,end); buffer = buffer.slice(end + 2);
        const data = event.split('\n').find(line => line.startsWith('data:'));
        if (event.includes('event: summary') && data) return JSON.parse(data.slice(5));
        continue;
      }
      const chunk = await reader.read();
      if (chunk.done) throw new Error('SSE closed before summary');
      buffer += decoder.decode(chunk.value,{stream:true});
    }
  };
  try {
    const before = await nextSummary(); assert.equal(before.latestId,'42:0');
    await notifyRegistration(f.db,f.customer);
    const after = await nextSummary(); assert.equal(after.latestId,'42:1');
    assert.equal(after.totalElements,2); assert.equal(after.unreadCount,2);
  } finally { await reader.cancel(); }
});
