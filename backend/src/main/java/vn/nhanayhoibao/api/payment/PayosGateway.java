package vn.nhanayhoibao.api.payment;

import vn.payos.model.v2.paymentRequests.*;
import vn.payos.model.webhooks.WebhookData;

/** Network boundary, replaced by a deterministic provider in integration tests. */
public interface PayosGateway {
    boolean ready();
    CreatePaymentLinkResponse create(CreatePaymentLinkRequest request);
    PaymentLink get(long code);
    PaymentLink cancel(long code);
    WebhookData verify(String body);
}
