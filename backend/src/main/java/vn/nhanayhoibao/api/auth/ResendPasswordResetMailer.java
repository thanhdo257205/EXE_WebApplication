package vn.nhanayhoibao.api.auth;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class ResendPasswordResetMailer implements PasswordResetMailer {
    private final boolean enabled;
    private final String apiKey;
    private final String from;
    private final RestClient client;

    @org.springframework.beans.factory.annotation.Autowired
    public ResendPasswordResetMailer(@Value("${app.auth.password-reset.enabled:false}") boolean enabled,
            @Value("${app.mail.resend-api-key:}") String apiKey,
            @Value("${app.mail.from:}") String from) {
        this(enabled, apiKey, from, createClient());
    }

    ResendPasswordResetMailer(boolean enabled, String apiKey, String from, RestClient client) {
        this.enabled = enabled;
        this.apiKey = apiKey;
        this.from = from;
        if (enabled && (apiKey.isBlank() || from.isBlank() || from.contains("\r") || from.contains("\n"))) {
            throw new IllegalStateException("Password recovery requires mail credentials and a verified sender");
        }
        this.client = client;
    }

    private static RestClient createClient() {
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build());
        factory.setReadTimeout(Duration.ofSeconds(10));
        return RestClient.builder().baseUrl("https://api.resend.com").requestFactory(factory).build();
    }

    @Override public boolean enabled() { return enabled; }

    @Override public void send(String recipient, String resetUrl) {
        if (!enabled) throw new IllegalStateException("Password recovery is disabled");
        client.post().uri("/emails").headers(headers -> headers.setBearerAuth(apiKey))
            .body(Map.of("from", from, "to", List.of(recipient),
                "subject", "Đặt lại mật khẩu — Nhà Này Hơi Báo!",
                "text", "Bạn đã yêu cầu đặt lại mật khẩu. Mở liên kết sau trong vòng 15 phút:\n\n"
                    + resetUrl + "\n\nLiên kết chỉ dùng được một lần. Nếu bạn không yêu cầu, hãy bỏ qua email này."
                    + " Không chia sẻ liên kết này với người khác."))
            .retrieve().toBodilessEntity();
    }
}
