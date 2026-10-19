# PayOS backend integration

## Configuration

Render `exe-web-backend` holds `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, and
`PAYOS_CHECKSUM_KEY`. Values never enter Angular, Cloudflare variables, GitHub,
logs, or these docs. The backend uses the official `vn.payos:payos-java:2.0.1`
SDK with an 8-second timeout and no automatic create retries.

Public webhook: `https://exe-webapp.pages.dev/api/v1/payments/payos/webhook`.
Register this URL on the **EXE_WebApplication** PayOS channel only after the
backend release is live. Registration sends a signed probe: unmatched events
are durably retained and acknowledged without creating orders or credits.

## API contract

All calls use the Pages origin. Sessions and CSRF remain required for customer
writes. Get `/api/v1/auth/csrf` and send its `headerName`/`token` when posting.

| Method | Path | Access and purpose |
|---|---|---|
| GET | `/api/v1/payments/config` | Public; configuration presence only, not proof of merchant connectivity |
| POST | `/api/v1/checkout` | Signed-in enabled account + CSRF; atomic order/stock reservation and PayOS link |
| GET | `/api/v1/orders` | Current customer's last 50 orders |
| GET | `/api/v1/orders/{uuid}` | Current customer's order; other customers receive 404 |
| POST | `/api/v1/orders/{uuid}/refresh-payment` | Current customer + CSRF; rate-throttled provider reconciliation |
| POST | `/api/v1/payments/payos/webhook` | Exact webhook route; valid SDK-verified signature mandatory |
| GET | `/api/v1/payments/return/{uuid}` | Return page; reads authenticated backend status, ignores URL status/cancel claims |
| POST | `/api/v1/internal/payments/reconcile` | Internal scheduled Worker only; public gateway returns 404 |

Example checkout body (replace variant UUID with an actual enabled SKU):

```json
{
  "idempotencyKey": "generate-once-and-retain-for-retries",
  "items": [{ "variantId": "00000000-0000-0000-0000-000000000001", "quantity": 1 }],
  "recipientName": "Customer name",
  "recipientPhone": "0900000000",
  "addressLine": "Delivery address",
  "province": "Delivery province"
}
```

Prices are read from active catalog rows, never the request. This MVP sets
shipping and discount to zero; real shipping charges/promotions require an
approved server-side policy before enabling them. Maximum 20 distinct SKUs,
100 units per SKU, 5 pending orders per customer. No demo catalog, accounts,
prices or completed payments are inserted into production.

The response contains `id`, order/payment status, integer VND amounts and the
PayOS `checkoutUrl`/`qrCode` when payable. Never discard the idempotency key
after a timeout. Reusing it with different order data returns 409.

## Recovery and stock

1. Persist order, immutable lines, reservations, movement ledger and payment
   attempt in one transaction before calling PayOS. An order lock serializes
   all subsequent payment/stock transitions. Inventory is reserved through
   conditional updates with a stable SKU lock order.
2. Exactly one caller claims initial link creation. Provider timeouts retain
   the orderCode and set UNKNOWN. Repeated checkout requests do not blindly
   create another link. Reconciliation queries the same provider orderCode.
3. Signature verification precedes durable webhook inbox insertion. Only
   signed successful VND credits enter the ledger. Matching transactions are
   deduplicated by attempt + bank reference across webhook and polling.
4. Only exactly paid, pending orders with held stock become CONFIRMED and
   consume inventory once. Overpayment, conflicting reference amounts,
   provider totals mismatches, closed partial payments, or late money on a
   cancelled order go to REVIEW; never automatically resurrect an order.
5. Order/link expiry is 30 minutes. Release stock only after PayOS confirms
   CANCELLED/EXPIRED and both the ledger and provider show zero money. Network
   ambiguity retains the reservation. Inconsistent/ambiguous cases need
   operator review; there is no unsafe automatic release deadline.
6. Cloudflare cron `*/30 * * * *` calls the backend directly with the existing
   proxy credential, including when Render Free sleeps. Each sweep retries
   up to 20 matched inbox events and queries up to 5 due payment attempts.
   Fresh CREATING attempts have a 2-minute grace period to avoid racing the
   initial create claim. Customers can also request reconciliation; provider
   calls for the same order have a 30-second cooldown.
7. Recently paid/cancelled attempts are included in scheduled checks for 7
   days. The batch is bounded; many outstanding orders can take several
   sweeps. Webhooks still account for later transfers beyond that window.

The scheduled handler depends on Worker/Render/Aiven availability; it is
eventual recovery, not an immediate availability guarantee. Inspect provider
and Worker errors when a payment remains pending. Unmatched signed inbox
events are retained without fulfillment. Refunds remain a manual workflow;
this integration neither sends money nor automatically refunds it.

## Security boundaries

Only the exact POST webhook route bypasses browser metadata and CSRF.
Gateway body limit is 16 KiB; API rate limiting and the proxy secret remain.
Webhook cookies and CSRF headers are stripped. An unsigned body receives 400,
and direct Render calls without the proxy credential receive 403. Ordinary
checkout keeps session authentication, CSRF and origin rules. Public requests
cannot reach the internal reconciliation endpoint.

The return page displays status using the authenticated order API. Provider
query parameters never mark an order paid. The page has no customer data in
its HTML and uses a restricted CSP and no-referrer policy.

## Validation and release

- `mvn verify`: H2 payment service scenarios, HTTP security, official SDK
  signature/tampering tests, existing auth tests and schema contracts.
- When `SCHEMA_TEST_JDBC_URL/USERNAME/PASSWORD` are supplied, the same payment
  service scenarios run in an isolated disposable PostgreSQL schema.
- CI supplies PostgreSQL 18; no real PayOS keys are needed in tests.
- Production CD checks configured credentials, unsigned webhook rejection,
  authenticated order access, hidden internal route, backend SHA and DB health.
- After deploy, register/confirm the merchant webhook and verify a real
  create → query → cancel probe without transferring money.
- A customer-initiated bank transfer and actual webhook delivery must still
  be tested before declaring the entire purchase flow ready for customers.

Angular catalog/cart/checkout UI, customer registration/login UI, catalog
administration, fulfillment administration and refund execution are separate
unfinished work. Backend integration does not make these storefront screens
available automatically.

Official references: [Java SDK](https://github.com/payOSHQ/payos-lib-java),
[Merchant API](https://payos.vn/docs/api/),
[webhook signatures](https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/).
