import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHmac } from 'node:crypto';
import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';
import { database, initializeLocal, execute, one, all, scalar, now, at, uuid } from '../src/db.ts';
import { createApp } from '../src/app.ts';
import { type Config, type Actor } from '../src/auth.ts';
import { type Provider, checkoutSchema, payosProvider } from '../src/payments.ts';

async function fixture(options: { provider?: Provider | null; mail?: (email: string, url: string) => Promise<void>; reset?: boolean } = {}) {
  const db = database('file::memory:'); await initializeLocal(db);
  const config: Config = { production: false, publicOrigin: 'http://localhost:4200', proxySecret: 'test-proxy-secret-at-least-32-characters', jwtSecret: randomBytes(32).toString('base64'), googleClientId: '', googleClientSecret: '', googleEnabled: false, resetEnabled: options.reset ?? false, resendKey: '', mailFrom: '' };
  const user = uuid(), admin = uuid(), other = uuid();
  for (const [id, role] of [[user, 'CUSTOMER'], [admin, 'ADMIN'], [other, 'CUSTOMER']]) await execute(db, 'INSERT INTO app_users(id,email,password_hash,display_name,role) VALUES (?,?,?,?,?)', [id, id + '@example.test', bcrypt.hashSync('password123', 4), role, role]);
  const category = uuid(), product = uuid(), variant = uuid();
  await execute(db, "INSERT INTO product_categories(id,slug,name) VALUES (?,'test','Test')", [category]);
  await execute(db, "INSERT INTO products(id,category_id,slug,name,status) VALUES (?,?,'test','Test','ACTIVE')", [product, category]);
  await execute(db, "INSERT INTO product_variants(id,product_id,sku,name,price_amount) VALUES (?,?,'TEST-01','Test',2000)", [variant, product]);
  await execute(db, 'INSERT INTO inventory_balances(variant_id,on_hand) VALUES (?,2)', [variant]);
  let creates = 0; let getResponse: any;
  const mock: Provider = {
    create: async b => { creates++; const link = 'link-' + b.orderCode; return { orderCode: b.orderCode, amount: b.amount, currency: 'VND', paymentLinkId: link, checkoutUrl: 'https://pay.payos.vn/web/' + link, qrCode: 'test-qr', status: 'PENDING' }; },
    get: async code => getResponse ?? { orderCode: code, amount: 2000, amountPaid: 0, id: 'link-' + code, status: 'PENDING', transactions: [] },
    cancel: async code => ({ orderCode: code, amount: 2000, amountPaid: 0, id: 'link-' + code, status: 'CANCELLED', transactions: [] }),
    verify: async b => { if (b.signature !== 'signed-test-fixture') throw new Error('Invalid'); return b.data; },
  };
  const { app, payments } = createApp(db, config, options.provider === undefined ? mock : options.provider, options.mail);
  const tokens = new Map<string, string>();
  async function token(id: string, version = 0, expiry = '30m') { return new SignJWT({ ver: version }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setIssuer('exe-web-api').setAudience('exe-web').setSubject(id).setJti(uuid()).setIssuedAt().setExpirationTime(expiry).sign(Buffer.from(config.jwtSecret, 'base64')); }
  for (const id of [user, admin, other]) tokens.set(id, await token(id));
  const actor: Actor = { id: user, email: user + '@example.test', role: 'CUSTOMER', version: 0, expires: Date.now() / 1000 + 1800 };
  const body = (key = uuid().replaceAll('-', '')) => checkoutSchema.parse({ idempotencyKey: key, items: [{ variantId: variant, quantity: 1 }], recipientName: 'Khách thử', recipientPhone: '0901234567', addressLine: 'Địa chỉ thử', province: 'Hồ Chí Minh', note: null });
  const request = (method: string, path: string, data?: any, id: string | null = user, headers: Record<string, string> = {}) => app.request(path, { method, headers: { ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(id ? { Cookie: `AUTH_TOKEN=${tokens.get(id)}; XSRF-TOKEN=test-csrf`, 'X-XSRF-TOKEN': 'test-csrf' } : {}), ...headers }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
  const webhook = async (order: string, amount = 2000, reference = 'bank-ref-1', link?: string) => {
    const p = await one(db, 'SELECT * FROM payment_attempts WHERE order_id=?', [order]);
    return request('POST', '/api/v1/payments/payos/webhook', { signature: 'signed-test-fixture', data: { code: '00', currency: 'VND', amount, orderCode: p.provider_order_code, paymentLinkId: link ?? p.provider_payment_link_id ?? 'link-' + p.provider_order_code, reference } }, null);
  };
  return { db, app, config, user, admin, other, actor, variant, body, request, webhook, payments, token, tokens, creates: () => creates, setProviderResult: (value: any) => { getResponse = value; } };
}

test('public health/catalog contracts, user-only orders, CSRF and origin protection', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  assert.equal((await f.request('GET', '/actuator/health', undefined, null)).status, 200);
  const products = await (await f.request('GET', '/api/v1/shop/products', undefined, null)).json();
  assert.equal(products[0].variants[0].priceAmount, 2000); assert.equal(products[0].variants[0].available, true);
  assert.equal((await f.request('GET', '/api/v1/orders', undefined, null)).status, 401);
  assert.equal((await f.request('POST', '/api/v1/checkout', f.body(), null)).status, 403);
  assert.equal((await f.request('GET', '/api/v1/info', undefined, null, { Origin: 'https://foreign.test' })).status, 403);
  assert.equal((await f.request('POST', '/api/v1/internal/payments/reconcile', {}, null)).status, 403);
  assert.equal((await f.request('GET', '/api/v1/admin/dashboard')).status, 403);
});

test('production proxy guard also protects webhook; health remains public', async t => {
  const f = await fixture(); t.after(() => f.db.close()); const { app } = createApp(f.db, { ...f.config, production: true });
  assert.equal((await app.request('/api/v1/info')).status, 403);
  assert.equal((await app.request('/actuator/health')).status, 200);
  assert.equal((await app.request('/api/v1/info', { headers: { 'X-Origin-Verify': f.config.proxySecret } })).status, 200);
  assert.equal((await app.request('/api/v1/payments/payos/webhook', { method: 'POST', body: '{}' })).status, 403);
});

test('checkout retry preserves identity; changed body conflicts and foreign user cannot access', async t => {
  const f = await fixture(); t.after(() => f.db.close()); const b = f.body();
  const first = await f.request('POST', '/api/v1/checkout', b); assert.equal(first.status, 200); const order = await first.json();
  const retried = await f.request('POST', '/api/v1/checkout', b); assert.equal((await retried.json()).id, order.id); assert.equal(f.creates(), 1);
  assert.equal(await scalar(f.db, 'SELECT COUNT(*) FROM orders'), 1); assert.equal((await one(f.db, 'SELECT reserved FROM inventory_balances')).reserved, 1);
  assert.equal((await f.request('POST', '/api/v1/checkout', { ...b, recipientName: 'Changed' })).status, 409);
  assert.equal((await f.request('GET', '/api/v1/orders/' + order.id, undefined, f.other)).status, 404);
  assert.equal((await f.request('POST', `/api/v1/orders/${order.id}/refresh-payment`, {}, f.other)).status, 404);
});

test('order list hydrates every order with a constant number of statements', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  await execute(f.db, 'UPDATE inventory_balances SET on_hand=10');
  for (let i = 0; i < 5; i++) assert.equal((await f.request('POST', '/api/v1/checkout', f.body())).status, 200);
  const ids = (await all(f.db, 'SELECT id FROM orders ORDER BY created_at DESC')).map(row => row.id as string);
  let statements = 0;
  const counting = new Proxy(f.db, {
    get(target, property, receiver) {
      if (property === 'transaction') return async (mode?: any) => {
        const tx = await target.transaction(mode);
        return new Proxy(tx, {
          get(inner, key) {
            if (key === 'execute' || key === 'batch') return (...args: any[]) => { statements++; return (inner as any)[key](...args); };
            const value = (inner as any)[key];
            return typeof value === 'function' ? value.bind(inner) : value;
          },
        });
      };
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as typeof f.db;
  f.payments.db = counting;
  const views = await f.payments.views(ids, f.user);
  assert.equal(views.length, 5); assert.equal(new Set(views.map(view => view.id)).size, 5);
  assert.equal(views[0].paymentState, 'PENDING'); assert.equal(views[0].total, 2000); assert.match(views[0].checkoutUrl, /^https:\/\/pay\.payos\.vn\//);
  assert.equal(statements, 2);
  statements = 0;
  const listed = await (await f.request('GET', '/api/v1/orders', undefined, f.user)).json();
  assert.equal(listed.length, 5); assert.deepEqual(new Set(listed.map((view: any) => view.id)), new Set(ids));
  assert.equal(statements, 2);
});

test('stock failure rolls back the order, reservation, movements and payment code', async t => {
  const f = await fixture(); t.after(() => f.db.close()); await execute(f.db, 'UPDATE inventory_balances SET on_hand=0');
  assert.equal((await f.request('POST', '/api/v1/checkout', f.body())).status, 409);
  for (const table of ['orders', 'order_items', 'inventory_reservations', 'inventory_movements', 'payment_attempts']) assert.equal(await scalar(f.db, `SELECT COUNT(*) FROM ${table}`), 0);
  assert.equal(await scalar(f.db, 'SELECT value FROM app_sequences'), 99999999); assert.equal(f.creates(), 0);
});

test('valid payment settles once across duplicate deliveries, preserving stock invariants', async t => {
  const f = await fixture(); t.after(() => f.db.close()); const order = await (await f.request('POST', '/api/v1/checkout', f.body())).json();
  assert.equal((await f.webhook(order.id)).status, 200); assert.equal((await f.webhook(order.id)).status, 200);
  assert.equal(await scalar(f.db, 'SELECT COUNT(*) FROM payment_transactions'), 1);
  assert.equal((await one(f.db, 'SELECT * FROM orders')).status, 'CONFIRMED');
  const inventory = await one(f.db, 'SELECT * FROM inventory_balances'); assert.equal(inventory.on_hand, 1); assert.equal(inventory.reserved, 0);
  assert.equal((await one(f.db, 'SELECT * FROM payment_webhook_events')).delivery_count, 2);
  assert.equal((await one(f.db, 'SELECT * FROM inventory_reservations')).status, 'CONSUMED');
  const view = await (await f.request('GET', '/api/v1/orders/' + order.id)).json(); assert.equal(view.paymentStatus, 'PAID'); assert.equal(view.checkoutUrl, null);
});

test('partial/overpayments and link mismatch require appropriate states without overselling', async t => {
  const f = await fixture(); t.after(() => f.db.close()); const order = await (await f.request('POST', '/api/v1/checkout', f.body())).json();
  await f.webhook(order.id, 1000, 'partial'); assert.equal((await one(f.db, 'SELECT * FROM orders')).payment_status, 'PARTIALLY_PAID');
  await f.webhook(order.id, 1500, 'over'); assert.equal((await one(f.db, 'SELECT * FROM orders')).payment_status, 'REVIEW'); assert.equal((await one(f.db, 'SELECT * FROM inventory_balances')).reserved, 1);
  await f.webhook(order.id, 2000, 'wrong-link', 'other-link'); assert.equal(await scalar(f.db, 'SELECT COUNT(*) FROM payment_transactions'), 2);
  assert.equal((await one(f.db, "SELECT * FROM payment_webhook_events WHERE provider_reference='wrong-link'")).error_code, 'LINK_MISMATCH');
});

test('unknown creation does not replay provider call or release stock', async t => {
  let calls = 0; const f = await fixture({ provider: { create: async () => { calls++; throw new Error('Timeout'); }, get: async () => { throw new Error('Timeout'); }, cancel: async () => { throw new Error('Should not cancel'); }, verify: async () => { throw new Error('Invalid'); } } });
  t.after(() => f.db.close()); const b = f.body(), order = await f.payments.checkout(f.actor, b); assert.equal(order.paymentState, 'UNKNOWN');
  await f.payments.checkout(f.actor, b); assert.equal(calls, 1); assert.equal((await one(f.db, 'SELECT * FROM inventory_balances')).reserved, 1);
});

test('provider-confirmed absence releases an UNKNOWN hold once and a late credit goes to review', async t => {
  const f = await fixture({ provider: {
    create: async () => { throw new Error('Timeout'); },
    get: async () => { throw Object.assign(new Error('Not found'), { status: 404 }); },
    cancel: async () => { throw new Error('Should not cancel'); },
    verify: async b => { if (b.signature !== 'signed-test-fixture') throw new Error('Invalid'); return b.data; },
  } });
  t.after(() => f.db.close());
  const order = await f.payments.checkout(f.actor, f.body());
  assert.equal(order.paymentState, 'UNKNOWN'); assert.equal((await one(f.db, 'SELECT * FROM inventory_balances')).reserved, 1);
  await execute(f.db, 'UPDATE payment_attempts SET last_reconciled_at=NULL');
  await f.payments.reconcile(order.id);
  const attempt = await one(f.db, 'SELECT * FROM payment_attempts WHERE order_id=?', [order.id]);
  assert.equal(attempt.status, 'FAILED'); assert.equal(attempt.active_slot, null); assert.equal(attempt.failure_code, 'PROVIDER_ORDER_NOT_FOUND');
  assert.equal((await one(f.db, 'SELECT * FROM orders WHERE id=?', [order.id])).status, 'CANCELLED');
  assert.equal((await one(f.db, 'SELECT * FROM inventory_reservations')).status, 'RELEASED');
  assert.equal((await one(f.db, 'SELECT * FROM inventory_balances')).reserved, 0);
  assert.equal(await scalar(f.db, "SELECT COUNT(*) FROM inventory_movements WHERE movement_type='RELEASE'"), 1);

  await execute(f.db, 'UPDATE payment_attempts SET last_reconciled_at=NULL');
  await f.payments.reconcile(order.id);
  assert.equal(await scalar(f.db, 'SELECT COUNT(*) FROM inventory_movements'), 2);

  await f.webhook(order.id);
  assert.equal((await one(f.db, 'SELECT * FROM orders')).payment_status, 'REVIEW');
  assert.equal((await one(f.db, 'SELECT * FROM inventory_balances')).on_hand, 2);
});

test('ambiguous provider failures keep UNKNOWN attempts and their hold for a later sweep', async t => {
  const f = await fixture({ provider: {
    create: async () => { throw new Error('Timeout'); },
    get: async () => { throw Object.assign(new Error('Server error'), { status: 503 }); },
    cancel: async () => { throw new Error('Should not cancel'); },
    verify: async () => { throw new Error('Invalid'); },
  } });
  t.after(() => f.db.close());
  const order = await f.payments.checkout(f.actor, f.body());
  await execute(f.db, 'UPDATE payment_attempts SET last_reconciled_at=NULL');
  await f.payments.reconcile(order.id);
  const attempt = await one(f.db, 'SELECT * FROM payment_attempts WHERE order_id=?', [order.id]);
  assert.equal(attempt.status, 'UNKNOWN'); assert.equal(attempt.active_slot, 1);
  assert.equal((await one(f.db, 'SELECT * FROM orders WHERE id=?', [order.id])).status, 'PENDING_PAYMENT');
  assert.equal((await one(f.db, 'SELECT * FROM inventory_reservations')).status, 'HELD');
  assert.equal((await one(f.db, 'SELECT * FROM inventory_balances')).reserved, 1);
});

test('hold budgets cap units per account and per variant across pending orders', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  await execute(f.db, 'UPDATE inventory_balances SET on_hand=50');
  const product = (await one(f.db, 'SELECT product_id FROM product_variants WHERE id=?', [f.variant])).product_id;
  const variants = [f.variant];
  for (let i = 0; i < 4; i++) {
    const id = uuid();
    await execute(f.db, 'INSERT INTO product_variants(id,product_id,sku,name,price_amount) VALUES (?,?,?,?,2000)', [id, product, `TEST-0${i + 2}`, `Variant ${i + 2}`]);
    await execute(f.db, 'INSERT INTO inventory_balances(variant_id,on_hand) VALUES (?,50)', [id]);
    variants.push(id);
  }
  for (let i = 0; i < 4; i++) assert.equal((await f.request('POST', '/api/v1/checkout', { ...f.body(), items: [{ variantId: variants[i], quantity: 5 }] })).status, 200);
  assert.equal((await f.request('POST', '/api/v1/checkout', { ...f.body(), items: [{ variantId: variants[4], quantity: 1 }] })).status, 409);

  const g = await fixture(); t.after(() => g.db.close());
  await execute(g.db, 'UPDATE inventory_balances SET on_hand=50');
  assert.equal((await g.request('POST', '/api/v1/checkout', { ...g.body(), items: [{ variantId: g.variant, quantity: 5 }] })).status, 200);
  assert.equal((await g.request('POST', '/api/v1/checkout', { ...g.body(), items: [{ variantId: g.variant, quantity: 1 }] })).status, 409);
});

test('sweep releases more than five expired holds and reports the processed count', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  await execute(f.db, 'UPDATE inventory_balances SET on_hand=20');
  for (let i = 0; i < 5; i++) assert.equal((await f.request('POST', '/api/v1/checkout', f.body())).status, 200);
  assert.equal((await f.request('POST', '/api/v1/checkout', f.body(), f.other)).status, 200);
  await execute(f.db, 'UPDATE payment_attempts SET expires_at=?,last_reconciled_at=NULL', [at(Date.now() - 1000)]);
  assert.equal(await f.payments.sweep(), 6);
  assert.equal(await scalar(f.db, "SELECT COUNT(*) FROM orders WHERE status='CANCELLED'"), 6);
  const inventory = await one(f.db, 'SELECT * FROM inventory_balances');
  assert.equal(inventory.reserved, 0); assert.equal(inventory.on_hand, 20);
});

test('provider-confirmed expiry releases stock; a late signed credit is review, not a second sale', async t => {
  const f = await fixture(); t.after(() => f.db.close()); const order = await f.payments.checkout(f.actor, f.body());
  await execute(f.db, 'UPDATE payment_attempts SET expires_at=?,last_reconciled_at=NULL', [at(Date.now() - 1000)]);
  await f.payments.reconcile(order.id); assert.equal((await one(f.db, 'SELECT * FROM orders')).status, 'CANCELLED'); assert.equal((await one(f.db, 'SELECT * FROM inventory_balances')).reserved, 0);
  await f.webhook(order.id); assert.equal((await one(f.db, 'SELECT * FROM orders')).payment_status, 'REVIEW'); assert.equal((await one(f.db, 'SELECT * FROM inventory_balances')).on_hand, 2);
});

test('reconciliation and webhook sharing a reference credit the ledger only once', async t => {
  const f = await fixture(); t.after(() => f.db.close()); const order = await f.payments.checkout(f.actor, f.body()), p = await one(f.db, 'SELECT * FROM payment_attempts');
  f.setProviderResult({ id: p.provider_payment_link_id, orderCode: p.provider_order_code, amount: 2000, amountPaid: 2000, status: 'PAID', transactions: [{ reference: 'same-bank-ref', amount: 2000, transactionDateTime: '2026-10-22 20:00:00' }] });
  await execute(f.db, 'UPDATE payment_attempts SET last_reconciled_at=NULL'); await f.payments.reconcile(order.id); await f.webhook(order.id, 2000, 'same-bank-ref');
  assert.equal(await scalar(f.db, 'SELECT COUNT(*) FROM payment_transactions'), 1); assert.equal((await one(f.db, 'SELECT * FROM inventory_balances')).on_hand, 1);
});

test('PayOS SDK validates actual HMAC and rejects altered or unsigned payloads', async () => {
  const provider = payosProvider({ PAYOS_CLIENT_ID: 'test-id', PAYOS_API_KEY: 'test-key', PAYOS_CHECKSUM_KEY: 'test-checksum' })!;
  const data = { amount: 2000, code: '00', currency: 'VND', orderCode: 100000001, paymentLinkId: 'link', reference: 'ref' };
  const signature = createHmac('sha256', 'test-checksum').update(Object.entries(data).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&')).digest('hex');
  assert.deepEqual(await provider.verify({ data, signature }), data);
  await assert.rejects(provider.verify({ data: { ...data, amount: 1 }, signature })); await assert.rejects(provider.verify({}));
});

test('JWT signature, disabled account, role change and version revocation take effect immediately', async t => {
  const f = await fixture(); t.after(() => f.db.close()); assert.equal((await f.request('GET', '/api/v1/auth/me')).status, 200);
  await execute(f.db, 'UPDATE app_users SET auth_version=1 WHERE id=?', [f.user]); assert.equal((await f.request('GET', '/api/v1/auth/me')).status, 401);
  await execute(f.db, "UPDATE app_users SET role='CUSTOMER' WHERE id=?", [f.admin]); assert.equal((await f.request('GET', '/api/v1/admin/dashboard', undefined, f.admin)).status, 403);
  assert.equal((await f.request('GET', '/api/v1/auth/me', undefined, null, { Cookie: 'AUTH_TOKEN=forged' })).status, 401);
  f.tokens.set(f.user, await f.token(f.user, 1)); await execute(f.db, 'UPDATE app_users SET enabled=0 WHERE id=?', [f.user]); assert.equal((await f.request('GET', '/api/v1/auth/me')).status, 401);
});

test('login accepts migrated BCrypt hashes and returns HttpOnly cookies; logout revokes JWT', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const response = await f.request('POST', '/api/v1/auth/login', { email: f.user + '@example.test', password: 'password123' }); assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie')!, /AUTH_TOKEN=.*HttpOnly/); assert.equal((await response.json()).id, f.user);
  assert.equal((await f.request('POST', '/api/v1/auth/login', { email: f.user + '@example.test', password: 'bad' })).status, 401);
  assert.equal((await f.request('POST', '/api/v1/auth/logout', null)).status, 204); assert.equal((await f.request('GET', '/api/v1/auth/me')).status, 401);
});

test('register creates new accounts and rejects duplicate email with 409', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const reg1 = await f.request('POST', '/api/v1/auth/register', { displayName: 'Người mới', email: 'nguoimoi@example.test', password: 'password123' });
  assert.equal(reg1.status, 200);
  assert.match(reg1.headers.get('set-cookie')!, /AUTH_TOKEN=.*HttpOnly/);
  const dup = await f.request('POST', '/api/v1/auth/register', { displayName: 'Người mới trùng', email: 'nguoimoi@example.test', password: 'password123' });
  assert.equal(dup.status, 409);
});

test('draft versioning, references, clone and public draft isolation retain their contracts', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const created = await f.request('POST', '/api/v1/admin/content/releases', { title: 'Nội dung thử', versionLabel: 'test-v1' }, f.admin); assert.equal(created.status, 201); const release = await created.json();
  const set = await (await f.request('POST', `/api/v1/admin/content/releases/${release.id}/card-sets`, { expectedVersion: 0, code: 'TEST', slug: 'test-set', name: 'Bộ thử' }, f.admin)).json();
  assert.equal(set.releaseVersion, 1);
  assert.equal((await f.request('PUT', `/api/v1/admin/content/releases/${release.id}`, { expectedVersion: 0, title: 'Stale' }, f.admin)).status, 409);
  assert.equal((await f.request('GET', `/api/v1/content/release?releaseId=${release.id}`, undefined, null)).status, 404);
  const card = { expectedVersion: 1, code: 'CARD', slug: 'the-thu', name: 'Thẻ thử', cardSetId: set.entityId, effectText: 'Hiệu ứng', ruleStatus: 'CONFIRMED', copiesInDeck: 1 };
  assert.equal((await f.request('POST', `/api/v1/admin/content/releases/${release.id}/cards`, { ...card, cardSetId: uuid() }, f.admin)).status, 409);
  assert.equal((await f.request('POST', `/api/v1/admin/content/releases/${release.id}/cards`, card, f.admin)).status, 201);
  const cloned = await f.request('POST', `/api/v1/admin/content/releases/${release.id}/clone`, { sourceVersion: 2, versionLabel: 'clone-v1', title: 'Clone' }, f.admin); assert.equal(cloned.status, 201);
  const clone = await cloned.json(); assert.equal(await scalar(f.db, 'SELECT COUNT(*) FROM card_revisions WHERE release_id=?', [clone.id]), 1);
  await execute(f.db, "UPDATE content_releases SET status='PUBLISHED',current_slot=1,published_at=? WHERE id=?", [now(), release.id]);
  const result = await (await f.request('GET', '/api/v1/content/cards?q=the', undefined, null)).json(); assert.equal(result.result.totalElements, 1); assert.equal(result.result.items[0].name, 'Thẻ thử');
  assert.equal((await f.request('PUT', `/api/v1/admin/content/releases/${release.id}`, { expectedVersion: 2, title: 'Immutable' }, f.admin)).status, 409);
  const empty = await (await f.request('GET', '/api/v1/content/cards?page=100', undefined, null)).json(); assert.deepEqual(empty.result.items, []);
});

test('feedback limits, moderation transitions and notification read isolation', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const created = await f.request('POST', '/api/v1/feedback', { category: 'OTHER', message: 'Phản hồi thử' }); assert.equal(created.status, 201); const feedback = await created.json();
  assert.equal(await scalar(f.db, 'SELECT COUNT(*) FROM admin_notifications'), 1);
  const list = await (await f.request('GET', '/api/v1/admin/feedback', undefined, f.admin)).json(); assert.equal(list.items[0].message, undefined); assert.equal(list.items[0].userId, undefined);
  const notification = await (await f.request('GET', '/api/v1/admin/notifications', undefined, f.admin)).json(); assert.equal(notification.unreadCount, 1);
  assert.equal((await f.request('POST', `/api/v1/admin/notifications/${notification.items[0].id}/read`, null, f.admin)).status, 200);
  assert.equal((await (await f.request('GET', '/api/v1/admin/notifications', undefined, f.admin)).json()).unreadCount, 0);
  assert.equal((await f.request('PUT', `/api/v1/admin/feedback/${feedback.id}`, { expectedVersion: 0, status: 'RESOLVED', moderationNote: 'Xong' }, f.admin)).status, 200);
  assert.equal((await f.request('PUT', `/api/v1/admin/feedback/${feedback.id}`, { expectedVersion: 1, status: 'REJECTED', moderationNote: 'Sai bước' }, f.admin)).status, 409);
  for (let i = 0; i < 4; i++) assert.equal((await f.request('POST', '/api/v1/feedback', { category: 'OTHER', message: 'Thử' })).status, 201);
  assert.equal((await f.request('POST', '/api/v1/feedback', { category: 'OTHER', message: 'Vượt' })).status, 429);
});

