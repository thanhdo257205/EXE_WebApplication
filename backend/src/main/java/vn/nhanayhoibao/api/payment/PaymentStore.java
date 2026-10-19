package vn.nhanayhoibao.api.payment;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import vn.payos.model.v2.paymentRequests.*;
import vn.payos.model.webhooks.WebhookData;

/** All transitions for one order acquire the order lock before touching its payment or stock. */
@Repository
public class PaymentStore {
    private final JdbcTemplate db;
    private final TransactionTemplate tx;
    public PaymentStore(JdbcTemplate db, org.springframework.transaction.PlatformTransactionManager manager) {
        this.db = db;
        this.tx = new TransactionTemplate(manager);
    }
    static ResponseStatusException conflict(String reason) { return new ResponseStatusException(HttpStatus.CONFLICT, reason); }
    public static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    public record Attempt(UUID id, UUID orderId, long code, long amount, String linkId,
        String url, String qr, String status, Instant expiry) {}
    public record OrderView(UUID id, String number, String status, String paymentStatus,
        long total, long received, String paymentState, String checkoutUrl, String qrCode) {}
    private Attempt attempt(Map<String,Object> r) {
        return new Attempt((UUID) r.get("id"), (UUID) r.get("order_id"), ((Number) r.get("provider_order_code")).longValue(),
            ((Number) r.get("amount_requested")).longValue(), (String) r.get("provider_payment_link_id"),
            (String) r.get("checkout_url"), (String) r.get("qr_code"), (String) r.get("status"), instant(r.get("expires_at")));
    }
    private static Instant instant(Object value) {
        if (value instanceof OffsetDateTime d) return d.toInstant();
        if (value instanceof Timestamp d) return d.toInstant();
        throw new IllegalStateException("Unsupported timestamp");
    }
    public Attempt byOrder(UUID order) {
        return attempt(db.queryForMap("SELECT * FROM payment_attempts WHERE order_id=? ORDER BY created_at DESC LIMIT 1", order));
    }
    private Map<String,Object> lock(UUID order) { return db.queryForMap("SELECT * FROM orders WHERE id=? FOR UPDATE", order); }
    public UUID checkout(UUID user, String email, CheckoutRequest request) {
        // Sort lines so retry fingerprints and inventory lock order are independent of client ordering.
        var lines = request.items().stream().sorted(Comparator.comparing(l -> l.variantId().toString())).toList();
        if (lines.stream().map(CheckoutRequest.Line::variantId).distinct().count() != lines.size()) throw conflict("Duplicate item");
        StringBuilder canonical=new StringBuilder(lines.toString());
        for(String value:List.of(request.recipientName(),request.recipientPhone(),request.addressLine(),
                request.province(),Objects.toString(request.note(),""))) canonical.append('|').append(value.length()).append(':').append(value);
        String fingerprint = hash(canonical.toString());
        return tx.execute(s -> {
            db.queryForMap("SELECT id FROM app_users WHERE id=? FOR UPDATE", user);
            var existing = db.queryForList("SELECT id,checkout_fingerprint FROM orders WHERE user_id=? AND checkout_key=?", user, request.idempotencyKey());
            if (!existing.isEmpty()) {
                if (!fingerprint.equals(existing.getFirst().get("checkout_fingerprint"))) throw conflict("Idempotency key already used with another request");
                return (UUID) existing.getFirst().get("id");
            }
            if (db.queryForObject("SELECT COUNT(*) FROM orders WHERE user_id=? AND status='PENDING_PAYMENT'", Long.class, user) >= 5)
                throw conflict("Too many pending orders");
            UUID order = UUID.randomUUID();
            Instant expires = Instant.now().plusSeconds(1800);
            long total = 0;
            var rows = new ArrayList<Map<String,Object>>();
            for (var line : lines) {
                var found = db.queryForList("""
                    SELECT v.*,p.name AS product_name FROM product_variants v JOIN products p ON p.id=v.product_id
                    WHERE v.id=? AND v.enabled=TRUE AND p.status='ACTIVE'
                    """, line.variantId());
                if (found.isEmpty()) throw conflict("Product is unavailable");
                var row = found.getFirst(); rows.add(row);
                total = Math.addExact(total, Math.multiplyExact(((Number)row.get("price_amount")).longValue(), line.quantity()));
            }
            if (total < 1 || total > 1000000000000L) throw conflict("Invalid order total");
            db.update("""
                INSERT INTO orders(id,order_number,user_id,checkout_key,checkout_fingerprint,subtotal_amount,total_amount,
                buyer_email,recipient_name,recipient_phone,shipping_address_line,shipping_province,customer_note,expires_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, order, "EXE-"+order.toString().replace("-", "").toUpperCase(Locale.ROOT), user, request.idempotencyKey(), fingerprint,
                total, total, email, request.recipientName(), request.recipientPhone(), request.addressLine(), request.province(), request.note(), Timestamp.from(expires));
            for (int i=0;i<lines.size();i++) {
                var line=lines.get(i); var row=rows.get(i); UUID item=UUID.randomUUID();
                long price=((Number)row.get("price_amount")).longValue();
                db.update("""
                    INSERT INTO order_items(id,order_id,variant_id,sku_snapshot,product_name_snapshot,variant_name_snapshot,quantity,unit_price_amount,line_total_amount)
                    VALUES (?,?,?,?,?,?,?,?,?)
                    """, item, order, line.variantId(), row.get("sku"), row.get("product_name"), row.get("name"), line.quantity(), price, price*line.quantity());
                if (db.update("""
                    UPDATE inventory_balances SET reserved=reserved+?,version=version+1,updated_at=CURRENT_TIMESTAMP
                    WHERE variant_id=? AND on_hand-reserved>=?
                    """, line.quantity(), line.variantId(), line.quantity()) != 1) throw conflict("Insufficient inventory");
                db.update("INSERT INTO inventory_reservations(order_item_id,expires_at) VALUES (?,?)", item, Timestamp.from(expires));
                movement(item, line.variantId(), "RESERVE", 0, line.quantity());
            }
            db.update("""
                INSERT INTO payment_attempts(id,order_id,request_key,request_fingerprint,description,amount_requested,expires_at)
                VALUES (?,?,?,?,?,?,?)
                """, UUID.randomUUID(), order, order.toString(), fingerprint, "EXE"+order.toString().substring(0,6).toUpperCase(Locale.ROOT), total, Timestamp.from(expires));
            event(order, "CHECKOUT_CREATED", "PENDING_PAYMENT");
            return order;
        });
    }
    public boolean claimCreate(UUID order) {
        return tx.execute(s -> {
            lock(order);
            return db.update("""
                UPDATE payment_attempts SET last_reconciled_at=CURRENT_TIMESTAMP
                WHERE order_id=? AND status='CREATING' AND last_reconciled_at IS NULL
                """, order) == 1;
        });
    }
    public void created(Attempt original, CreatePaymentLinkResponse link) {
        if (!Objects.equals(link.getOrderCode(), original.code()) || !Objects.equals(link.getAmount(), original.amount())
                || !"VND".equals(link.getCurrency())) throw conflict("Provider payment identity mismatch");
        validateUrl(link.getCheckoutUrl());
        tx.executeWithoutResult(s -> {
            lock(original.orderId());
            var current=byOrder(original.orderId());
            if (current.linkId()!=null && !current.linkId().equals(link.getPaymentLinkId())) throw conflict("Provider link mismatch");
            db.update("""
                UPDATE payment_attempts SET provider_payment_link_id=?,checkout_url=?,qr_code=?,
                status=CASE WHEN status IN ('CREATING','UNKNOWN') THEN 'PENDING' ELSE status END,
                provider_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?
                """, link.getPaymentLinkId(), link.getCheckoutUrl(), link.getQrCode(), link.getStatus().name(), original.id());
        });
    }
    static void validateUrl(String url) {
        var uri=java.net.URI.create(url);
        if (!"https".equals(uri.getScheme()) || !"pay.payos.vn".equals(uri.getHost()) || uri.getUserInfo()!=null)
            throw conflict("Unexpected payment URL");
    }
    public void unknown(UUID order) {
        tx.executeWithoutResult(s -> {
            lock(order);
            db.update("UPDATE payment_attempts SET status='UNKNOWN',failure_code='PROVIDER_UNAVAILABLE' WHERE order_id=? AND status='CREATING'", order);
        });
    }
    public OrderView view(UUID order, UUID user) {
        var rows=db.queryForList("SELECT * FROM orders WHERE id=? AND user_id=?", order, user);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        var r=rows.getFirst(); var p=byOrder(order);
        long received=db.queryForObject("SELECT amount_received FROM payment_attempts WHERE id=?", Long.class, p.id());
        boolean payable=Set.of("PENDING","PARTIALLY_PAID").contains(p.status()) && p.expiry().isAfter(Instant.now())
            && "PENDING_PAYMENT".equals(r.get("status")) && !"REVIEW".equals(r.get("payment_status"));
        return new OrderView(order, (String)r.get("order_number"), (String)r.get("status"), (String)r.get("payment_status"),
            p.amount(), received, p.status(), payable ? p.url() : null, payable ? p.qr() : null);
    }
    public List<UUID> userOrders(UUID user) {
        return db.query("SELECT id FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 50", (r,n)->r.getObject(1,UUID.class), user);
    }
    public List<UUID> due() {
        // Include recently closed attempts so delayed transfers after cancellation are still accounted for.
        return db.query("""
            SELECT order_id FROM payment_attempts WHERE
            (active_slot=1 OR (status IN ('CANCELLED','EXPIRED','PAID') AND created_at>?))
            AND (status<>'CREATING' OR created_at<?)
            AND (last_reconciled_at IS NULL OR last_reconciled_at<?)
            ORDER BY last_reconciled_at NULLS FIRST,created_at LIMIT 5
            """, (r,n)->r.getObject(1,UUID.class), Timestamp.from(Instant.now().minusSeconds(7*86400)),
            Timestamp.from(Instant.now().minusSeconds(120)),
            Timestamp.from(Instant.now().minusSeconds(60)));
    }
    public boolean claimReconcile(UUID order) {
        return tx.execute(s -> {
            lock(order);
            return db.update("""
                UPDATE payment_attempts SET last_reconciled_at=CURRENT_TIMESTAMP WHERE order_id=?
                AND (status<>'CREATING' OR created_at<?)
                AND (last_reconciled_at IS NULL OR last_reconciled_at<?)
                """, order, Timestamp.from(Instant.now().minusSeconds(120)), Timestamp.from(Instant.now().minusSeconds(30)))==1;
        });
    }
    public void reconciled(Attempt original, PaymentLink link) {
        tx.executeWithoutResult(s -> {
            var order=lock(original.orderId()); var p=byOrder(original.orderId());
            if (!Objects.equals(link.getOrderCode(),p.code()) || !Objects.equals(link.getAmount(),p.amount())
                || (p.linkId()!=null && !p.linkId().equals(link.getId()))) throw conflict("Provider identity mismatch");
            if (link.getId()==null || !link.getId().matches("[A-Za-z0-9-]{1,100}")) throw conflict("Invalid provider link");
            db.update("UPDATE payment_attempts SET provider_payment_link_id=?,provider_status=?,checkout_url=COALESCE(checkout_url,?) WHERE id=?",
                link.getId(),link.getStatus().name(),"https://pay.payos.vn/web/"+link.getId(),p.id());
            for (var t:link.getTransactions()) {
                if (t.getAmount()>0) ledger(p, null, t.getReference(), t.getAmount(), "RECONCILIATION", t.getTransactionDateTime());
            }
            long received=db.queryForObject("SELECT COALESCE(SUM(amount),0) FROM payment_transactions WHERE payment_attempt_id=?",Long.class,p.id());
            if (received!=link.getAmountPaid()) review(p.orderId(),"PROVIDER_LEDGER_MISMATCH");
            if (("PAID".equals(link.getStatus().name()) && received<p.amount())
                    || (Set.of("CANCELLED","EXPIRED").contains(link.getStatus().name()) && received>0 && received<p.amount()))
                review(p.orderId(),"CLOSED_OR_INCONSISTENT_PROVIDER_PAYMENT");
            settle(order,p);
            if (Set.of("CANCELLED","EXPIRED").contains(link.getStatus().name()) && received==0 && link.getAmountPaid()==0
                    && !"REVIEW".equals(db.queryForObject("SELECT payment_status FROM orders WHERE id=?",String.class,p.orderId()))
                    && "PENDING_PAYMENT".equals(order.get("status"))) {
                release(p.orderId());
                db.update("UPDATE payment_attempts SET status=?,active_slot=NULL,cancelled_at=CURRENT_TIMESTAMP WHERE id=?",
                    link.getStatus().name(),p.id());
                db.update("UPDATE orders SET status='CANCELLED',cancelled_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?",p.orderId());
                event(p.orderId(),"PAYMENT_CLOSED","CANCELLED");
            }
        });
    }
    /** Persist the verified inbox before acknowledging. Unknown orders (including provider probes) are never credited. */
    public UUID inbox(WebhookData data) {
        String key=hash(data.getOrderCode()+"|"+data.getPaymentLinkId()+"|"+data.getReference()+"|"+data.getAmount()+"|"+data.getCurrency()+"|"+data.getCode());
        var matches=db.queryForList("SELECT id FROM payment_webhook_events WHERE event_key=?",key);
        if (!matches.isEmpty()) {
            db.update("UPDATE payment_webhook_events SET delivery_count=delivery_count+1,last_received_at=CURRENT_TIMESTAMP WHERE event_key=?",key);
            return (UUID)matches.getFirst().get("id");
        }
        UUID id=UUID.randomUUID();
        try {
            db.update("""
                INSERT INTO payment_webhook_events(id,event_key,provider_order_code,payment_link_id,provider_reference,amount,currency,provider_code,signature_verified)
                VALUES (?,?,?,?,?,?,?,?,TRUE)
                """,id,key,data.getOrderCode(),data.getPaymentLinkId(),data.getReference(),data.getAmount(),data.getCurrency(),data.getCode());
            return id;
        } catch (org.springframework.dao.DuplicateKeyException duplicate) {
            return db.queryForObject("SELECT id FROM payment_webhook_events WHERE event_key=?",UUID.class,key);
        }
    }
    public void process(UUID eventId) {
        var e=db.queryForMap("SELECT * FROM payment_webhook_events WHERE id=?",eventId);
        var payments=db.queryForList("SELECT * FROM payment_attempts WHERE provider_order_code=?",e.get("provider_order_code"));
        if (payments.isEmpty()) {
            db.update("UPDATE payment_webhook_events SET status='RETRY',error_code='UNMATCHED_ORDER',processing_attempts=processing_attempts+1 WHERE id=?",eventId);
            return;
        }
        var original=attempt(payments.getFirst());
        tx.executeWithoutResult(s -> {
            var order=lock(original.orderId()); var p=byOrder(original.orderId());
            var current=db.queryForMap("SELECT * FROM payment_webhook_events WHERE id=? FOR UPDATE",eventId);
            if ("PROCESSED".equals(current.get("status"))) return;
            if (p.linkId()!=null && !p.linkId().equals(e.get("payment_link_id"))) {
                db.update("UPDATE payment_webhook_events SET status='FAILED',error_code='LINK_MISMATCH' WHERE id=?",eventId);
                review(p.orderId(),"LINK_MISMATCH"); return;
            }
            db.update("UPDATE payment_attempts SET provider_payment_link_id=? WHERE id=?",e.get("payment_link_id"),p.id());
            db.update("UPDATE payment_webhook_events SET payment_attempt_id=? WHERE id=?",p.id(),eventId);
            ledger(p,eventId,(String)e.get("provider_reference"),((Number)e.get("amount")).longValue(),"WEBHOOK",null);
            settle(order,p);
            db.update("""
                UPDATE payment_webhook_events SET status='PROCESSED',processed_at=CURRENT_TIMESTAMP,
                processing_attempts=processing_attempts+1,error_code=NULL WHERE id=?
                """,eventId);
        });
    }
    public List<UUID> retryEvents() {
        return db.query("""
            SELECT e.id FROM payment_webhook_events e JOIN payment_attempts p ON p.provider_order_code=e.provider_order_code
            WHERE e.status IN ('RECEIVED','RETRY') ORDER BY e.received_at LIMIT 20
            """, (r,n)->r.getObject(1,UUID.class));
    }
    private void ledger(Attempt p, UUID event, String reference, long amount, String source, String time) {
        var existing=db.queryForList("SELECT amount FROM payment_transactions WHERE payment_attempt_id=? AND provider_reference=?",p.id(),reference);
        if (!existing.isEmpty()) {
            if (((Number)existing.getFirst().get("amount")).longValue()!=amount) review(p.orderId(),"REFERENCE_AMOUNT_MISMATCH");
            return;
        }
        Instant occurred=Instant.now();
        if (time!=null) {
            try { occurred=OffsetDateTime.parse(time).toInstant(); }
            catch (java.time.format.DateTimeParseException ignored) {
                try { occurred=LocalDateTime.parse(time.replace(' ','T')).atZone(ZoneId.of("Asia/Ho_Chi_Minh")).toInstant(); }
                catch (java.time.format.DateTimeParseException invalid) { /* receipt time remains available */ }
            }
        }
        db.update("""
            INSERT INTO payment_transactions(id,payment_attempt_id,source_event_id,provider_reference,amount,source,occurred_at)
            VALUES (?,?,?,?,?,?,?)
            """,UUID.randomUUID(),p.id(),event,reference,amount,source,Timestamp.from(occurred));
    }
    private void settle(Map<String,Object> order, Attempt p) {
        long amount=db.queryForObject("SELECT COALESCE(SUM(amount),0) FROM payment_transactions WHERE payment_attempt_id=?",Long.class,p.id());
        String state=amount>=p.amount()?"PAID":amount>0?"PARTIALLY_PAID":"PENDING";
        // Closed attempts stay closed unless an actual incoming transfer is recorded.
        if (amount==0 && Set.of("CANCELLED","EXPIRED","FAILED").contains(p.status())) return;
        db.update("""
            UPDATE payment_attempts SET amount_received=?,status=?,active_slot=?,paid_at=?,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=?
            """,amount,state,"PAID".equals(state)?null:1,"PAID".equals(state)?Timestamp.from(Instant.now()):null,p.id());
        if ("REVIEW".equals(db.queryForObject("SELECT payment_status FROM orders WHERE id=?",String.class,p.orderId()))) return;
        if (amount>p.amount() || (amount>0 && "CANCELLED".equals(order.get("status")))) {
            review(p.orderId(),"UNEXPECTED_PAYMENT_AMOUNT_OR_CLOSED_ORDER"); return;
        }
        if (amount==p.amount() && "PENDING_PAYMENT".equals(order.get("status"))) {
            long held=db.queryForObject("""
                SELECT COUNT(*) FROM inventory_reservations r JOIN order_items i ON i.id=r.order_item_id
                WHERE i.order_id=? AND r.status<>'HELD'
                """,Long.class,p.orderId());
            if (held>0) { review(p.orderId(),"RESERVATION_NOT_HELD"); return; }
            for (var item:items(p.orderId())) {
                int quantity=((Number)item.get("quantity")).intValue(); UUID variant=(UUID)item.get("variant_id"),id=(UUID)item.get("id");
                if (db.update("UPDATE inventory_balances SET on_hand=on_hand-?,reserved=reserved-?,version=version+1 WHERE variant_id=? AND reserved>=? AND on_hand>=?",
                        quantity,quantity,variant,quantity,quantity)!=1) throw conflict("Inventory invariant violated");
                db.update("UPDATE inventory_reservations SET status='CONSUMED',closed_at=CURRENT_TIMESTAMP WHERE order_item_id=? AND status='HELD'",id);
                movement(id,variant,"SALE",-quantity,-quantity);
            }
            db.update("UPDATE orders SET status='CONFIRMED',payment_status='PAID',paid_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=?",p.orderId());
            event(p.orderId(),"PAYMENT_CONFIRMED","CONFIRMED");
        } else if ("PENDING_PAYMENT".equals(order.get("status"))) {
            db.update("UPDATE orders SET payment_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",amount>0?"PARTIALLY_PAID":"UNPAID",p.orderId());
        }
    }
    private List<Map<String,Object>> items(UUID order) {
        return db.queryForList("SELECT * FROM order_items WHERE order_id=? ORDER BY variant_id",order);
    }
    private void release(UUID order) {
        for (var item:items(order)) {
            UUID id=(UUID)item.get("id"),variant=(UUID)item.get("variant_id"); int quantity=((Number)item.get("quantity")).intValue();
            if (db.update("UPDATE inventory_reservations SET status='RELEASED',closed_at=CURRENT_TIMESTAMP WHERE order_item_id=? AND status='HELD'",id)==1) {
                if(db.update("UPDATE inventory_balances SET reserved=reserved-?,version=version+1 WHERE variant_id=? AND reserved>=?",quantity,variant,quantity)!=1)
                    throw conflict("Inventory invariant violated");
                movement(id,variant,"RELEASE",0,-quantity);
            }
        }
    }
    private void movement(UUID item,UUID variant,String type,int onHand,int reserved) {
        db.update("INSERT INTO inventory_movements(id,variant_id,order_item_id,operation_key,movement_type,on_hand_delta,reserved_delta) VALUES (?,?,?,?,?,?,?)",
            UUID.randomUUID(),variant,item,type+":"+item,type,onHand,reserved);
    }
    private void review(UUID order,String reason) {
        db.update("UPDATE orders SET payment_status='REVIEW',updated_at=CURRENT_TIMESTAMP WHERE id=?",order);
        db.update("""
            INSERT INTO order_events(id,order_id,event_type,note,operation_key) SELECT ?,?,'PAYMENT_REVIEW',?,?
            WHERE NOT EXISTS (SELECT 1 FROM order_events WHERE operation_key=?)
            """,UUID.randomUUID(),order,reason,"REVIEW:"+order+":"+reason,"REVIEW:"+order+":"+reason);
    }
    private void event(UUID order,String type,String status) {
        db.update("INSERT INTO order_events(id,order_id,event_type,new_status,operation_key) VALUES (?,?,?,?,?)",
            UUID.randomUUID(),order,type,status,type+":"+order);
    }
}
