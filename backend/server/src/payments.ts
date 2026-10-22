import { z } from 'zod';
import type { Client, Transaction, InStatement } from '@libsql/client';
import { PayOS } from '@payos/node';
import { readFileSync } from 'node:fs';
import { all, one, scalar, execute, transaction, batchRead, uuid, now, at, fail, type Executor, type Row } from './db.ts';
import { authorize, requireActor, digest, type Api, type Actor } from './auth.ts';

export interface Provider {
  create(request: any): Promise<any>; get(code: number): Promise<any>; cancel(code: number): Promise<any>; verify(body: any): Promise<any>;
}
export function payosProvider(env: NodeJS.ProcessEnv): Provider | null {
  if (!env.PAYOS_CLIENT_ID || !env.PAYOS_API_KEY || !env.PAYOS_CHECKSUM_KEY) return null;
  const client = new PayOS({ clientId: env.PAYOS_CLIENT_ID, apiKey: env.PAYOS_API_KEY, checksumKey: env.PAYOS_CHECKSUM_KEY, timeout: 8000, maxRetries: 0 });
  return { create: body => client.paymentRequests.create(body), get: code => client.paymentRequests.get(code), cancel: code => client.paymentRequests.cancel(code, 'Order expired'), verify: body => client.webhooks.verify(body) };
}
const nonblank = (max: number) => z.string().max(max).refine(v => v.trim().length > 0);
export const checkoutSchema = z.object({
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,100}$/), items: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(100) })).min(1).max(20),
  recipientName: nonblank(120), recipientPhone: z.string().regex(/^[+0-9 ()-]{8,32}$/), addressLine: nonblank(500), province: nonblank(120), note: z.string().max(1000).nullable().optional().default(null),
});
const placeholders = (n: number) => Array(n).fill('?').join(',');
function checkoutFingerprint(body: z.infer<typeof checkoutSchema>) {
  // Preserve the Java fingerprint format so retries of existing orders retain their meaning.
  const lines = [...body.items].sort((a, b) => a.variantId.localeCompare(b.variantId));
  let value = '[' + lines.map(l => `Line[variantId=${l.variantId}, quantity=${l.quantity}]`).join(', ') + ']';
  for (const part of [body.recipientName, body.recipientPhone, body.addressLine, body.province, body.note || '']) value += `|${part.length}:${part}`;
  return digest(value);
}
const conflict = (message: string): never => fail(409, 'PAYMENT_CONFLICT', message);
const paymentUrl = (url: string) => { try { const u = new URL(url); if (u.protocol === 'https:' && u.hostname === 'pay.payos.vn' && !u.username && !u.password) return url; } catch {} return conflict('Unexpected payment URL'); };
const validMoney = (amount: unknown): amount is number => typeof amount === 'number' && Number.isSafeInteger(amount) && amount > 0 && amount <= 1e12;
const validLink = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9-]{1,100}$/.test(id);

