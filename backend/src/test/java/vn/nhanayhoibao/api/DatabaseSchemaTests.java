package vn.nhanayhoibao.api;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import java.sql.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.stream.Stream;
import static org.assertj.core.api.Assertions.*;

/** Exercises real constraints/transactions on H2 and optionally an isolated PostgreSQL schema. */
class DatabaseSchemaTests {
    record Database(String label, String url, String user, String password, String schema) {
        Connection connect() throws SQLException {
            Connection c = DriverManager.getConnection(url, user, password);
            c.setSchema(schema);
            return c;
        }
        // Avoid printing credentials in JUnit display names or assertion failures.
        @Override public String toString() { return label; }
    }
    record Fixture(UUID user, UUID variant, UUID order, UUID item) {}
    static final List<Database> databases = new ArrayList<>();
    static final String DIGEST = "a".repeat(64);

    @BeforeAll static void migrate() throws SQLException {
        databases.add(new Database("H2", "jdbc:h2:mem:commerce_contract;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE", "sa", "", schemaName()));
        String pg = System.getenv("SCHEMA_TEST_JDBC_URL");
        if (pg != null && !pg.isBlank()) databases.add(new Database("PostgreSQL", pg,
                Objects.requireNonNull(System.getenv("SCHEMA_TEST_USERNAME")),
                Objects.requireNonNull(System.getenv("SCHEMA_TEST_PASSWORD")), schemaName()));
        for (var db : databases) {
            var old = Flyway.configure().dataSource(db.url, db.user, db.password)
                    .schemas(db.schema).defaultSchema(db.schema).createSchemas(true).target("2").load();
            assertThat(old.migrate().migrationsExecuted).isEqualTo(2);
            var legacyUser = UUID.randomUUID();
            try (var c = db.connect()) {
                update(c, "INSERT INTO app_users(id,email,password_hash,display_name,role) VALUES (?,?,?,'Legacy buyer','CUSTOMER')",
                        legacyUser, legacyUser + "@example.test", "legacy-hash-preserved");
            }
            var flyway = Flyway.configure().dataSource(db.url, db.user, db.password)
                    .schemas(db.schema).defaultSchema(db.schema).createSchemas(true).load();
            assertThat(flyway.migrate().migrationsExecuted).isEqualTo(9);
            try (var c = db.connect()) {
                assertThat(scalar(c, "SELECT password_hash FROM app_users WHERE id=?", legacyUser)).isEqualTo("legacy-hash-preserved");
            }
            assertThat(flyway.migrate().migrationsExecuted).isZero();
            flyway.validate();
        }
    }

