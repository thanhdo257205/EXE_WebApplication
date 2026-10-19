package vn.nhanayhoibao.api;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import vn.nhanayhoibao.api.auth.*;
import vn.nhanayhoibao.api.payment.*;
import vn.payos.model.v2.paymentRequests.*;
import vn.payos.model.webhooks.WebhookData;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:payments;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE"
})
@ActiveProfiles("local")
class PaymentFlowTests {
    @Autowired JdbcTemplate db;
    @Autowired PaymentService service;
    @Autowired PaymentStore store;
    @Autowired UserRepository users;
    @MockitoBean PayosGateway gateway;
    UUID user,variant;
    String email;
    @BeforeEach void setup() {
        email=UUID.randomUUID()+"@example.test";
        user=users.save(new AppUser(email,null,null,"Payment Test","CUSTOMER")).getId();
        UUID category=UUID.randomUUID(),product=UUID.randomUUID(); variant=UUID.randomUUID();
        db.update("INSERT INTO product_categories(id,slug,name) VALUES (?,?,?)",category,category.toString(),"Test only");
        db.update("INSERT INTO products(id,category_id,slug,name,status) VALUES (?,?,?,?,'ACTIVE')",product,category,product.toString(),"Test product");
        db.update("INSERT INTO product_variants(id,product_id,sku,name,price_amount) VALUES (?,?,?,?,10000)",variant,product,variant.toString(),"Test variant");
        db.update("INSERT INTO inventory_balances(variant_id,on_hand) VALUES (?,10)",variant);
        when(gateway.ready()).thenReturn(true);
        when(gateway.create(any())).thenAnswer(invocation -> {
            CreatePaymentLinkRequest request=invocation.getArgument(0);
            return CreatePaymentLinkResponse.builder().orderCode(request.getOrderCode()).amount(request.getAmount())
                .bin("test-bank").accountNumber("test-account").accountName("Test only").description(request.getDescription())
                .currency("VND").paymentLinkId("link"+request.getOrderCode()).status(PaymentLinkStatus.PENDING)
                .checkoutUrl("https://pay.payos.vn/web/link"+request.getOrderCode()).qrCode("test-qr").build();
        });
    }
    CheckoutRequest request(String key) {
        return new CheckoutRequest(key,List.of(new CheckoutRequest.Line(variant,1)),"Test Buyer","0900000000","Test address","HCM",null);
    }
    PaymentStore.OrderView checkout() { return service.checkout(user,email,request(UUID.randomUUID().toString())); }
    WebhookData credit(UUID order,String reference,long amount) {
        var p=store.byOrder(order);
        return WebhookData.builder().orderCode(p.code()).paymentLinkId("link"+p.code()).reference(reference).amount(amount)
            .currency("VND").code("00").description("test").accountNumber("test")
            .transactionDateTime("2026-10-20 12:00:00").desc("success").build();
    }
    void webhook(WebhookData data) {
        when(gateway.verify("verified-test-body")).thenReturn(data); service.webhook("verified-test-body");
    }
    void makeDue(UUID order) {
        db.update("UPDATE payment_attempts SET last_reconciled_at=? WHERE order_id=?",Timestamp.from(Instant.now().minusSeconds(120)),order);
    }
    PaymentLink link(UUID order,long paid,PaymentLinkStatus status,List<Transaction> transactions) {
        var p=store.byOrder(order);
        return PaymentLink.builder().id("link"+p.code()).orderCode(p.code()).amount(p.amount()).amountPaid(paid)
            .amountRemaining(p.amount()-paid).status(status).createdAt(Instant.now().toString()).transactions(transactions).build();
    }
    Transaction bank(String reference,long amount) {
        return Transaction.builder().reference(reference).amount(amount).accountNumber("test").description("test")
            .transactionDateTime("2026-10-20 12:00:00").build();
    }
    @Test void duplicateCheckoutReturnsSameOrderAndReservesOnce() {
        var request=request(UUID.randomUUID().toString());
        var a=service.checkout(user,email,request); var b=service.checkout(user,email,request);
        assertThat(a.id()).isEqualTo(b.id()); assertThat(a.total()).isEqualTo(10000);
        assertThat(db.queryForObject("SELECT reserved FROM inventory_balances WHERE variant_id=?",Integer.class,variant)).isEqualTo(1);
        verify(gateway,times(1)).create(any());
        var changed=new CheckoutRequest(request.idempotencyKey(),request.items(),"Other buyer",request.recipientPhone(),request.addressLine(),request.province(),null);
        assertThatThrownBy(()->service.checkout(user,email,changed)).hasMessageContaining("409");
    }
    @Test void concurrentRetryCreatesOneOrderAndOneProviderLink() throws Exception {
        var request=request(UUID.randomUUID().toString());
        try(var pool=Executors.newVirtualThreadPerTaskExecutor()) {
            var tasks=List.<Callable<PaymentStore.OrderView>>of(()->service.checkout(user,email,request),()->service.checkout(user,email,request));
            var results=pool.invokeAll(tasks);
            assertThat(results.get(0).get().id()).isEqualTo(results.get(1).get().id());
        }
        verify(gateway,times(1)).create(any());
    }
    @Test void outOfStockRollsBackEverythingAndNeverCallsProvider() {
        db.update("UPDATE inventory_balances SET on_hand=0 WHERE variant_id=?",variant);
        assertThatThrownBy(this::checkout).hasMessageContaining("409");
        assertThat(db.queryForObject("SELECT COUNT(*) FROM orders WHERE user_id=?",Integer.class,user)).isZero();
        verify(gateway,never()).create(any());
    }
    @Test void duplicateWebhookAndReconciliationCreditMoneyAndStockOnlyOnce() {
        var order=checkout().id(); var data=credit(order,"same-reference",10000);
        webhook(data); webhook(data);
        var p=store.byOrder(order);
        store.reconciled(p,link(order,10000,PaymentLinkStatus.PAID,List.of(bank("same-reference",10000))));
        assertThat(service.view(order,user).status()).isEqualTo("CONFIRMED");
        assertThat(service.view(order,user).received()).isEqualTo(10000);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM payment_transactions WHERE payment_attempt_id=?",Integer.class,p.id())).isEqualTo(1);
        assertThat(db.queryForObject("SELECT on_hand FROM inventory_balances WHERE variant_id=?",Integer.class,variant)).isEqualTo(9);
        assertThat(db.queryForObject("SELECT reserved FROM inventory_balances WHERE variant_id=?",Integer.class,variant)).isZero();
    }
    @Test void providerTimeoutKeepsSameAttemptAndReconciliationRecovers() {
        doThrow(new RuntimeException("timeout")).when(gateway).create(any());
        var request=request(UUID.randomUUID().toString()); var order=service.checkout(user,email,request).id();
        assertThat(service.view(order,user).paymentState()).isEqualTo("UNKNOWN");
        service.checkout(user,email,request); verify(gateway,times(1)).create(any());
        var p=store.byOrder(order);
        when(gateway.get(p.code())).thenReturn(link(order,10000,PaymentLinkStatus.PAID,List.of(bank("recovered",10000))));
        makeDue(order); service.refresh(order,user);
        assertThat(service.view(order,user).paymentStatus()).isEqualTo("PAID");
    }
    @Test void invalidSignatureNeverEntersInboxOrChangesOrder() {
        var order=checkout().id();
        when(gateway.verify(any())).thenThrow(new IllegalArgumentException("bad signature"));
        int before=db.queryForObject("SELECT COUNT(*) FROM payment_webhook_events",Integer.class);
        assertThatThrownBy(()->service.webhook("forged")).hasMessageContaining("400");
        assertThat(db.queryForObject("SELECT COUNT(*) FROM payment_webhook_events",Integer.class)).isEqualTo(before);
        assertThat(service.view(order,user).paymentStatus()).isEqualTo("UNPAID");
    }
    @Test void partialThenFullPaymentConsumesStockOnlyWhenComplete() {
        var order=checkout().id(); webhook(credit(order,"part-one",4000));
        assertThat(service.view(order,user).paymentStatus()).isEqualTo("PARTIALLY_PAID");
        assertThat(service.view(order,user).status()).isEqualTo("PENDING_PAYMENT");
        webhook(credit(order,"part-two",6000));
        assertThat(service.view(order,user).paymentStatus()).isEqualTo("PAID");
    }
    @Test void overpaymentGoesToReviewAndDoesNotFulfill() {
        var order=checkout().id(); webhook(credit(order,"overpaid",11000));
        assertThat(service.view(order,user).paymentStatus()).isEqualTo("REVIEW");
        assertThat(service.view(order,user).status()).isEqualTo("PENDING_PAYMENT");
        assertThat(service.view(order,user).received()).isEqualTo(11000);
    }
    @Test void closedOrderLatePaymentIsRecordedButNeverResurrected() {
        var order=checkout().id(); var p=store.byOrder(order);
        store.reconciled(p,link(order,0,PaymentLinkStatus.CANCELLED,List.of()));
        assertThat(service.view(order,user).status()).isEqualTo("CANCELLED");
        webhook(credit(order,"late",10000));
        assertThat(service.view(order,user).status()).isEqualTo("CANCELLED");
        assertThat(service.view(order,user).paymentStatus()).isEqualTo("REVIEW");
        assertThat(db.queryForObject("SELECT on_hand FROM inventory_balances WHERE variant_id=?",Integer.class,variant)).isEqualTo(10);
        assertThat(db.queryForObject("SELECT reserved FROM inventory_balances WHERE variant_id=?",Integer.class,variant)).isZero();
    }
    @Test void mismatchedProviderTotalsRequireReviewBeforeFulfillment() {
        var order=checkout().id(); var p=store.byOrder(order);
        store.reconciled(p,link(order,12000,PaymentLinkStatus.PAID,List.of(bank("wrong-summary",10000))));
        assertThat(service.view(order,user).paymentStatus()).isEqualTo("REVIEW");
        assertThat(service.view(order,user).status()).isEqualTo("PENDING_PAYMENT");
    }
    @Test void anotherCustomerCannotReadOrRefreshOrder() {
        var order=checkout().id(); var other=UUID.randomUUID();
        assertThatThrownBy(()->service.refresh(order,other)).hasMessageContaining("404");
        verify(gateway,never()).get(anyLong());
    }
    @Test void expiredLinkReleasesStockOnlyAfterProviderConfirmsCancellation() {
        var order=checkout().id(); var p=store.byOrder(order);
        db.update("UPDATE payment_attempts SET expires_at=? WHERE id=?",Timestamp.from(Instant.now().minusSeconds(60)),p.id());
        when(gateway.get(p.code())).thenReturn(link(order,0,PaymentLinkStatus.PENDING,List.of()));
        when(gateway.cancel(p.code())).thenThrow(new RuntimeException("network"));
        makeDue(order); service.reconcile(order);
        assertThat(service.view(order,user).status()).isEqualTo("PENDING_PAYMENT");
        assertThat(db.queryForObject("SELECT reserved FROM inventory_balances WHERE variant_id=?",Integer.class,variant)).isEqualTo(1);
        doReturn(link(order,0,PaymentLinkStatus.CANCELLED,List.of())).when(gateway).cancel(p.code());
        makeDue(order); service.reconcile(order);
        assertThat(service.view(order,user).status()).isEqualTo("CANCELLED");
    }
    @Test void reconciliationMissingWebhookRecordsPayment() {
        var order=checkout().id(); var p=store.byOrder(order);
        when(gateway.get(p.code())).thenReturn(link(order,10000,PaymentLinkStatus.PAID,List.of(bank("no-webhook",10000))));
        makeDue(order); service.refresh(order,user);
        assertThat(service.view(order,user).status()).isEqualTo("CONFIRMED");
    }
    @Test void differentBuyersCompeteForLastUnitWithoutOverselling() throws Exception {
        db.update("UPDATE inventory_balances SET on_hand=1 WHERE variant_id=?",variant);
        var other=users.save(new AppUser(UUID.randomUUID()+"@example.test",null,null,"Other","CUSTOMER"));
        var start=new CountDownLatch(1);
        try(var pool=Executors.newVirtualThreadPerTaskExecutor()) {
            Callable<Boolean> first=()->{start.await();try{checkout();return true;}catch(org.springframework.web.server.ResponseStatusException soldOut){return false;}};
            Callable<Boolean> second=()->{start.await();try{service.checkout(other.getId(),other.getEmail(),request(UUID.randomUUID().toString()));return true;}
                catch(org.springframework.web.server.ResponseStatusException soldOut){return false;}};
            var a=pool.submit(first);var b=pool.submit(second);start.countDown();
            assertThat(List.of(a.get(),b.get())).containsExactlyInAnyOrder(true,false);
        }
        assertThat(db.queryForObject("SELECT reserved FROM inventory_balances WHERE variant_id=?",Integer.class,variant)).isEqualTo(1);
        verify(gateway,times(1)).create(any());
    }
    @Test void unmatchedVerifiedEventIsDurableAndCanBeReplayed() {
        var order=checkout().id();var data=credit(order,"replay",10000);
        UUID event=store.inbox(data);
        assertThat(service.view(order,user).paymentStatus()).isEqualTo("UNPAID");
        store.process(event);
        assertThat(service.view(order,user).paymentStatus()).isEqualTo("PAID");
    }
    @Test void mismatchedReferenceAmountAndWrongLinkNeverFulfill() {
        var order=checkout().id();webhook(credit(order,"collision",4000));
        webhook(credit(order,"collision",10000));
        assertThat(service.view(order,user).paymentStatus()).isEqualTo("REVIEW");
        assertThat(service.view(order,user).received()).isEqualTo(4000);
        assertThat(service.view(order,user).status()).isEqualTo("PENDING_PAYMENT");
        var next=checkout();assertThat(next.paymentState()).isEqualTo("PENDING");
        var another=next.id();var wrongLink=credit(another,"bad-link",10000);wrongLink.setPaymentLinkId("different-link");
        webhook(wrongLink);
        assertThat(service.view(another,user).paymentStatus()).isEqualTo("REVIEW");
        assertThat(service.view(another,user).received()).isZero();
    }
}
