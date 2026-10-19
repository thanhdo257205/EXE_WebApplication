package vn.nhanayhoibao.api;

import java.net.URI;
import java.net.http.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
    "spring.datasource.url=jdbc:h2:mem:paymentsecurity;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE",
    "app.proxy.required=true","app.proxy.secret=test-only-payment-proxy-secret-32-chars",
    "PAYOS_CLIENT_ID=test-id","PAYOS_API_KEY=test-key","PAYOS_CHECKSUM_KEY=test-checksum"
})
@ActiveProfiles("local")
class PaymentSecurityTests {
    @Value("${local.server.port}") int port;
    int call(String method,String path,boolean proxy,String body) throws Exception {
        var request=HttpRequest.newBuilder(URI.create("http://localhost:"+port+path));
        if(proxy) request.header("X-Origin-Verify","test-only-payment-proxy-secret-32-chars");
        if(body!=null) request.header("Content-Type","application/json");
        request.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(body));
        return HttpClient.newHttpClient().send(request.build(),HttpResponse.BodyHandlers.ofString()).statusCode();
    }
    @Test void paymentWebhookBypassesCsrfButRequiresSignatureAndProxy() throws Exception {
        assertThat(call("POST","/api/v1/payments/payos/webhook",true,"{}")).isEqualTo(400);
        assertThat(call("POST","/api/v1/payments/payos/webhook",false,"{}")).isEqualTo(403);
        assertThat(call("POST","/api/v1/payments/payos/webhook/other",true,"{}")).isEqualTo(403);
    }
    @Test void checkoutRequiresCsrfAndOrdersRequireAuthentication() throws Exception {
        assertThat(call("POST","/api/v1/checkout",true,"{}")).isEqualTo(403);
        assertThat(call("GET","/api/v1/orders",true,null)).isEqualTo(401);
        assertThat(call("GET","/api/v1/payments/config",true,null)).isEqualTo(200);
        assertThat(call("GET","/api/v1/payments/return/00000000-0000-0000-0000-000000000001",true,null)).isEqualTo(200);
        assertThat(call("POST","/api/v1/internal/payments/reconcile",false,null)).isEqualTo(403);
    }
}