    @AfterAll static void cleanup() throws SQLException {
        for (var db : databases) {
            // Only remove the generated test schema. Never target public or an input-supplied schema.
            if (!db.schema.matches("exe_schema_test_[a-f0-9]{12}")) throw new IllegalStateException("Unsafe test schema");
            try (var c = DriverManager.getConnection(db.url, db.user, db.password); var s = c.createStatement()) {
                s.execute("DROP SCHEMA IF EXISTS " + db.schema + " CASCADE");
            }
        }
    }
    static String schemaName() { return "exe_schema_test_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12); }

    @TestFactory Stream<DynamicTest> contracts() {
        return databases.stream().flatMap(db -> Stream.of(
            scenario(db, "money totals, currency and quantities", this::moneyConstraints),
            scenario(db, "checkout retry cannot create duplicate order", this::checkoutIdempotency),
            scenario(db, "one active PayOS attempt and distinct provider order codes", this::paymentAttempts),
            scenario(db, "verified webhook and bank transaction deduplication", this::paymentDeduplication),
            scenario(db, "paid status and refund completion need evidence", this::paymentEvidence),
            scenario(db, "stock invariants and variant ownership", this::inventoryConstraints),
            scenario(db, "purchase snapshots survive account/catalog edits", this::snapshots),
            scenario(db, "content revisions cannot mix releases", this::contentVersions),
            DynamicTest.dynamicTest(db + ": concurrent buyers cannot reserve the final unit twice", () -> concurrentStock(db))
        ));
    }
    interface SqlScenario { void run(Connection c) throws Exception; }
    DynamicTest scenario(Database db, String name, SqlScenario scenario) {
        return DynamicTest.dynamicTest(db + ": " + name, () -> {
            try (var c = db.connect()) {
                c.setAutoCommit(false);
                try { scenario.run(c); } finally { c.rollback(); }
            }
        });
    }
    static int update(Connection c, String sql, Object... args) throws SQLException {
        try (var s = c.prepareStatement(sql)) {
            for (int i = 0; i < args.length; i++) s.setObject(i + 1, args[i]);
            return s.executeUpdate();
        }
    }
    static Object scalar(Connection c, String sql, Object... args) throws SQLException {
        try (var s = c.prepareStatement(sql)) {
            for (int i = 0; i < args.length; i++) s.setObject(i + 1, args[i]);
            try (var r = s.executeQuery()) { assertThat(r.next()).isTrue(); return r.getObject(1); }
        }
    }
    static void rejected(Connection c, String sql, Object... args) throws SQLException {
        var savepoint = c.setSavepoint();
        try { assertThatThrownBy(() -> update(c, sql, args)).isInstanceOf(SQLException.class); }
        finally { c.rollback(savepoint); c.releaseSavepoint(savepoint); }
    }
    Fixture fixture(Connection c) throws SQLException {
        var user = UUID.randomUUID(); var category = UUID.randomUUID(); var product = UUID.randomUUID();
        var variant = UUID.randomUUID(); var order = UUID.randomUUID(); var item = UUID.randomUUID();
        update(c, "INSERT INTO app_users(id,email,display_name,role) VALUES (?,?,?,'CUSTOMER')", user, user + "@example.test", "Buyer");
        update(c, "INSERT INTO product_categories(id,slug,name) VALUES (?,?,?)", category, category.toString(), "Board games");
        update(c, "INSERT INTO products(id,category_id,slug,name,status) VALUES (?,?,?,?,'ACTIVE')", product, category, product.toString(), "Game V2");
        update(c, "INSERT INTO product_variants(id,product_id,sku,name,price_amount) VALUES (?,?,?,?,100000)", variant, product, variant.toString(), "Base box");
        update(c, "INSERT INTO inventory_balances(variant_id,on_hand) VALUES (?,1)", variant);
        update(c, """
            INSERT INTO orders(id,order_number,user_id,checkout_key,checkout_fingerprint,subtotal_amount,total_amount,
                buyer_email,recipient_name,recipient_phone,shipping_address_line,shipping_province,expires_at)
            VALUES (?,?,?,?,?,100000,100000,?,'Original buyer','0900000000','Original address','HCMC',CURRENT_TIMESTAMP + INTERVAL '1' DAY)
            """, order, order.toString(), user, UUID.randomUUID().toString(), DIGEST, user + "@example.test");
        update(c, """
            INSERT INTO order_items(id,order_id,variant_id,sku_snapshot,product_name_snapshot,variant_name_snapshot,quantity,unit_price_amount,line_total_amount)
            VALUES (?,?,?,?,'Original product','Original variant',1,100000,100000)
            """, item, order, variant, variant.toString());
        return new Fixture(user, variant, order, item);
    }
    UUID attempt(Connection c, UUID order) throws SQLException {
        UUID id = UUID.randomUUID();
        update(c, """
            INSERT INTO payment_attempts(id,order_id,request_key,request_fingerprint,description,amount_requested,active_slot,expires_at)
            VALUES (?,?,?,?, 'NHB TEST',100000,1,CURRENT_TIMESTAMP + INTERVAL '1' DAY)
            """, id, order, id.toString(), DIGEST);
        return id;
    }
    void moneyConstraints(Connection c) throws Exception {
        var f = fixture(c);
        rejected(c, "UPDATE orders SET total_amount=1 WHERE id=?", f.order);
        rejected(c, "UPDATE orders SET currency='USD' WHERE id=?", f.order);
        rejected(c, "UPDATE orders SET discount_amount=-1 WHERE id=?", f.order);
        rejected(c, "UPDATE order_items SET quantity=0 WHERE id=?", f.item);
        rejected(c, "UPDATE order_items SET line_total_amount=999 WHERE id=?", f.item);
        rejected(c, "UPDATE product_variants SET price_amount=-1 WHERE id=?", f.variant);
    }
    void checkoutIdempotency(Connection c) throws Exception {
        var one = fixture(c); var two = fixture(c);
        update(c, "UPDATE orders SET checkout_key='same-retry-key' WHERE id IN (?,?)", one.order, two.order);
        rejected(c, "UPDATE orders SET user_id=? WHERE id=?", one.user, two.order);
    }
    void paymentAttempts(Connection c) throws Exception {
        var f = fixture(c); var first = attempt(c, f.order);
        rejected(c, "UPDATE payment_attempts SET active_slot=NULL WHERE id=?", first);
        rejected(c, """
            INSERT INTO payment_attempts(id,order_id,request_key,request_fingerprint,description,amount_requested,active_slot,expires_at)
            VALUES (?,?,?,?, 'TEST',100000,1,CURRENT_TIMESTAMP)
            """, UUID.randomUUID(), f.order, UUID.randomUUID().toString(), DIGEST);
        update(c, "UPDATE payment_attempts SET status='CANCELLED',active_slot=NULL WHERE id=?", first);
        var second = attempt(c, f.order);
        assertThat(scalar(c, "SELECT provider_order_code FROM payment_attempts WHERE id=?", first))
                .isNotEqualTo(scalar(c, "SELECT provider_order_code FROM payment_attempts WHERE id=?", second));
        rejected(c, "UPDATE payment_attempts SET provider_order_code=9007199254740992 WHERE id=?", second);
    }
    void paymentDeduplication(Connection c) throws Exception {
        var f = fixture(c); var attempt = attempt(c, f.order); var event = UUID.randomUUID();
        var orderCode = scalar(c, "SELECT provider_order_code FROM payment_attempts WHERE id=?", attempt);
        String sql = """
            INSERT INTO payment_webhook_events(id,event_key,payment_attempt_id,provider_order_code,payment_link_id,
                provider_reference,amount,currency,provider_code,signature_verified)
            VALUES (?,?,?,?,'test-link','bank-ref',100000,'VND','00',?)
            """;
        rejected(c, sql, UUID.randomUUID(), DIGEST, attempt, orderCode, false);
        update(c, sql, event, DIGEST, attempt, orderCode, true);
        rejected(c, sql, UUID.randomUUID(), DIGEST, attempt, orderCode, true);
        update(c, """
            INSERT INTO payment_transactions(id,payment_attempt_id,source_event_id,provider_reference,amount,source,occurred_at)
            VALUES (?,?,?,'bank-ref',100000,'WEBHOOK',CURRENT_TIMESTAMP)
            """, UUID.randomUUID(), attempt, event);
        rejected(c, """
            INSERT INTO payment_transactions(id,payment_attempt_id,provider_reference,amount,source,occurred_at)
            VALUES (?,?,'bank-ref',100000,'RECONCILIATION',CURRENT_TIMESTAMP)
            """, UUID.randomUUID(), attempt);
        var otherAttempt = attempt(c, fixture(c).order);
        rejected(c, """
            INSERT INTO payment_transactions(id,payment_attempt_id,source_event_id,provider_reference,amount,source,occurred_at)
            VALUES (?,?,?,'another-ref',100000,'WEBHOOK',CURRENT_TIMESTAMP)
            """, UUID.randomUUID(), otherAttempt, event);
    }
    void paymentEvidence(Connection c) throws Exception {
        var a = attempt(c, fixture(c).order);
        rejected(c, "UPDATE payment_attempts SET status='PAID',active_slot=NULL WHERE id=?", a);
        update(c, "UPDATE payment_attempts SET status='PAID',active_slot=NULL,amount_received=100000,paid_at=CURRENT_TIMESTAMP WHERE id=?", a);
        var tx = UUID.randomUUID();
        update(c, "INSERT INTO payment_transactions(id,payment_attempt_id,provider_reference,amount,source,occurred_at) VALUES (?,?,'ref',100000,'RECONCILIATION',CURRENT_TIMESTAMP)", tx, a);
        var refund = UUID.randomUUID();
        update(c, "INSERT INTO refunds(id,payment_transaction_id,idempotency_key,amount,reason) VALUES (?,?,?,10000,'Return request')", refund, tx, refund.toString());
        rejected(c, "UPDATE refunds SET status='SUCCEEDED' WHERE id=?", refund);
    }
    void inventoryConstraints(Connection c) throws Exception {
        var f = fixture(c); var other = fixture(c);
        rejected(c, "UPDATE inventory_balances SET reserved=2 WHERE variant_id=?", f.variant);
        rejected(c, "UPDATE inventory_balances SET on_hand=-1 WHERE variant_id=?", f.variant);
        rejected(c, """
            INSERT INTO inventory_movements(id,variant_id,order_item_id,operation_key,movement_type,on_hand_delta,reserved_delta)
            VALUES (?,?,?,?,'RESERVE',0,1)
            """, UUID.randomUUID(), other.variant, f.item, UUID.randomUUID().toString());
        rejected(c, """
            INSERT INTO inventory_movements(id,variant_id,order_item_id,operation_key,movement_type,on_hand_delta,reserved_delta)
            VALUES (?,?,?,?,'SALE',-1,0)
            """, UUID.randomUUID(), f.variant, f.item, UUID.randomUUID().toString());
    }
    void snapshots(Connection c) throws Exception {
        var f = fixture(c);
        update(c, "INSERT INTO user_profiles(user_id,phone) VALUES (?,'0900000000')", f.user);
        update(c, "UPDATE product_variants SET price_amount=200000,name='Changed variant' WHERE id=?", f.variant);
        assertThat(scalar(c, "SELECT unit_price_amount FROM order_items WHERE id=?", f.item)).isEqualTo(100000L);
        assertThat(scalar(c, "SELECT variant_name_snapshot FROM order_items WHERE id=?", f.item)).isEqualTo("Original variant");
        update(c, "DELETE FROM app_users WHERE id=?", f.user);
        assertThat(scalar(c, "SELECT user_id FROM orders WHERE id=?", f.order)).isNull();
        assertThat(scalar(c, "SELECT recipient_name FROM orders WHERE id=?", f.order)).isEqualTo("Original buyer");
        assertThat(((Number) scalar(c, "SELECT COUNT(*) FROM user_profiles WHERE user_id=?", f.user)).intValue()).isZero();
    }
    void contentVersions(Connection c) throws Exception {
        var one = UUID.randomUUID(); var two = UUID.randomUUID(); var set = UUID.randomUUID(); var card = UUID.randomUUID();
        update(c, "INSERT INTO content_releases(id,version_label,title) VALUES (?,?, 'Draft')", one, one.toString());
        update(c, "INSERT INTO content_releases(id,version_label,title) VALUES (?,?, 'Draft')", two, two.toString());
        update(c, "INSERT INTO card_sets(id,code,slug) VALUES (?,?,?)", set, set.toString(), set.toString());
        update(c, "INSERT INTO card_set_revisions(id,card_set_id,release_id,name) VALUES (?,?,?, 'Set V1')", UUID.randomUUID(), set, one);
        update(c, "INSERT INTO game_cards(id,code,slug) VALUES (?,?,?)", card, card.toString(), card.toString());
        rejected(c, "INSERT INTO card_revisions(id,card_id,release_id,card_set_id,name,effect_text) VALUES (?,?,?,?, 'Card','Effect')", UUID.randomUUID(), card, two, set);
        update(c, "UPDATE content_releases SET status='PUBLISHED',current_slot=1,published_at=CURRENT_TIMESTAMP WHERE id=?", one);
        rejected(c, "UPDATE content_releases SET status='PUBLISHED',current_slot=1,published_at=CURRENT_TIMESTAMP WHERE id=?", two);
    }
    void concurrentStock(Database db) throws Exception {
        Fixture f;
        try (var c = db.connect()) { f = fixture(c); }
        var start = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            Callable<Integer> buyer = () -> {
                try (var c = db.connect()) {
                    c.setAutoCommit(false);
                    start.await();
                    int held = update(c, "UPDATE inventory_balances SET reserved=reserved+1,version=version+1 WHERE variant_id=? AND on_hand-reserved>=1", f.variant);
                    c.commit();
                    return held;
                }
            };
            var first = executor.submit(buyer); var second = executor.submit(buyer); start.countDown();
            assertThat(first.get(30, TimeUnit.SECONDS) + second.get(30, TimeUnit.SECONDS)).isEqualTo(1);
        }
    }
}
