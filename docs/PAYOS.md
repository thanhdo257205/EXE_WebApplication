> Cập nhật chuyển đổi2026-10-22: backend TypeScript/Turso ở `backend/server/` thay Spring Boot/PostgreSQL. Các đường dẫn API/nghiệp vụ giữ nguyên; chi tiết runtime, giao dịch, OAuth và trạng thái triển khai mới xem [TURSO_MIGRATION.md](TURSO_MIGRATION.md). Các hướng dẫn Java/Aiven bên dưới là lịch sử trước chuyển đổi.

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
| GET | `/api/v1/shop/products` | Public; sản phẩm ACTIVE, biến thể bật, giá VND nguyên và còn hàng (`on_hand - reserved > 0`); `Cache-Control: no-store` |
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
100 units per SKU, 5 pending orders per customer. Flyway V11 seeds exactly one trial product requested by the owner: **Pokémon Hoàng Nam**
(`pokemon-hoang-nam`, SKU `POKEMON-HOANG-NAM-01`, variant `5a1f0c2e-7b1d-4c8a-9a10-000000000003`,
**2,000 VND**, stock 10 with a RECEIVE ledger row). No other catalog, accounts or completed
payments are inserted; change the price/stock by a new migration or admin tooling when real
products exist.

The response contains `id`, order/payment status, integer VND amounts and the
PayOS `checkoutUrl`/`qrCode` when payable. Never discard the idempotency key
after a timeout. Reusing it with different order data returns 409.

## Recovery and stock

1. Persist order, immutable lines, reservations, movement ledger and payment
   attempt in one transaction before calling PayOS. An order lock serializes
   all subsequent payment/stock transitions. Inventory is reserved through
   conditional updates with a stable SKU lock order. Pending orders may hold
   at most 20 units per account and 5 units per variant; a checkout that would
   exceed either cap returns 409 before inventory is touched.
2. Exactly one caller claims initial link creation. Provider timeouts retain
   the orderCode and set UNKNOWN. Repeated checkout requests do not blindly
   create another link. Reconciliation queries the same provider orderCode.
   A provider 404 for an attempt that never got a link is the only available
   proof of absence: the attempt becomes FAILED, the order is cancelled and
   its hold released once. A late signed credit on that cancelled order goes
   to REVIEW. Timeouts and 5xx keep the attempt UNKNOWN for a later sweep.
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
6. Cloudflare cron `*/5 * * * *` calls the backend directly with the existing
   proxy credential, including when Render Free sleeps. Each sweep retries
   up to 20 matched inbox events and queries up to 25 due payment attempts,
   stopping on a 20-second wall-clock budget. Fresh CREATING attempts have a
   2-minute grace period to avoid racing the initial create claim. Customers
   can also request reconciliation; provider calls for the same order have a
   30-second cooldown.
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

Merchant connectivity verified 2026-10-20 using the official Java SDK:
create=PENDING, query=PENDING/amountPaid=0, cancel=CANCELLED/amountPaid=0.
This probe created no application order and transferred no money. The
scheduled request allows 300 seconds for a Render Free cold start plus the
bounded batch, with one idempotent retry and JSON response validation to
reject wake-up/error pages. Both attempts fit within the scheduled handler's
15-minute wall-time limit; ordinary browser requests retain their existing timeout.

Release proof for backend `0cfb553`:
- CI [39303973150](https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/39303973150):
  all 4 jobs passed; 63 backend tests, PostgreSQL 18 and a 512 MB Docker smoke.
- CD [39304413119](https://github.com/thanhdo257205/EXE_WebApplication/actions/runs/39304413119):
  both jobs passed including real deployment and production PayOS guard smoke.
- Pages canonical deployment `08a37e8f-47ea-410c-b669-15bf02e96245`; Render
  deployment `dep-dbb688agjjms73d65rm0` reached live on the same tested SHA.
- Merchant SDK `confirm` accepted the exact public webhook URL and delivered
  a signed registration probe; the inbox contains that verified unmatched
  event, with zero application orders/attempts/money transactions created.
- Internal reconciliation returns 200 with `checked=0`; Cloudflare API reports
  cron `*/30 * * * *`. Actual scheduled execution timing is provider-controlled.
- All 16 service tests also passed against Aiven in an isolated schema; both
  schema-test prefixes were checked clean afterward. Existing public users,
  products and orders remain at zero.
- The final cold-start retry adjustment and documentation update go through
  the same CI/CD pipeline; consult Actions for their newer release SHA.

Official references: [Java SDK](https://github.com/payOSHQ/payos-lib-java),
[Merchant API](https://payos.vn/docs/api/),
[webhook signatures](https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/).

## Storefront (frontend)

- `/cua-hang` lists products from `GET /api/v1/shop/products`; "Mua ngay" opens `/gio-hang?variant=<variantId>`.
- `/gio-hang` requires a signed-in customer (otherwise links to `/dang-nhap?returnUrl=...`). The form collects
  name, phone, address, province and optional note; submit calls `POST /api/v1/checkout` with CSRF and a
  client-generated idempotency key (kept while the form data is unchanged, renewed when it changes). The client
  sends only `variantId` and quantity 1 — never a price.
- The response `qrCode` is the VietQR payload; the browser renders it with the `qrcode` package (lazy chunk) and also
  offers the PayOS `checkoutUrl`. The page polls `GET /api/v1/orders/{id}` every 5 seconds (paused while the tab is
  hidden) and shows success when `paymentStatus` is `PAID`; "Kiểm tra thanh toán" calls `refresh-payment`
  (backend throttles it). The order becomes CONFIRMED only via the signed webhook or reconciliation.

> 2026-10-23: phần thông tin giao hàng ở trang thanh toán nay lấy từ [sổ địa chỉ](ADDRESS_BOOK.md); body `POST /api/v1/checkout` không đổi (vẫn gửi bản chụp tên/SĐT/địa chỉ/tỉnh).
