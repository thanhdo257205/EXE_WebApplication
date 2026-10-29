import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHmac } from 'node:crypto';
import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';
import { PayOS } from '@payos/node';
import type { Client } from '@libsql/client';
import { database, initializeLocal, execute, one, all, scalar, now, at, uuid } from '../src/db.ts';
import { createApp } from '../src/app.ts';
import { type Config, type Actor } from '../src/auth.ts';
import { type Provider, checkoutSchema, payosProvider, webhookSignedString, verifyWebhookSignature, MAX_CATALOG_PRODUCTS } from '../src/payments.ts';
import { type AssistantOptions, type ChatProvider, type CompletionRequest, type CompletionResult, ProviderError } from '../src/assistant-providers.ts';
import { DEFAULT_KEY_TOKEN_BUDGET } from '../src/assistant-settings.ts';

const asResult = (value: CompletionResult | string): CompletionResult =>
  typeof value === 'string' ? { text: value, tokensIn: 0, tokensOut: 0 } : value;
type ChatReply = (request: CompletionRequest) => Promise<CompletionResult | string>;
const chatProvider = (id: ChatProvider['id'], complete: ChatReply, model = 'test-model', slot = `${id}#1`): ChatProvider => ({
  id, model, slot,
  complete: async request => asResult(await complete(request)),
  withModel: next => chatProvider(id, complete, next, slot),
});

async function publishKnowledge(db: Client) {
  const release = uuid(), set = uuid(), card = uuid(), page = uuid();
  await execute(db, "INSERT INTO content_releases(id,version_label,title,status,current_slot,published_at) VALUES (?,'test-v1','Bản thử','PUBLISHED',1,?)", [release, now()]);
  await execute(db, "INSERT INTO card_sets(id,code,slug) VALUES (?,'SET','bo-thu')", [set]);
  await execute(db, "INSERT INTO card_set_revisions(id,card_set_id,release_id,name,description,sort_order) VALUES (?,?,?,'Bộ thử','Mô tả bộ thử.',0)", [uuid(), set, release]);
  await execute(db, "INSERT INTO game_cards(id,code,slug) VALUES (?,'CARD','the-nguoi-moi')", [card]);
  await execute(db, "INSERT INTO card_revisions(id,card_id,release_id,card_set_id,name,effect_text,ruling_notes,rule_status,copies_in_deck,sort_order) VALUES (?,?,?,?,'Thẻ Người Mới','Khi bắt đầu tháng, nhận 1 Tiền.','Áp dụng một lần.','CONFIRMED',2,0)", [uuid(), card, release, set]);
  await execute(db, "INSERT INTO wiki_pages(id,slug,page_type) VALUES (?,'luat-co-ban','RULE')", [page]);
  await execute(db, "INSERT INTO wiki_page_revisions(id,page_id,release_id,title,summary,body_markdown,rule_status) VALUES (?,?,?,'Luật cơ bản','Cách trả hóa đơn.','Mỗi tháng mỗi người góp 0–4 Tiền vào Quỹ Chung. Hóa đơn cơ bản là 8 Tiền.','CONFIRMED')", [uuid(), page, release]);
  return release;
}

