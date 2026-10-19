package vn.nhanayhoibao.api.payment;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import vn.payos.PayOS;
import vn.payos.core.ClientOptions;
import vn.payos.model.v2.paymentRequests.*;
import vn.payos.model.webhooks.WebhookData;

@Component
public class PayosClient implements PayosGateway {
    private final PayOS client;

    public PayosClient(@Value("${PAYOS_CLIENT_ID:}") String id,
            @Value("${PAYOS_API_KEY:}") String key, @Value("${PAYOS_CHECKSUM_KEY:}") String checksum) {
        client = id.isBlank() || key.isBlank() || checksum.isBlank() ? null : new PayOS(
            ClientOptions.builder().clientId(id).apiKey(key).checksumKey(checksum)
                .timeoutMs(8000).maxRetries(0).build());
    }

    public boolean ready() { return client != null; }
    private PayOS client() {
        if (client == null) throw new IllegalStateException("Payment provider is not configured");
        return client;
    }
    public CreatePaymentLinkResponse create(CreatePaymentLinkRequest request) { return client().paymentRequests().create(request); }
    public PaymentLink get(long code) { return client().paymentRequests().get(code); }
    public PaymentLink cancel(long code) { return client().paymentRequests().cancel(code, "Order expired"); }
    public WebhookData verify(String body) { return client().webhooks().verify(body); }
}