test('malformed, duplicate-item and oversized inputs cannot create orders', async t => {
  const f = await fixture(); t.after(() => f.db.close()); const body = f.body();
  assert.equal((await f.request('POST', '/api/v1/checkout', { ...body, items: [...body.items, ...body.items] })).status, 409);
  assert.equal((await f.request('POST', '/api/v1/checkout', { ...body, items: [{ variantId: 'invalid', quantity: 1 }] })).status, 400);
  assert.equal((await f.request('POST', '/api/v1/checkout', { ...body, note: 'x'.repeat(70000) })).status, 413);
  assert.equal((await f.request('POST', '/api/v1/payments/payos/webhook', {} , null)).status, 400);
  assert.equal(await scalar(f.db, 'SELECT COUNT(*) FROM orders'), 0);
});

test('password recovery token is single-use and revokes existing authentication', async t => {
  let deliver!: (url: string) => void; const delivered = new Promise<string>(resolve => { deliver = resolve; });
  const f = await fixture({ reset: true, mail: async (_email, url) => { deliver(url); } }); t.after(() => f.db.close());
  const response = await f.request('POST', '/api/v1/auth/forgot-password', { email: f.user + '@example.test' }); assert.equal(response.status, 202);
  const url = await delivered, token = new URL(url).hash.slice(7);
  assert.equal((await f.request('POST', '/api/v1/auth/reset-password', { token, password: 'changed-password' })).status, 204);
  assert.equal((await f.request('GET', '/api/v1/auth/me')).status, 401);
  assert.equal((await f.request('POST', '/api/v1/auth/reset-password', { token, password: 'changed-again' })).status, 400);
  const user = await one(f.db, 'SELECT * FROM app_users WHERE id=?', [f.user]); assert.ok(await bcrypt.compare('changed-password', user.password_hash));
  assert.equal(await scalar(f.db, 'SELECT COUNT(*) FROM password_reset_tokens'), 0);
});

