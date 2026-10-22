import { test } from 'node:test';
import assert from 'node:assert/strict';
import { database, initializeLocal, execute, one, scalar, all, now, uuid, transaction } from '../src/db.ts';
import { Payments, checkoutSchema, type Provider } from '../src/payments.ts';
import type { Actor } from '../src/auth.ts';

test('real Turso: simultaneous checkout, duplicate request and duplicate credit remain atomic', { skip: !process.env.TURSO_TEST_URL }, async () => {
  if (!process.env.TURSO_TEST_URL?.startsWith('libsql://') || !process.env.TURSO_TEST_TOKEN) throw new Error('Remote test requires dedicated database credentials');
  if (!process.env.TURSO_TEST_URL.includes('exe-webapp-check-')) throw new Error('Refusing remote writes outside named disposable check database');
  const db = database(process.env.TURSO_TEST_URL, process.env.TURSO_TEST_TOKEN);
  try {
    assert.equal(await scalar(db, "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"), 0, 'Check database must start empty');
    await initializeLocal(db);
    const users = [uuid(), uuid()], category = uuid(), product = uuid(), variant = uuid();
    await db.batch([
      ...users.map(id => ({ sql: "INSERT INTO app_users(id,email,display_name,role) VALUES (?,?,?,'CUSTOMER')", args: [id, id + '@example.test', 'Remote test'] })),
      { sql: "INSERT INTO product_categories(id,slug,name) VALUES (?,'test','Test')", args: [category] },
      { sql: "INSERT INTO products(id,category_id,slug,name,status) VALUES (?,?,'test','Test','ACTIVE')", args: [product, category] },
      { sql: "INSERT INTO product_variants(id,product_id,sku,name,price_amount) VALUES (?,?,'TEST','Test',2000)", args: [variant, product] },
      { sql: 'INSERT INTO inventory_balances(variant_id,on_hand) VALUES (?,1)', args: [variant] },
    ], 'write');
    const clients = users.map(() => database(process.env.TURSO_TEST_URL!, process.env.TURSO_TEST_TOKEN));
    let creates = 0;
    const provider: Provider = { create: async b => { creates++; return { orderCode: b.orderCode, amount: b.amount, currency: 'VND', paymentLinkId: 'test-link', checkoutUrl: 'https://pay.payos.vn/web/test-link', qrCode: 'test', status: 'PENDING' }; }, get: async () => { throw new Error('not called'); }, cancel: async () => { throw new Error('not called'); }, verify: async body => body.data };
    const actor = (id: string): Actor => ({ id, email: id + '@example.test', role: 'CUSTOMER', version: 0, expires: Date.now() / 1000 + 1800 });
    const body = checkoutSchema.parse({ idempotencyKey: uuid().replaceAll('-', ''), items: [{ variantId: variant, quantity: 1 }], recipientName: 'Remote check', recipientPhone: '0901234567', addressLine: 'Disposable test', province: 'Test' });
    const services = clients.map(c => new Payments(c, provider, 'https://example.test'));
    try {
      const results = await Promise.allSettled(services.map((p, i) => p.checkout(actor(users[i]), body)));
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1, 'Exactly one buyer obtains the last item');
      assert.equal(await scalar(db, 'SELECT COUNT(*) FROM orders'), 1); assert.equal((await one(db, 'SELECT * FROM inventory_balances')).reserved, 1);
      const index = results.findIndex(r => r.status === 'fulfilled'), winning = results[index]; if (winning.status !== 'fulfilled') throw new Error('Missing winning checkout');
      const order = winning.value;
      const retried = await Promise.all(services.map(p => p.checkout(actor(users[index]), body))); assert.ok(retried.every(r => r.id === order.id)); assert.equal(creates, 1);
      const attempt = await one(db, 'SELECT * FROM payment_attempts'); const data = { code: '00', currency: 'VND', amount: 2000, orderCode: attempt.provider_order_code, paymentLinkId: 'test-link', reference: 'bank-test-remote' };
      await Promise.all(services.map(p => p.webhook({ data })));
      assert.equal(await scalar(db, 'SELECT COUNT(*) FROM payment_transactions'), 1);
      assert.equal((await one(db, 'SELECT * FROM inventory_balances')).on_hand, 0); assert.equal((await one(db, 'SELECT * FROM inventory_balances')).reserved, 0);
      assert.equal((await one(db, 'SELECT * FROM orders')).payment_status, 'PAID');
      // A failing mutation after a successful earlier write must roll the whole transaction back.
      await assert.rejects(transaction(db, async tx => { await execute(tx, "UPDATE products SET name='must rollback'"); await execute(tx, 'INSERT INTO inventory_balances(variant_id,on_hand) VALUES (?,1)', [uuid()]); }));
      assert.equal((await one(db, 'SELECT name FROM products')).name, 'Test');
      assert.deepEqual(await all(db, 'PRAGMA foreign_key_check'), []);
      console.log('Real remote transactions passed; provider calls are mocks, no real payment was created.');
    } finally { clients.forEach(c => c.close()); }
  } finally { db.close(); }
});
