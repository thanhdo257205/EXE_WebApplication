package vn.nhanayhoibao.api;

import java.net.URI;
import java.net.http.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.json.JsonMapper;
import vn.nhanayhoibao.api.auth.*;
import vn.nhanayhoibao.api.payment.*;
import vn.payos.model.v2.paymentRequests.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
    "spring.datasource.url=jdbc:h2:mem:shopcatalog;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE",
    "app.proxy.required=true","app.proxy.secret=test-shop-proxy-secret-at-least-32-characters"
})
@ActiveProfiles("local")
class ShopCatalogTests {
    static final UUID VARIANT=UUID.fromString("5a1f0c2e-7b1d-4c8a-9a10-000000000003");
    @Autowired PaymentService payments;
    @Autowired UserRepository users;
    @MockitoBean PayosGateway gateway;
    @Value("${local.server.port}") int port;

    @Test void publicCatalogListsTheTrialCardAtTwoThousandDong() throws Exception {
        var request=HttpRequest.newBuilder(URI.create("http://localhost:"+port+"/api/v1/shop/products"))
            .header("X-Origin-Verify","test-shop-proxy-secret-at-least-32-characters").GET().build();
        var response=HttpClient.newHttpClient().send(request,HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Cache-Control")).hasValueSatisfying(v->assertThat(v).contains("no-store"));
        var products=new JsonMapper().readTree(response.body());
        var card=products.get(0);
        assertThat(card.get("name").asText()).isEqualTo("Pokémon Hoàng Nam");
        assertThat(card.get("imageUrl").asText()).isEqualTo("/assets/cards/pokemon-hoang-nam-poster.webp");
        var variant=card.get("variants").get(0);
        assertThat(variant.get("id").asText()).isEqualTo(VARIANT.toString());
        assertThat(variant.get("priceAmount").asLong()).isEqualTo(2_000L);
        assertThat(variant.get("available").asBoolean()).isTrue();
    }

    @Test void checkoutOfTheSeededCardChargesTwoThousandDongAndReturnsQr() {
        when(gateway.ready()).thenReturn(true);
        when(gateway.create(any())).thenAnswer(invocation -> {
            CreatePaymentLinkRequest r=invocation.getArgument(0);
            return CreatePaymentLinkResponse.builder().orderCode(r.getOrderCode()).amount(r.getAmount())
                .bin("test-bank").accountNumber("test-account").accountName("Test only").description(r.getDescription())
                .currency("VND").paymentLinkId("link"+r.getOrderCode()).status(PaymentLinkStatus.PENDING)
                .checkoutUrl("https://pay.payos.vn/web/link"+r.getOrderCode()).qrCode("test-qr").build();
        });
        var email=UUID.randomUUID()+"@example.test";
        var user=users.save(new AppUser(email,null,null,"Shop Buyer","CUSTOMER")).getId();
        var order=payments.checkout(user,email,new CheckoutRequest(UUID.randomUUID().toString(),
            List.of(new CheckoutRequest.Line(VARIANT,1)),"Người mua","0900000000","1 Đường Thử","TP. Hồ Chí Minh",null));
        assertThat(order.total()).isEqualTo(2_000L);
        assertThat(order.qrCode()).isEqualTo("test-qr");
        assertThat(order.checkoutUrl()).startsWith("https://pay.payos.vn/web/link");
    }
}