test('OAuth callback cannot be forged without matching state cookie and database state', async t => {
  const f = await fixture(); t.after(() => f.db.close()); const { app } = createApp(f.db, { ...f.config, googleEnabled: true, googleClientId: 'test', googleClientSecret: 'test' });
  const start = await app.request('/api/v1/auth/oauth2/authorization/google'); assert.equal(start.status, 302);
  const location = new URL(start.headers.get('location')!); assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
  const callback = await app.request('/api/v1/auth/oauth2/callback/google?code=forged&state=forged'); assert.equal(callback.status, 302); assert.equal(callback.headers.get('location'), '/dang-nhap?authError=google');
  assert.equal(await scalar(f.db, 'SELECT COUNT(*) FROM app_users'), 3);
});

test('failed mail delivery preserves the previous usable reset link', async t => {
  let attempted!: () => void; const started = new Promise<void>(resolve => { attempted = resolve; });
  const f = await fixture({ reset: true, mail: async () => { attempted(); throw new Error('Simulated mail failure'); } }); t.after(() => f.db.close());
  await execute(f.db, 'INSERT INTO password_reset_tokens VALUES (?,?,?,?)', [f.user, 'previous-token-digest', at(Date.now() - 120000), at(Date.now() + 600000)]);
  assert.equal((await f.request('POST', '/api/v1/auth/forgot-password', { email: f.user + '@example.test' })).status, 202);
  await started;
  for (let i = 0; i < 100; i++) {
    // The in-memory test database has one connection; skip a poll while the background worker holds its transaction.
    const rows = await all(f.db, 'SELECT token_hash FROM password_reset_tokens WHERE user_id=?', [f.user]).catch(error => { if (error?.code === 'TRANSACTION_ACTIVE') return []; throw error; });
    if (rows[0]?.token_hash === 'previous-token-digest') { await new Promise(resolve => setTimeout(resolve, 20)); const final = await one(f.db, 'SELECT token_hash FROM password_reset_tokens WHERE user_id=?', [f.user]); if (final.token_hash === 'previous-token-digest') return; }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('Previous reset link was not restored');
});

test('public content is cached until an admin write; failures and drafts are not cached; timing header is sent', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const release = await (await f.request('POST', '/api/v1/admin/content/releases', { title: 'Cache', versionLabel: 'cache-v1' }, f.admin)).json();
  const set = await (await f.request('POST', `/api/v1/admin/content/releases/${release.id}/card-sets`, { expectedVersion: 0, code: 'C', slug: 'c-set', name: 'Bộ' }, f.admin)).json();
  assert.equal((await f.request('POST', `/api/v1/admin/content/releases/${release.id}/cards`, { expectedVersion: 1, code: 'C1', slug: 'the-cache', name: 'Thẻ cũ', cardSetId: set.entityId, effectText: 'x', ruleStatus: 'CONFIRMED', copiesInDeck: 1 }, f.admin)).status, 201);
  assert.equal((await f.request('GET', '/api/v1/content/cards', undefined, null)).status, 404); // chưa có bản xuất bản, không bị cache
  await execute(f.db, "UPDATE content_releases SET status='PUBLISHED',current_slot=1,published_at=? WHERE id=?", [now(), release.id]);
  const first = await f.request('GET', '/api/v1/content/cards', undefined, null);
  assert.equal(first.status, 200); assert.match(first.headers.get('Server-Timing') || '', /^app;dur=\d+$/);
  assert.equal((await first.json()).result.items[0].name, 'Thẻ cũ');
  await execute(f.db, "UPDATE card_revisions SET name='Thẻ mới' WHERE release_id=?", [release.id]);
  assert.equal((await (await f.request('GET', '/api/v1/content/cards?utm_source=x&page=0', undefined, null)).json()).result.items[0].name, 'Thẻ cũ'); // cùng cache key
  assert.equal((await (await f.request('GET', '/api/v1/content/cards', undefined, null)).json()).result.items[0].name, 'Thẻ cũ'); // từ cache
  assert.equal((await f.request('POST', '/api/v1/admin/content/releases', { title: 'Khác', versionLabel: 'cache-v2' }, f.admin)).status, 201); // ghi admin xóa cache
  assert.equal((await (await f.request('GET', '/api/v1/content/cards', undefined, null)).json()).result.items[0].name, 'Thẻ mới');
  const snapshot = await (await f.request('GET', '/api/v1/content/snapshot', undefined, null)).json();
  assert.equal(snapshot.content.cards.length, 1); assert.equal(snapshot.content['card-sets'].length, 1);
});

