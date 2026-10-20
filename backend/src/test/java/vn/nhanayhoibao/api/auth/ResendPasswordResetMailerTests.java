package vn.nhanayhoibao.api.auth;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class ResendPasswordResetMailerTests {
    @Test void sendsRecoveryLinkThroughHttpsApiAndRejectsProviderFailure() {
        var builder = RestClient.builder().baseUrl("https://api.resend.com");
        var server = MockRestServiceServer.bindTo(builder).build();
        var mailer = new ResendPasswordResetMailer(true, "test-only-key", "Game <noreply@example.test>", builder.build());
        server.expect(requestTo("https://api.resend.com/emails")).andExpect(method(HttpMethod.POST))
            .andExpect(header("Authorization", "Bearer test-only-key"))
            .andExpect(jsonPath("$.from").value("Game <noreply@example.test>"))
            .andExpect(jsonPath("$.to[0]").value("member@example.test"))
            .andExpect(jsonPath("$.text").value(org.hamcrest.Matchers.containsString("https://game.example.test/dat-lai-mat-khau#token=test")))
            .andRespond(withSuccess("{\"id\":\"test-message\"}", MediaType.APPLICATION_JSON));
        mailer.send("member@example.test", "https://game.example.test/dat-lai-mat-khau#token=test");
        server.verify(); server.reset();
        server.expect(requestTo("https://api.resend.com/emails")).andRespond(withServerError());
        assertThatThrownBy(() -> mailer.send("member@example.test", "https://game.example.test/reset"))
            .isInstanceOf(org.springframework.web.client.RestClientException.class);
        server.verify();
    }

    @Test void cannotEnableWithoutMailCredentialsAndDisabledMailerNeverSends() {
        assertThatThrownBy(() -> new ResendPasswordResetMailer(true, "", "sender@example.test"))
            .isInstanceOf(IllegalStateException.class);
        var mailer = new ResendPasswordResetMailer(false, "", "");
        assertThat(mailer.enabled()).isFalse();
        assertThatThrownBy(() -> mailer.send("member@example.test", "https://example.test/reset"))
            .isInstanceOf(IllegalStateException.class);
    }
}