export class Payments {
  db: Client; provider: Provider | null; origin: string;
  constructor(db: Client, provider: Provider | null, origin: string) { this.db = db; this.provider = provider; this.origin = origin; }
  private attempt(db: Executor, order: string) { return one(db, 'SELECT * FROM payment_attempts WHERE order_id=? ORDER BY created_at DESC LIMIT 1', [order]); }
  private event(db: Executor, order: string, type: string, state: string) {
    return execute(db, 'INSERT INTO order_events(id,order_id,event_type,new_status,operation_key) VALUES (?,?,?,?,?)', [uuid(), order, type, state, `${type}:${order}`]);
  }
  private movement(db: Executor, item: Row, type: string, onHand: number, reserved: number) {
    return execute(db, 'INSERT INTO inventory_movements(id,variant_id,order_item_id,operation_key,movement_type,on_hand_delta,reserved_delta) VALUES (?,?,?,?,?,?,?)', [uuid(), item.variant_id, item.id, `${type}:${item.id}`, type, onHand, reserved]);
  }
  private async review(db: Executor, order: string, reason: string) {
    await execute(db, "UPDATE orders SET payment_status='REVIEW',updated_at=? WHERE id=?", [now(), order]);
    await execute(db, "INSERT INTO order_events(id,order_id,event_type,note,operation_key) VALUES (?,?,'PAYMENT_REVIEW',?,?) ON CONFLICT(operation_key) DO NOTHING", [uuid(), order, reason, `REVIEW:${order}:${reason}`]);
  }
  async view(order: string, user: string) {
    return transaction(this.db, async tx => {
      const row = await one(tx, 'SELECT * FROM orders WHERE id=? AND user_id=?', [order, user]); const p = await this.attempt(tx, order);
      const payable = ['PENDING', 'PARTIALLY_PAID'].includes(p.status) && p.expires_at > now() && row.status === 'PENDING_PAYMENT' && row.payment_status !== 'REVIEW';
      return { id: order, number: row.order_number, status: row.status, paymentStatus: row.payment_status, total: p.amount_requested, received: p.amount_received, paymentState: p.status, checkoutUrl: payable ? p.checkout_url : null, qrCode: payable ? p.qr_code : null };
    }, 'read');
  }
  async checkout(actor: Actor, body: z.infer<typeof checkoutSchema>) {
    if (!this.provider) return fail(503, 'PAYMENTS_UNAVAILABLE');
    const lines = [...body.items].sort((a, b) => a.variantId.localeCompare(b.variantId));
    if (new Set(lines.map(l => l.variantId)).size !== lines.length) return conflict('Duplicate item');
    const fingerprint = checkoutFingerprint(body);
    const order = await transaction(this.db, async tx => {
      const user = await authorize(tx, actor);
      const previous = (await all(tx, 'SELECT id,checkout_fingerprint FROM orders WHERE user_id=? AND checkout_key=?', [actor.id, body.idempotencyKey]))[0];
      if (previous) { if (previous.checkout_fingerprint !== fingerprint) return conflict('Idempotency key already used with another request'); return previous.id as string; }
      if (await scalar(tx, "SELECT COUNT(*) FROM orders WHERE user_id=? AND status='PENDING_PAYMENT'", [actor.id]) >= 5) return conflict('Too many pending orders');
      const variants = await all(tx, `SELECT v.*,p.name AS product_name FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id IN (${placeholders(lines.length)}) AND v.enabled=1 AND p.status='ACTIVE'`, lines.map(l => l.variantId));
      const byId = new Map(variants.map(v => [v.id, v])); let total = 0;
      for (const line of lines) { const v = byId.get(line.variantId); if (!v) return conflict('Product is unavailable'); total += Number(v.price_amount) * line.quantity; }
      if (!validMoney(total)) return conflict('Invalid order total');
      const id = uuid(), expiry = at(Date.now() + 1800000);
      await execute(tx, `INSERT INTO orders(id,order_number,user_id,checkout_key,checkout_fingerprint,subtotal_amount,total_amount,buyer_email,recipient_name,recipient_phone,shipping_address_line,shipping_province,customer_note,expires_at) VALUES (${placeholders(14)})`, [id, `EXE-${id.replaceAll('-', '').toUpperCase()}`, actor.id, body.idempotencyKey, fingerprint, total, total, user.email, body.recipientName, body.recipientPhone, body.addressLine, body.province, body.note, expiry]);
      const statements: InStatement[] = [];
      for (const line of lines) {
        const v = byId.get(line.variantId)!, item = uuid();
        statements.push({ sql: 'INSERT INTO order_items(id,order_id,variant_id,sku_snapshot,product_name_snapshot,variant_name_snapshot,quantity,unit_price_amount,line_total_amount) VALUES (?,?,?,?,?,?,?,?,?)', args: [item, id, line.variantId, v.sku, v.product_name, v.name, line.quantity, v.price_amount, v.price_amount * line.quantity] });
        statements.push({ sql: 'UPDATE inventory_balances SET reserved=reserved+?,version=version+1,updated_at=? WHERE variant_id=? AND on_hand-reserved>=?', args: [line.quantity, now(), line.variantId, line.quantity] });
        statements.push({ sql: 'INSERT INTO inventory_reservations(order_item_id,expires_at) VALUES (?,?)', args: [item, expiry] });
        statements.push({ sql: 'INSERT INTO inventory_movements(id,variant_id,order_item_id,operation_key,movement_type,on_hand_delta,reserved_delta) VALUES (?,?,?,?,?,?,?)', args: [uuid(), line.variantId, item, `RESERVE:${item}`, 'RESERVE', 0, line.quantity] });
      }
      const results = await tx.batch(statements);
      for (let i = 1; i < results.length; i += 4) if (results[i].rowsAffected !== 1) return conflict('Insufficient inventory');
      const code = await one(tx, "UPDATE app_sequences SET value=value+1 WHERE name='payos_order_code' RETURNING value");
      if (!Number.isSafeInteger(code.value) || code.value > 9007199254740991) return conflict('Payment code limit reached');
      await execute(tx, 'INSERT INTO payment_attempts(id,order_id,request_key,request_fingerprint,description,amount_requested,expires_at,provider_order_code) VALUES (?,?,?,?,?,?,?,?)', [uuid(), id, id, fingerprint, 'EXE' + id.slice(0, 6).toUpperCase(), total, expiry, code.value]);
      await this.event(tx, id, 'CHECKOUT_CREATED', 'PENDING_PAYMENT'); return id;
    });
    const claimed = await execute(this.db, "UPDATE payment_attempts SET last_reconciled_at=? WHERE order_id=? AND status='CREATING' AND last_reconciled_at IS NULL", [now(), order]);
    if (claimed.rowsAffected) {
      const p = await this.attempt(this.db, order);
      try {
        const link = await this.provider.create({ orderCode: p.provider_order_code, amount: p.amount_requested, description: p.description, returnUrl: `${this.origin}/api/v1/payments/return/${order}`, cancelUrl: `${this.origin}/api/v1/payments/return/${order}?cancelled=true`, expiredAt: Math.floor(Date.parse(p.expires_at) / 1000) });
        if (link.orderCode !== p.provider_order_code || link.amount !== p.amount_requested || link.currency !== 'VND' || !validLink(link.paymentLinkId)) return conflict('Provider payment identity mismatch');
        paymentUrl(link.checkoutUrl);
        await transaction(this.db, async tx => {
          const current = await this.attempt(tx, order);
          if (current.provider_payment_link_id && current.provider_payment_link_id !== link.paymentLinkId) return conflict('Provider link mismatch');
          await execute(tx, "UPDATE payment_attempts SET provider_payment_link_id=?,checkout_url=?,qr_code=?,status=CASE WHEN status IN ('CREATING','UNKNOWN') THEN 'PENDING' ELSE status END,provider_status=?,updated_at=? WHERE id=?", [link.paymentLinkId, link.checkoutUrl, link.qrCode, link.status, now(), p.id]);
        });
      } catch { await execute(this.db, "UPDATE payment_attempts SET status='UNKNOWN',failure_code='PROVIDER_UNAVAILABLE' WHERE order_id=? AND status='CREATING'", [order]); }
    }
    return this.view(order, actor.id);
  }
  private async ledger(tx: Executor, p: Row, event: string | null, reference: string, amount: number, source: string, time?: string) {
    if (!validMoney(amount) || typeof reference !== 'string' || !reference.trim() || reference.length > 128) return conflict('Invalid provider transaction');
    const existing = (await all(tx, 'SELECT amount FROM payment_transactions WHERE payment_attempt_id=? AND provider_reference=?', [p.id, reference]))[0];
    if (existing) { if (existing.amount !== amount) await this.review(tx, p.order_id, 'REFERENCE_AMOUNT_MISMATCH'); return; }
    let occurred = now();
    if (time) { const timestamp = Date.parse(/[Zz]|[+-]\d\d:\d\d$/.test(time) ? time : time.replace(' ', 'T') + '+07:00'); if (Number.isFinite(timestamp)) occurred = at(timestamp); }
    await execute(tx, 'INSERT INTO payment_transactions(id,payment_attempt_id,source_event_id,provider_reference,amount,source,occurred_at) VALUES (?,?,?,?,?,?,?)', [uuid(), p.id, event, reference, amount, source, occurred]);
  }
  private async settle(tx: Executor, order: Row, p: Row) {
    const amount = await scalar(tx, 'SELECT COALESCE(SUM(amount),0) FROM payment_transactions WHERE payment_attempt_id=?', [p.id]);
    const state = amount >= p.amount_requested ? 'PAID' : amount > 0 ? 'PARTIALLY_PAID' : 'PENDING';
    if (!amount && ['CANCELLED', 'EXPIRED', 'FAILED'].includes(p.status)) return;
    await execute(tx, 'UPDATE payment_attempts SET amount_received=?,status=?,active_slot=?,paid_at=?,updated_at=?,version=version+1 WHERE id=?', [amount, state, state === 'PAID' ? null : 1, state === 'PAID' ? now() : null, now(), p.id]);
    const current = await one(tx, 'SELECT payment_status FROM orders WHERE id=?', [order.id]);
    if (current.payment_status === 'REVIEW') return;
    if (amount > p.amount_requested || (amount > 0 && order.status === 'CANCELLED')) { await this.review(tx, order.id, 'UNEXPECTED_PAYMENT_AMOUNT_OR_CLOSED_ORDER'); return; }
    if (amount === p.amount_requested && order.status === 'PENDING_PAYMENT') {
      if (await scalar(tx, "SELECT COUNT(*) FROM inventory_reservations r JOIN order_items i ON i.id=r.order_item_id WHERE i.order_id=? AND r.status<>'HELD'", [order.id])) { await this.review(tx, order.id, 'RESERVATION_NOT_HELD'); return; }
      const items = await all(tx, 'SELECT * FROM order_items WHERE order_id=? ORDER BY variant_id', [order.id]);
      for (const item of items) {
        const q = Number(item.quantity);
        if ((await execute(tx, 'UPDATE inventory_balances SET on_hand=on_hand-?,reserved=reserved-?,version=version+1 WHERE variant_id=? AND reserved>=? AND on_hand>=?', [q, q, item.variant_id, q, q])).rowsAffected !== 1) return conflict('Inventory invariant violated');
        if ((await execute(tx, "UPDATE inventory_reservations SET status='CONSUMED',closed_at=? WHERE order_item_id=? AND status='HELD'", [now(), item.id])).rowsAffected !== 1) return conflict('Reservation invariant violated');
        await this.movement(tx, item, 'SALE', -q, -q);
      }
      await execute(tx, "UPDATE orders SET status='CONFIRMED',payment_status='PAID',paid_at=?,updated_at=?,version=version+1 WHERE id=?", [now(), now(), order.id]); await this.event(tx, order.id, 'PAYMENT_CONFIRMED', 'CONFIRMED');
    } else if (order.status === 'PENDING_PAYMENT') await execute(tx, 'UPDATE orders SET payment_status=?,updated_at=? WHERE id=?', [amount > 0 ? 'PARTIALLY_PAID' : 'UNPAID', now(), order.id]);
  }
  async webhook(body: unknown) {
    if (!this.provider) return fail(503, 'PAYMENTS_UNAVAILABLE');
    let data: any; try { data = await this.provider.verify(body); } catch { return fail(400, 'INVALID_PAYMENT_SIGNATURE'); }
    if (data.code !== '00') return;
    if (!validMoney(data.amount) || data.currency !== 'VND' || !Number.isSafeInteger(data.orderCode) || data.orderCode < 1 || !validLink(data.paymentLinkId) || typeof data.reference !== 'string' || !data.reference.trim() || data.reference.length > 128) return fail(400, 'INVALID_PAYMENT_EVENT');
    const key = digest(`${data.orderCode}|${data.paymentLinkId}|${data.reference}|${data.amount}|${data.currency}|${data.code}`);
    await execute(this.db, `INSERT INTO payment_webhook_events(id,event_key,provider_order_code,payment_link_id,provider_reference,amount,currency,provider_code,signature_verified) VALUES (?,?,?,?,?,?,?,?,1)
      ON CONFLICT(event_key) DO UPDATE SET delivery_count=delivery_count+1,last_received_at=excluded.received_at`, [uuid(), key, data.orderCode, data.paymentLinkId, data.reference, data.amount, data.currency, data.code]);
    const event = await one(this.db, 'SELECT id FROM payment_webhook_events WHERE event_key=?', [key]); await this.process(event.id);
  }
  async process(event: string) {
    await transaction(this.db, async tx => {
      const e = await one(tx, 'SELECT * FROM payment_webhook_events WHERE id=?', [event]); if (e.status === 'PROCESSED' || e.status === 'FAILED') return;
      const p = (await all(tx, 'SELECT * FROM payment_attempts WHERE provider_order_code=?', [e.provider_order_code]))[0];
      if (!p) { await execute(tx, "UPDATE payment_webhook_events SET status='RETRY',error_code='UNMATCHED_ORDER',processing_attempts=processing_attempts+1 WHERE id=?", [event]); return; }
      const order = await one(tx, 'SELECT * FROM orders WHERE id=?', [p.order_id]);
      if (p.provider_payment_link_id && p.provider_payment_link_id !== e.payment_link_id) {
        await execute(tx, "UPDATE payment_webhook_events SET status='FAILED',error_code='LINK_MISMATCH' WHERE id=?", [event]); await this.review(tx, p.order_id, 'LINK_MISMATCH'); return;
      }
      await execute(tx, 'UPDATE payment_attempts SET provider_payment_link_id=? WHERE id=?', [e.payment_link_id, p.id]);
      await execute(tx, 'UPDATE payment_webhook_events SET payment_attempt_id=? WHERE id=?', [p.id, event]);
      await this.ledger(tx, p, event, e.provider_reference, e.amount, 'WEBHOOK'); await this.settle(tx, order, p);
      await execute(tx, "UPDATE payment_webhook_events SET status='PROCESSED',processed_at=?,processing_attempts=processing_attempts+1,error_code=NULL WHERE id=?", [now(), event]);
    });
  }
  private async closeStock(tx: Executor, order: string) {
    for (const item of await all(tx, 'SELECT * FROM order_items WHERE order_id=? ORDER BY variant_id', [order])) {
      if ((await execute(tx, "UPDATE inventory_reservations SET status='RELEASED',closed_at=? WHERE order_item_id=? AND status='HELD'", [now(), item.id])).rowsAffected) {
        if ((await execute(tx, 'UPDATE inventory_balances SET reserved=reserved-?,version=version+1 WHERE variant_id=? AND reserved>=?', [item.quantity, item.variant_id, item.quantity])).rowsAffected !== 1) return conflict('Inventory invariant violated');
        await this.movement(tx, item, 'RELEASE', 0, -Number(item.quantity));
      }
    }
  }
  private async reconciled(original: Row, link: any) {
    await transaction(this.db, async tx => {
      const p = await this.attempt(tx, original.order_id), order = await one(tx, 'SELECT * FROM orders WHERE id=?', [p.order_id]);
      if (link.orderCode !== p.provider_order_code || link.amount !== p.amount_requested || !validLink(link.id) || (p.provider_payment_link_id && p.provider_payment_link_id !== link.id) || !Number.isSafeInteger(link.amountPaid) || link.amountPaid < 0 || !Array.isArray(link.transactions)) return conflict('Provider identity mismatch');
      await execute(tx, 'UPDATE payment_attempts SET provider_payment_link_id=?,provider_status=?,checkout_url=COALESCE(checkout_url,?) WHERE id=?', [link.id, link.status, `https://pay.payos.vn/web/${link.id}`, p.id]);
      for (const transfer of link.transactions) if (transfer.amount > 0) await this.ledger(tx, p, null, transfer.reference, transfer.amount, 'RECONCILIATION', transfer.transactionDateTime);
      const received = await scalar(tx, 'SELECT COALESCE(SUM(amount),0) FROM payment_transactions WHERE payment_attempt_id=?', [p.id]);
      if (received !== link.amountPaid) await this.review(tx, p.order_id, 'PROVIDER_LEDGER_MISMATCH');
      if ((link.status === 'PAID' && received < p.amount_requested) || (['CANCELLED', 'EXPIRED'].includes(link.status) && received > 0 && received < p.amount_requested)) await this.review(tx, p.order_id, 'CLOSED_OR_INCONSISTENT_PROVIDER_PAYMENT');
      await this.settle(tx, order, p);
      if (['CANCELLED', 'EXPIRED'].includes(link.status) && received === 0 && link.amountPaid === 0 && order.status === 'PENDING_PAYMENT' && (await one(tx, 'SELECT payment_status FROM orders WHERE id=?', [p.order_id])).payment_status !== 'REVIEW') {
        await this.closeStock(tx, p.order_id);
        await execute(tx, 'UPDATE payment_attempts SET status=?,active_slot=NULL,cancelled_at=? WHERE id=?', [link.status, now(), p.id]);
        await execute(tx, "UPDATE orders SET status='CANCELLED',cancelled_at=?,updated_at=? WHERE id=?", [now(), now(), p.order_id]); await this.event(tx, p.order_id, 'PAYMENT_CLOSED', 'CANCELLED');
      }
    });
  }
  async reconcile(order: string) {
    if (!this.provider) return;
    const claimed = await execute(this.db, "UPDATE payment_attempts SET last_reconciled_at=? WHERE order_id=? AND (status<>'CREATING' OR created_at<?) AND (last_reconciled_at IS NULL OR last_reconciled_at<?)", [now(), order, at(Date.now() - 120000), at(Date.now() - 30000)]);
    if (!claimed.rowsAffected) return;
    const p = await this.attempt(this.db, order);
    try {
      const link = await this.provider.get(p.provider_order_code); await this.reconciled(p, link);
      if (p.expires_at < now() && link.amountPaid === 0 && link.status === 'PENDING') await this.reconciled(p, await this.provider.cancel(p.provider_order_code));
    } catch {
      await execute(this.db, "UPDATE payment_attempts SET status='UNKNOWN',failure_code='PROVIDER_UNAVAILABLE' WHERE order_id=? AND status='CREATING'", [order]);
      console.warn('Payment reconciliation deferred');
    }
  }
  async sweep() {
    if (!this.provider) return fail(503, 'PAYMENTS_UNAVAILABLE');
    const events = await all(this.db, "SELECT e.id FROM payment_webhook_events e JOIN payment_attempts p ON p.provider_order_code=e.provider_order_code WHERE e.status IN ('RECEIVED','RETRY') ORDER BY e.received_at LIMIT 20");
    for (const event of events) await this.process(event.id).catch(() => console.warn('Payment inbox retry deferred'));
    const due = await all(this.db, "SELECT order_id FROM payment_attempts WHERE (active_slot=1 OR (status IN ('CANCELLED','EXPIRED','PAID') AND created_at>?)) AND (status<>'CREATING' OR created_at<?) AND (last_reconciled_at IS NULL OR last_reconciled_at<?) ORDER BY last_reconciled_at NULLS FIRST,created_at LIMIT 5", [at(Date.now() - 7 * 86400000), at(Date.now() - 120000), at(Date.now() - 60000)]);
    for (const p of due) await this.reconcile(p.order_id); return due.length;
  }
}