async function fixture(options: { provider?: Provider | null; mail?: (email: string, url: string) => Promise<void>; reset?: boolean; assistant?: AssistantOptions | null } = {}) {
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
  const { app, payments, usage } = createApp(db, config, options.provider === undefined ? mock : options.provider, options.mail, undefined, options.assistant ?? null);
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
  return { db, app, config, user, admin, other, actor, variant, body, request, webhook, payments, usage, token, tokens, creates: () => creates, setProviderResult: (value: any) => { getResponse = value; } };
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

test('PayOS webhook is verified by a local timing-safe HMAC compare', async () => {
  const checksumKey = 'test-checksum';
  const provider = payosProvider({ PAYOS_CLIENT_ID: 'test-id', PAYOS_API_KEY: 'test-key', PAYOS_CHECKSUM_KEY: checksumKey })!;
  const data = { amount: 2000, code: '00', currency: 'VND', orderCode: 100000001, paymentLinkId: 'link', reference: 'ref' };
  const signature = createHmac('sha256', checksumKey).update(Object.entries(data).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&')).digest('hex');
  assert.deepEqual(await provider.verify({ data, signature }), data);
  // Every rejection names the local verifier: the SDK's own message ('Data not integrity') would
  // surface if the provider delegated back to client.webhooks.verify.
  await assert.rejects(provider.verify({ data: { ...data, amount: 1 }, signature }), { message: 'Webhook signature mismatch' });
  await assert.rejects(provider.verify({ data, signature: '0'.repeat(signature.length) }), { message: 'Webhook signature mismatch' });
  await assert.rejects(provider.verify({ data, signature: signature.slice(0, -2) + 'ff' }), { message: 'Webhook signature mismatch' });
  await assert.rejects(provider.verify({}), { message: 'Invalid webhook data' });
  await assert.rejects(provider.verify({ data: 'not-an-object', signature }), { message: 'Invalid webhook data' });
  await assert.rejects(provider.verify({ data }), { message: 'Invalid signature' });
});

/** Differential against the pinned SDK: a divergent canonical string would reject every real webhook. */
test('the local PayOS canonical string matches the SDK on adversarial payloads', async () => {
  const checksumKey = 'test-checksum';
  const sdk = new PayOS({ clientId: 'test-id', apiKey: 'test-key', checksumKey });
  const payloads: Record<string, unknown>[] = [
    { amount: 2000, code: '00', currency: 'VND', orderCode: 100000001, paymentLinkId: 'link', reference: 'ref' },
    { zeta: 1, alpha: 2, Middle: 3, amount: 4 },
    { amount: 2000, note: null, bankId: 'undefined', bankName: 'null', code: '00' },
    { amount: 2000, omitted: undefined, transactions: [{ b: 1, a: 2 }, { z: 9, y: 8 }] },
    { amount: 0, description: '', currency: 'VND' },
    { only: undefined },
    {},
    { code: '00', data: { nested: { b: 1, a: [2, 1] } }, items: ['plain', 'two'] },
    { counterAccountBankId: null, counterAccountName: 'Nguyen Van A', orderCode: 1234567890123 },
  ];
  for (const data of payloads) {
    const expected = await sdk.crypto.createSignatureFromObj(data, checksumKey);
    const local = createHmac('sha256', checksumKey).update(webhookSignedString(data)).digest('hex');
    assert.equal(local, expected, `canonical string diverged for ${JSON.stringify(data)}`);
  }
});

test('the edge gate arms on the public origin, not on NODE_ENV', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const secret = { 'X-Origin-Verify': f.config.proxySecret };
  // A deployed app that forgot NODE_ENV=production but kept the secret must still refuse direct origin hits.
  const deployed = createApp(f.db, { ...f.config, production: false, publicOrigin: 'https://exe.example' });
  assert.equal((await deployed.app.request('/api/v1/info')).status, 403);
  assert.equal((await deployed.app.request('/api/v1/info', { headers: secret })).status, 200);
  assert.equal((await deployed.app.request('/api/v1/payments/payos/webhook', { method: 'POST', body: '{}' })).status, 403);
  assert.equal((await deployed.app.request('/actuator/health')).status, 200);
  // Local development keeps the secret but is not behind the edge: http://localhost stays reachable.
  const local = createApp(f.db, { ...f.config, production: false });
  assert.equal((await local.app.request('/api/v1/info')).status, 200);
  // Loopback in production stays gated, so a tunnel cannot bypass the edge by binding to 127.0.0.1.
  const loopbackProduction = createApp(f.db, { ...f.config, production: true });
  assert.equal((await loopbackProduction.app.request('/api/v1/info')).status, 403);
  // Without a secret there is nothing to verify against, so the gate fails closed instead of open.
  const secretless = createApp(f.db, { ...f.config, production: false, publicOrigin: 'https://exe.example', proxySecret: '' });
  assert.equal((await secretless.app.request('/api/v1/info')).status, 403);
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
  // Moderation is a feedback:moderate capability: the write response carries queue state and the lock
  // version only, so a moderate-only grant never receives the customer's text or address.
  const second = (await (await f.request('POST', '/api/v1/feedback', { category: 'OTHER', message: 'Phản hồi thứ hai', contactEmail: 'khach@example.test' }, f.other)).json()).id;
  const moderated = await (await f.request('PUT', `/api/v1/admin/feedback/${second}`, { expectedVersion: 0, status: 'IN_REVIEW', moderationNote: 'Đang xem' }, f.admin)).json();
  assert.deepEqual(Object.keys(moderated).sort(), ['cardId', 'category', 'createdAt', 'id', 'moderationNote', 'pageId', 'releaseId', 'status', 'updatedAt', 'version']);
  assert.equal(JSON.stringify(moderated).includes('Phản hồi thứ hai'), false);
  assert.equal(JSON.stringify(moderated).includes('khach@example.test'), false);
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

test('the anonymous catalog costs one round trip, survives until an admin write and is row-capped', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  let roundTrips = 0;
  const counting = new Proxy(f.db, {
    get(target, property, receiver) {
      if (property === 'batch') return (...statements: any[]) => { roundTrips++; return (target as any).batch(...statements); };
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as typeof f.db;
  const edge = createApp(counting, f.config, null);
  const call = (method: string, path: string, id: string | null = null, data?: unknown) => edge.app.request(path, {
    method,
    headers: { ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(id ? { Cookie: `AUTH_TOKEN=${f.tokens.get(id)}; XSRF-TOKEN=test-csrf`, 'X-XSRF-TOKEN': 'test-csrf' } : {}) },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  const price = async () => (await (await call('GET', '/api/v1/shop/products')).json())[0].variants[0].priceAmount;
  assert.equal(await price(), 2000); assert.equal(roundTrips, 1);
  await execute(f.db, 'UPDATE product_variants SET price_amount=2500');
  assert.equal(await price(), 2000); assert.equal(roundTrips, 1, 'the cached catalog read must not reach the database');
  assert.equal((await call('POST', '/api/v1/admin/content/releases', f.admin, { title: 'Rebuild', versionLabel: 'catalog-v1' })).status, 201);
  assert.equal(await price(), 2500); assert.equal(roundTrips, 2);
});

test('a catalog past the row cap fails closed instead of scanning unbounded rows', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const [{ id: category }] = await all(f.db, 'SELECT id FROM product_categories');
  const extra = MAX_CATALOG_PRODUCTS; // the fixture already ships one ACTIVE product
  const productArgs: (string | number)[] = [], variantArgs: (string | number)[] = [];
  for (let i = 0; i < extra; i++) {
    const id = uuid();
    productArgs.push(id, category, `cap-${i}`, 'Cap', 'ACTIVE');
    variantArgs.push(uuid(), id, `CAP-${i}`, 'Cap', 1000);
  }
  await execute(f.db, `INSERT INTO products(id,category_id,slug,name,status) VALUES ${Array(extra).fill('(?,?,?,?,?)').join(',')}`, productArgs);
  await execute(f.db, `INSERT INTO product_variants(id,product_id,sku,name,price_amount) VALUES ${Array(extra).fill('(?,?,?,?,?)').join(',')}`, variantArgs);
  const response = await f.request('GET', '/api/v1/shop/products', undefined, null);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).title, 'CATALOG_TOO_LARGE');
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

test('assistant requires login and CSRF, falls back on quota and grounds the prompt in published content', async t => {
  const attempts: string[] = []; let prompt = ''; let messages: { role: string; content: string }[] = [];
  const assistant: AssistantOptions = {
    timeoutMs: 2_000, attemptTimeoutMs: 1_000, maxOutputTokens: 300, temperature: 0.2,
    providers: [
      chatProvider('workers-ai', async () => { attempts.push('workers-ai'); throw new ProviderError('workers-ai', 'QUOTA'); }),
      chatProvider('gemini', async request => { attempts.push('gemini'); prompt = request.system; messages = request.messages; return { text: 'Mỗi người góp 0–4 Tiền [1].', tokensIn: 50, tokensOut: 12 }; }),
    ],
  };
  const f = await fixture({ assistant }); t.after(() => f.db.close());
  await publishKnowledge(f.db);
  const question = { message: 'Quỹ chung góp bao nhiêu?', history: [{ role: 'user', content: 'Chào bạn' }, { role: 'assistant', content: 'Chào bạn!' }] };
  // CSRF runs before authentication, so an anonymous caller needs a valid token to reach the 401.
  const anonymous = await f.request('POST', '/api/v1/assistant/chat', question, null, { Cookie: 'XSRF-TOKEN=test-csrf', 'X-XSRF-TOKEN': 'test-csrf' });
  assert.equal(anonymous.status, 401);
  assert.equal((await anonymous.json()).code, 'AUTH_REQUIRED');
  const withoutCsrf = await f.app.request('/api/v1/assistant/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `AUTH_TOKEN=${f.tokens.get(f.user)}` }, body: JSON.stringify(question),
  });
  assert.equal(withoutCsrf.status, 403); assert.equal((await withoutCsrf.json()).code, 'CSRF_REQUIRED');
  const response = await f.request('POST', '/api/v1/assistant/chat', question, f.user);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.answer, 'Mỗi người góp 0–4 Tiền [1].');
  assert.equal(body.release.versionLabel, 'test-v1');
  assert.ok(body.sources.some((source: any) => source.url === '/wiki/luat-co-ban'));
  // The dock renders this trace: provider/model, retrieval counts and spend, never prompts or keys.
  assert.equal(body.meta.provider, 'gemini');
  assert.equal(body.meta.model, 'test-model');
  assert.equal(body.meta.cached, false);
  assert.equal(body.meta.tokensIn, 50);
  assert.equal(body.meta.tokensOut, 12);
  assert.ok(body.meta.considered >= body.meta.selected);
  assert.ok(body.meta.selected >= 1);
  assert.equal(typeof body.meta.latencyMs, 'number');
  assert.equal(body.meta.slot, undefined);
  assert.deepEqual(attempts, ['workers-ai', 'gemini']);
  assert.match(prompt, /TÀI LIỆU/); assert.match(prompt, /Luật cơ bản/); assert.match(prompt, /Quỹ Chung/);
  assert.deepEqual(messages.map(message => message.role), ['user', 'assistant', 'user']);
});

test('assistant caches answers per release and conversation without sharing across histories', async t => {
  let calls = 0;
  const assistant: AssistantOptions = {
    timeoutMs: 2_000, attemptTimeoutMs: 1_000, maxOutputTokens: 300, temperature: 0.2,
    providers: [chatProvider('groq', async () => { calls++; return `Trả lời ${calls}`; })],
  };
  const f = await fixture({ assistant }); t.after(() => f.db.close());
  await publishKnowledge(f.db);
  const ask = (message = 'Cách chơi?', history: { role: 'user' | 'assistant'; content: string }[] = []) =>
    f.request('POST', '/api/v1/assistant/chat', { message, history }, f.user);
  const first = await (await ask()).json();
  assert.equal(first.answer, 'Trả lời 1');
  assert.equal(first.meta.cached, false);
  assert.equal((await (await ask('  cách chơi  ')).json()).answer, 'Trả lời 1');
  const replay = await (await ask('Cách chơi!')).json();
  assert.equal(replay.answer, 'Trả lời 1');
  // A cache hit reports zero fresh spend and zero latency instead of the original model run.
  assert.equal(replay.meta.cached, true);
  assert.equal(replay.meta.tokensIn, 0);
  assert.equal(replay.meta.tokensOut, 0);
  assert.equal(replay.meta.latencyMs, 0);
  assert.equal(replay.meta.model, 'test-model');
  assert.equal(calls, 1);
  const prior = [{ role: 'user' as const, content: 'Hỏi trước đó' }];
  assert.equal((await (await ask('Cách chơi?', prior)).json()).answer, 'Trả lời 2');
  assert.equal((await (await ask('Cách chơi?', prior)).json()).answer, 'Trả lời 2');
  assert.equal(calls, 2);
  assert.equal((await (await ask('Cách chơi?', [{ role: 'user', content: 'Hỏi khác' }])).json()).answer, 'Trả lời 3');
  assert.equal(calls, 3);
});

test('assistant fails closed with AI_UNAVAILABLE and answers gracefully without a release', async t => {
  const failing: AssistantOptions = {
    timeoutMs: 2_000, attemptTimeoutMs: 1_000, maxOutputTokens: 300, temperature: 0.2,
    providers: [
      chatProvider('workers-ai', async () => { throw new ProviderError('workers-ai', 'AUTH'); }),
      chatProvider('openrouter', async () => { throw new ProviderError('openrouter', 'UNAVAILABLE'); }),
    ],
  };
  const f = await fixture({ assistant: failing }); t.after(() => f.db.close());
  await publishKnowledge(f.db);
  const failed = await f.request('POST', '/api/v1/assistant/chat', { message: 'Luật là gì?' }, f.user);
  assert.equal(failed.status, 503); assert.equal((await failed.json()).code, 'AI_UNAVAILABLE');

  let calls = 0;
  const g = await fixture({ assistant: { ...failing, providers: [chatProvider('groq', async () => { calls++; return 'không dùng'; })] } }); t.after(() => g.db.close());
  const empty = await g.request('POST', '/api/v1/assistant/chat', { message: 'Cách chơi?' }, g.user);
  assert.equal(empty.status, 200);
  const body = await empty.json();
  assert.equal(body.release, null); assert.match(body.answer, /chưa có bản nội dung/);
  assert.equal(calls, 0);
});

test('assistant validates input and fails closed when no provider is configured', async t => {
  const f = await fixture(); t.after(() => f.db.close());
  const send = (body: any) => f.request('POST', '/api/v1/assistant/chat', body, f.user);
  assert.equal((await send({ message: '   ' })).status, 400);
  assert.equal((await send({ message: 'x'.repeat(1001) })).status, 400);
  assert.equal((await send({ message: 'hỏi', history: Array.from({ length: 9 }, () => ({ role: 'user', content: 'x' })) })).status, 400);
  assert.equal((await send({ message: 'hỏi', history: [{ role: 'user', content: 'x'.repeat(601) }] })).status, 400);
  const unavailable = await send({ message: 'Cách chơi?' });
  assert.equal(unavailable.status, 503); assert.equal((await unavailable.json()).code, 'AI_UNAVAILABLE');
  assert.equal((await f.request('GET', '/api/v1/assistant/chat', undefined, null)).status, 404);
});

test('admins configure provider order, models and slots while usage stays provider-only', async t => {
  const calls: string[] = [];
  const assistant: AssistantOptions = {
    timeoutMs: 2_000, attemptTimeoutMs: 1_000, maxOutputTokens: 300, temperature: 0.2,
    providers: [
      chatProvider('gemini', async () => { calls.push('gemini#1'); return 'gemini'; }, 'gemini-base', 'gemini#1'),
      chatProvider('gemini', async () => { calls.push('gemini#2'); return 'gemini2'; }, 'gemini-base', 'gemini#2'),
      chatProvider('groq', async () => { calls.push('groq#1'); return { text: 'groq', tokensIn: 30, tokensOut: 10 }; }, 'groq-base', 'groq#1'),
    ],
  };
  const f = await fixture({ assistant }); t.after(() => f.db.close());
  await publishKnowledge(f.db);

  const settings = await (await f.request('GET', '/api/v1/admin/assistant/settings', undefined, f.admin)).json();
  assert.deepEqual(settings.settings.order, ['gemini', 'groq']);
  // The admin page shows this ceiling on every stored key until a per-key budget is saved.
  assert.equal(settings.keyBudgetDefault, DEFAULT_KEY_TOKEN_BUDGET);
  assert.deepEqual(settings.providers.find((provider: any) => provider.id === 'gemini').slots.map((slot: any) => slot.slot), ['gemini#1', 'gemini#2']);
  assert.equal((await f.request('GET', '/api/v1/admin/assistant/settings', undefined, f.user)).status, 403);

  const plan = {
    order: ['groq', 'gemini'], models: { groq: 'groq-fast', gemini: 'gemini-base' },
    disabledSlots: ['gemini#2'], tokenBudgets: { groq: 5_000, gemini: 12_000 },
    keyBudgets: { '7a4e5c92-1d3b-4f60-9a11-2c5d8e9f0a1b': 1_500 }, expectedVersion: 0,
  };
  assert.equal((await f.request('PUT', '/api/v1/admin/assistant/settings', plan, f.user)).status, 403);
  assert.equal((await f.request('PUT', '/api/v1/admin/assistant/settings', { order: plan.order, models: plan.models, disabledSlots: plan.disabledSlots, expectedVersion: 0 }, f.admin)).status, 400);
  assert.equal((await f.request('PUT', '/api/v1/admin/assistant/settings', { ...plan, disabledSlots: ['gemini#9'] }, f.admin)).status, 400);
  assert.equal((await f.request('PUT', '/api/v1/admin/assistant/settings', { ...plan, tokenBudgets: { unknown: 5 } }, f.admin)).status, 400);
  assert.equal((await f.request('PUT', '/api/v1/admin/assistant/settings', { ...plan, tokenBudgets: { groq: 0 } }, f.admin)).status, 400);
  assert.equal((await f.request('PUT', '/api/v1/admin/assistant/settings', { ...plan, tokenBudgets: { groq: 1.5 } }, f.admin)).status, 400);
  // Per-key budgets are keyed by credential id, so a slot name can never address one.
  assert.equal((await f.request('PUT', '/api/v1/admin/assistant/settings', { ...plan, keyBudgets: { 'groq#1': 500 } }, f.admin)).status, 400);
  const saved = await f.request('PUT', '/api/v1/admin/assistant/settings', plan, f.admin);
  assert.equal(saved.status, 200);
  const savedBody = await saved.json();
  assert.equal(savedBody.settings.version, 1);
  assert.deepEqual(savedBody.settings.tokenBudgets, { groq: 5_000, gemini: 12_000 });
  assert.deepEqual(savedBody.settings.keyBudgets, plan.keyBudgets);
  assert.deepEqual((await (await f.request('GET', '/api/v1/admin/assistant/settings', undefined, f.admin)).json()).settings.tokenBudgets, { groq: 5_000, gemini: 12_000 });
  // A provider-only save must not silently clear the per-key budgets set from the key tab.
  const { keyBudgets, ...withoutKeyBudgets } = plan;
  assert.equal((await f.request('PUT', '/api/v1/admin/assistant/settings', { ...withoutKeyBudgets, expectedVersion: 1 }, f.admin)).status, 200);
  assert.deepEqual((await (await f.request('GET', '/api/v1/admin/assistant/settings', undefined, f.admin)).json()).settings.keyBudgets, keyBudgets);
  assert.equal((await f.request('PUT', '/api/v1/admin/assistant/settings', plan, f.admin)).status, 409);

  const ask = (message = 'Cách chơi?') => f.request('POST', '/api/v1/assistant/chat', { message }, f.user);
  assert.equal((await (await ask()).json()).answer, 'groq');
  assert.deepEqual(calls, ['groq#1']);
  assert.equal((await (await ask()).json()).answer, 'groq');
  await f.usage.flush();

  const usage = await (await f.request('GET', '/api/v1/admin/assistant/usage?days=7', undefined, f.admin)).json();
  assert.equal(usage.totals.requests, 2);
  assert.equal(usage.totals.cacheHits, 1);
  assert.equal(usage.totals.answered, 1);
  assert.equal(usage.totals.tokensIn, 30);
  assert.equal(usage.totals.tokensOut, 10);
  assert.equal(usage.providers[0].provider, 'groq');
  assert.equal(usage.providers[0].tokensIn, 30);
  assert.equal(usage.providers[0].tokensOut, 10);
  assert.equal(usage.slots.find((slot: any) => slot.slot === 'groq#1').model, 'groq-fast');
  assert.equal(usage.today.day, new Date().toISOString().slice(0, 10));
  assert.deepEqual(usage.today.providers, [{ provider: 'groq', tokensIn: 30, tokensOut: 10 }]);
  // Per-slot rows are what lets each API key card report its own consumption.
  assert.deepEqual(usage.keys.map((row: any) => [row.slot, row.provider, row.requests, row.failures, row.tokensIn, row.tokensOut]),
    [['groq#1', 'groq', 2, 0, 30, 10]]);
  assert.equal(typeof usage.keys[0].avgLatencyMs, 'number');
  assert.deepEqual(usage.today.slots, [{ slot: 'groq#1', provider: 'groq', requests: 2, failures: 0, tokensIn: 30, tokensOut: 10 }]);
  assert.equal((await f.request('GET', '/api/v1/admin/assistant/usage', undefined, f.user)).status, 403);
  const audit = await one(f.db, "SELECT * FROM audit_events WHERE action='ASSISTANT_SETTINGS_UPDATED' AND details_redacted LIKE 'version=1;%'");
  assert.equal(audit.outcome, 'SUCCESS');
  assert.match(audit.details_redacted, /version=1;order=groq,gemini/);
  assert.match(audit.details_redacted, /key_budgets=\{"7a4e5c92-1d3b-4f60-9a11-2c5d8e9f0a1b":1500\}/);
});
