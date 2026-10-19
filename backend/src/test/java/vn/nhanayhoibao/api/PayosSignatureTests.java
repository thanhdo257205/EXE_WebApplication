package vn.nhanayhoibao.api;

import org.junit.jupiter.api.Test;
import vn.nhanayhoibao.api.payment.PayosClient;
import vn.payos.PayOS;
import vn.payos.core.ClientOptions;
import vn.payos.model.webhooks.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;

class PayosSignatureTests {
    @Test void officialSdkAcceptsSignedJsonAndRejectsTampering() throws Exception {
        String checksum="test-only-checksum-key";
        var sdk=new PayOS(ClientOptions.builder().clientId("test-id").apiKey("test-key").checksumKey(checksum).build());
        var data=WebhookData.builder().orderCode(123L).amount(3000L).description("TEST").accountNumber("123456")
            .reference("test-reference").transactionDateTime("2026-10-20 12:00:00").currency("VND")
            .paymentLinkId("test-link").code("00").desc("success").build();
        String signature=sdk.getCrypto().createSignatureFromObj(data,checksum);
        String body=new ObjectMapper().writeValueAsString(java.util.Map.of("code","00","success",true,"desc","success","data",data,"signature",signature));
        var client=new PayosClient("test-id","test-key",checksum);
        assertThat(client.verify(body).getAmount()).isEqualTo(3000);
        assertThatThrownBy(()->client.verify(body.replace("3000","9000"))).isInstanceOf(RuntimeException.class);
        assertThat(new PayosClient("","","").ready()).isFalse();
    }
}