test('public reads skip the per-request user lookup but protected routes still validate the account', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  await execute(f.db, 'UPDATE app_users SET enabled=0 WHERE id=?', [f.user]);
  assert.equal((await f.request('GET', '/api/v1/shop/products', undefined, f.user)).status, 200);
  assert.equal((await f.request('GET', '/api/v1/orders', undefined, f.user)).status, 401);
});

test('address book: CRUD is owner-only, first address is default, one default at a time, limit enforced', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const input = (extra: Record<string, unknown> = {}) => ({ label: 'Nhà', recipientName: 'Khách thử', phone: '0901234567', addressLine: '12 Đường Thử', ward: 'Phường 1', district: 'Quận 1', province: 'TP. Hồ Chí Minh', ...extra });
  assert.equal((await f.request('GET', '/api/v1/addresses', undefined, null)).status, 401);
  assert.deepEqual(await (await f.request('GET', '/api/v1/addresses')).json(), []);

  const first = await f.request('POST', '/api/v1/addresses', input()); assert.equal(first.status, 201);
  const a = await first.json(); assert.equal(a.isDefault, true); assert.equal(a.province, 'TP. Hồ Chí Minh');
  const b = await (await f.request('POST', '/api/v1/addresses', input({ label: 'Cơ quan', addressLine: '34 Đường Mẫu' }))).json(); assert.equal(b.isDefault, false);
  const c = await (await f.request('POST', '/api/v1/addresses', input({ label: 'Quê', isDefault: true }))).json(); assert.equal(c.isDefault, true);
  let listed = await (await f.request('GET', '/api/v1/addresses')).json();
  assert.equal(listed.filter((x: any) => x.isDefault).length, 1); assert.equal(listed[0].id, c.id);

  // Người khác không thấy/sửa/xóa được địa chỉ của mình.
  assert.deepEqual(await (await f.request('GET', '/api/v1/addresses', undefined, f.other)).json(), []);
  assert.equal((await f.request('PUT', `/api/v1/addresses/${a.id}`, input(), f.other)).status, 404);
  assert.equal((await f.request('DELETE', `/api/v1/addresses/${a.id}`, undefined, f.other)).status, 404);
  assert.equal((await f.request('POST', `/api/v1/addresses/${a.id}/default`, undefined, f.other)).status, 404);

  const edited = await (await f.request('PUT', `/api/v1/addresses/${b.id}`, input({ addressLine: '56 Đường Sửa', label: null }))).json();
  assert.equal(edited.addressLine, '56 Đường Sửa'); assert.equal(edited.label, null); assert.equal(edited.isDefault, false);

  listed = await (await f.request('POST', `/api/v1/addresses/${a.id}/default`)).json();
  assert.equal(listed.find((x: any) => x.isDefault).id, a.id);
  listed = await (await f.request('DELETE', `/api/v1/addresses/${a.id}`)).json();   // xóa mặc định → địa chỉ mới nhất còn lại thành mặc định
  assert.equal(listed.length, 2); assert.equal(listed.filter((x: any) => x.isDefault).length, 1);

  for (let i = 0; i < 8; i++) assert.equal((await f.request('POST', '/api/v1/addresses', input({ label: `Thêm ${i}` }))).status, 201);
  assert.equal((await f.request('POST', '/api/v1/addresses', input())).status, 409);   // tối đa 10 địa chỉ
});

