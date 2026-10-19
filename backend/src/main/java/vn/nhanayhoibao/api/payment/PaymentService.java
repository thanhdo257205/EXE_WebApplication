package vn.nhanayhoibao.api.payment;

import java.time.Instant;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import vn.payos.model.v2.paymentRequests.CreatePaymentLinkRequest;

@Service
public class PaymentService {
    private static final org.slf4j.Logger log=org.slf4j.LoggerFactory.getLogger(PaymentService.class);
    private final PaymentStore store;
    private final PayosGateway provider;
    private final String publicOrigin;
    public PaymentService(PaymentStore store, PayosGateway provider,
            @Value("${app.payments.public-origin:https://exe-webapp.pages.dev}") String publicOrigin) {
        this.store=store; this.provider=provider; this.publicOrigin=publicOrigin;
    }
    public boolean ready() { return provider.ready(); }
    public PaymentStore.OrderView checkout(UUID user,String email,CheckoutRequest request) {
        if (!ready()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Payments unavailable");
        UUID order=store.checkout(user,email,request);
        if (store.claimCreate(order)) {
            var attempt=store.byOrder(order);
            try {
                var link=provider.create(CreatePaymentLinkRequest.builder().orderCode(attempt.code()).amount(attempt.amount())
                    .description("EXE"+order.toString().substring(0,6).toUpperCase(Locale.ROOT))
                    .returnUrl(publicOrigin+"/api/v1/payments/return/"+order)
                    .cancelUrl(publicOrigin+"/api/v1/payments/return/"+order+"?cancelled=true")
                    .expiredAt(attempt.expiry().getEpochSecond()).build());
                store.created(attempt,link);
            } catch (RuntimeException ambiguous) {
                log.warn("Payment link creation requires reconciliation; order={}, errorType={}",order,ambiguous.getClass().getSimpleName());
                // Do not create a new orderCode after a timeout: the provider may already have created the link.
                store.unknown(order);
            }
        }
        return store.view(order,user);
    }
    public void webhook(String body) {
        if (!ready()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        if(body.getBytes(java.nio.charset.StandardCharsets.UTF_8).length>16384)
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE);
        vn.payos.model.webhooks.WebhookData data;
        try { data=provider.verify(body); }
        catch (RuntimeException invalid) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid payment signature"); }
        // Only signed successful VND credits can enter the money ledger. Signed registration probes
        // without a matching local order are acknowledged and retained as unmatched inbox events.
        if (!"00".equals(data.getCode())) return;
        if (!"VND".equals(data.getCurrency()) || data.getAmount()==null || data.getAmount()<=0
                || data.getOrderCode()==null || data.getOrderCode()<1 || data.getPaymentLinkId()==null
                || !data.getPaymentLinkId().matches("[A-Za-z0-9-]{1,100}")
                || data.getReference()==null || data.getReference().isBlank() || data.getReference().length()>128)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid payment event");
        UUID event=store.inbox(data);
        store.process(event);
    }
    public PaymentStore.OrderView view(UUID order,UUID user) { return store.view(order,user); }
    public List<PaymentStore.OrderView> orders(UUID user) { return store.userOrders(user).stream().map(id->store.view(id,user)).toList(); }
    public PaymentStore.OrderView refresh(UUID order,UUID user) {
        store.view(order,user); // Ownership must be checked before the external request or any mutation.
        reconcile(order);
        return store.view(order,user);
    }
    public void reconcile(UUID order) {
        if (!ready() || !store.claimReconcile(order)) return;
        var attempt=store.byOrder(order);
        try {
            var link=provider.get(attempt.code());
            store.reconciled(attempt,link);
            // Confirm provider closure before releasing stock. A local timeout alone proves nothing.
            if (attempt.expiry().isBefore(Instant.now()) && link.getAmountPaid()==0
                    && "PENDING".equals(link.getStatus().name())) {
                store.reconciled(attempt,provider.cancel(attempt.code()));
            }
        } catch (RuntimeException unavailable) {
            log.warn("Payment reconciliation deferred; order={}, errorType={}",order,unavailable.getClass().getSimpleName());
            // Keep reservations and identity on ambiguity; the next independent sweep can retry.
            store.unknown(order);
        }
    }
    public int sweep() {
        if(!ready()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        for(UUID event:store.retryEvents()) {
            try { store.process(event); } catch(RuntimeException retryLater) { /* durable inbox retains this event */ }
        }
        var due=store.due();
        for(UUID order:due) reconcile(order);
        return due.size();
    }
}