export function paymentRoutes(app: Api, db: Client, payments: Payments) {
  // Price/availability change with orders: no cache, but both reads share one Turso round trip.
  app.get('/api/v1/shop/products', async c => {
    const [rows, variants] = await batchRead(db, [
      { sql: "SELECT p.id,p.slug,p.name,p.description_markdown,(SELECT image_url FROM product_images WHERE product_id=p.id ORDER BY sort_order LIMIT 1) AS image_url FROM products p WHERE p.status='ACTIVE' ORDER BY p.created_at,p.slug" },
      { sql: 'SELECT v.*,COALESCE(b.on_hand-b.reserved,0)>0 AS available FROM product_variants v LEFT JOIN inventory_balances b ON b.variant_id=v.id WHERE v.enabled=1 ORDER BY v.price_amount,v.sku' },
    ]);
    return c.json(rows.map(p => ({ id: p.id, slug: p.slug, name: p.name, description: p.description_markdown, imageUrl: p.image_url, variants: variants.filter(v => v.product_id === p.id).map(v => ({ id: v.id, sku: v.sku, name: v.name, priceAmount: v.price_amount, available: Boolean(v.available) })) })).filter(p => p.variants.length));
  });
  app.get('/api/v1/payments/config', c => c.json({ provider: 'PAYOS', enabled: Boolean(payments.provider) }));
  app.post('/api/v1/checkout', async c => c.json(await payments.checkout(requireActor(c), checkoutSchema.parse(await c.req.json()))));
  app.get('/api/v1/orders', async c => {
    const actor = requireActor(c), rows = await all(db, 'SELECT id FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 50', [actor.id]); const results = [];
    for (const row of rows) results.push(await payments.view(row.id, actor.id)); return c.json(results);
  });
  app.get('/api/v1/orders/:id', async c => c.json(await payments.view(z.string().uuid().parse(c.req.param('id')), requireActor(c).id)));
  app.post('/api/v1/orders/:id/refresh-payment', async c => { const actor = requireActor(c), id = z.string().uuid().parse(c.req.param('id')); await payments.view(id, actor.id); await payments.reconcile(id); return c.json(await payments.view(id, actor.id)); });
  app.post('/api/v1/payments/payos/webhook', async c => { await payments.webhook(await c.req.json()); return c.json({ received: true }); });
  app.post('/api/v1/internal/payments/reconcile', async c => c.json({ checked: await payments.sweep() }));
  app.get('/api/v1/payments/return/:id', c => {
    const id = z.string().uuid().parse(c.req.param('id'));
    c.header('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"); c.header('Referrer-Policy', 'no-referrer');
    return c.html(readFileSync(new URL('./payment-return.html', import.meta.url), 'utf8').replaceAll('ORDER_UUID', id));
  });
}