test('address book rejects invalid input, requires CSRF and keeps the checkout snapshot independent', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const valid = { recipientName: 'Khách thử', phone: '0901234567', addressLine: '12 Đường Thử', province: 'Hà Nội' };
  for (const bad of [{ ...valid, phone: 'abc' }, { ...valid, recipientName: '   ' }, { ...valid, province: '' }, { ...valid, addressLine: 'x'.repeat(501) }, {}]) {
    assert.equal((await f.request('POST', '/api/v1/addresses', bad)).status, 400);
  }
  assert.equal((await f.request('POST', '/api/v1/addresses', valid, f.user, { 'X-XSRF-TOKEN': 'wrong' })).status, 403);
  assert.equal((await f.request('GET', `/api/v1/addresses/not-a-uuid`)).status, 404);

  const saved = await (await f.request('POST', '/api/v1/addresses', valid)).json();
  // Đơn hàng lưu bản chụp địa chỉ lúc mua: sửa/xóa sổ địa chỉ sau đó không đổi đơn cũ.
  const order = await (await f.request('POST', '/api/v1/checkout', { idempotencyKey: 'a'.repeat(20), items: [{ variantId: f.variant, quantity: 1 }], recipientName: saved.recipientName, recipientPhone: saved.phone, addressLine: saved.addressLine, province: saved.province, note: null })).json();
  await f.request('PUT', `/api/v1/addresses/${saved.id}`, { ...valid, addressLine: '99 Đường Mới' });
  await f.request('DELETE', `/api/v1/addresses/${saved.id}`);
  const row = await one(f.db, 'SELECT shipping_address_line,shipping_province FROM orders WHERE id=?', [order.id]);
  assert.equal(row.shipping_address_line, '12 Đường Thử'); assert.equal(row.shipping_province, 'Hà Nội');
});
