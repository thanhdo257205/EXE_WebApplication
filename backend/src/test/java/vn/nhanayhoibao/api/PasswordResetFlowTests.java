package vn.nhanayhoibao.api;

import java.net.URI;
import java.net.http.*;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.Pattern;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import vn.nhanayhoibao.api.auth.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:recovery;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE"
})
@ActiveProfiles("local")
class PasswordResetFlowTests {
    @Value("${local.server.port}") int port;
    @Autowired PasswordResetService service;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder encoder;
    @Autowired JdbcTemplate db;
    @MockitoBean PasswordResetMailer mailer;
    String email;
    UUID user;
    BlockingQueue<String> links;
    static final String OLD = "Old-password-123!", NEW = "New-password-123!";

    @BeforeEach void setup() {
        email = UUID.randomUUID() + "@example.test";
        user = users.save(new AppUser(email, encoder.encode(OLD), null, "Recovery", "CUSTOMER")).getId();
        links = new LinkedBlockingQueue<>();
        when(mailer.enabled()).thenReturn(true);
        doAnswer(call -> { links.add(call.getArgument(1)); return null; }).when(mailer).send(anyString(), anyString());
    }

    String issue() {
        service.request(email);
        String link = links.poll();
        assertThat(link).startsWith("http://localhost:4200/dat-lai-mat-khau#token=");
        return link.substring(link.indexOf("#token=") + 7);
    }

    @Test void endToEndMailResetRevokesJwtAndRejectsOldPasswordAndReplay() throws Exception {
        var loggedIn = new Browser();
        assertThat(loggedIn.post("login", "{\"email\":\"" + email + "\",\"password\":\"" + OLD + "\"}", true).statusCode()).isEqualTo(200);
        var recovery = new Browser();
        var accepted = recovery.post("forgot-password", "{\"email\":\"" + email + "\"}", true);
        assertThat(accepted.statusCode()).isEqualTo(202);
        String link = links.poll(5, TimeUnit.SECONDS);
        assertThat(link).isNotNull();
        String token = link.substring(link.indexOf("#token=") + 7);
        // The asynchronous transaction may still be finishing its commit; a DB read waits on its lock below.
        service.request(email); // serializes on account lock and exercises resend cooldown
        String persisted = db.queryForObject("SELECT token_hash FROM password_reset_tokens WHERE user_id=?", String.class, user);
        assertThat(persisted).hasSize(64).isNotEqualTo(token);
        var reset = recovery.post("reset-password", resetBody(token, NEW), true);
        assertThat(reset.statusCode()).isEqualTo(204);
        assertThat(reset.headers().allValues("set-cookie").toString()).contains("AUTH_TOKEN=", "Max-Age=0");
        assertThat(loggedIn.get("me").statusCode()).isEqualTo(401);
        assertThat(recovery.post("reset-password", resetBody(token, NEW), true).statusCode()).isEqualTo(400);
        assertThat(recovery.post("login", "{\"email\":\"" + email + "\",\"password\":\"" + OLD + "\"}", true).statusCode()).isEqualTo(401);
        assertThat(recovery.post("login", "{\"email\":\"" + email + "\",\"password\":\"" + NEW + "\"}", true).statusCode()).isEqualTo(200);
    }

    @Test void unknownDisabledAndGoogleOnlyAccountsDoNotReceiveMail() {
        service.request("unknown@example.test");
        db.update("UPDATE app_users SET enabled=FALSE WHERE id=?", user);
        service.request(email);
        db.update("UPDATE app_users SET enabled=TRUE,password_hash=NULL,google_subject=? WHERE id=?", UUID.randomUUID().toString(), user);
        service.request(email);
        verify(mailer, never()).send(anyString(), anyString());
    }

    @Test void publicResponsesDoNotRevealAccountAndCsrfIsRequired() throws Exception {
        var browser = new Browser();
        var known = browser.post("forgot-password", "{\"email\":\"" + email + "\"}", true);
        var unknown = browser.post("forgot-password", "{\"email\":\"absent@example.test\"}", true);
        assertThat(known.statusCode()).isEqualTo(202);
        assertThat(unknown.statusCode()).isEqualTo(202);
        assertThat(known.body()).isEqualTo(unknown.body());
        assertThat(links.poll(5, TimeUnit.SECONDS)).isNotNull();
        service.request(email); // ensure worker finished before the next test replaces mocks
        assertThat(browser.post("forgot-password", "{\"email\":\"" + email + "\"}", false).statusCode()).isEqualTo(403);
        assertThat(browser.post("reset-password", resetBody("a".repeat(43), NEW), false).statusCode()).isEqualTo(403);
        assertThat(browser.post("forgot-password", "{\"email\":\"invalid\"}", true).statusCode()).isEqualTo(400);
    }

    @Test void expiredMalformedAndOverlongUtf8PasswordsAreRejected() {
        String token = issue();
        assertThatThrownBy(() -> service.reset(token, "界".repeat(25))).hasMessageContaining("400");
        assertThatThrownBy(() -> service.reset("invalid", NEW)).hasMessageContaining("400");
        db.update("UPDATE password_reset_tokens SET requested_at=?,expires_at=? WHERE user_id=?",
            Timestamp.from(Instant.now().minusSeconds(1000)), Timestamp.from(Instant.now().minusSeconds(1)), user);
        assertThatThrownBy(() -> service.reset(token, NEW)).hasMessageContaining("400");
        assertThat(encoder.matches(OLD, users.findById(user).orElseThrow().getPasswordHash())).isTrue();
    }

    @Test void resendCooldownAndReplacementInvalidateOlderLink() {
        String first = issue();
        service.request(email);
        verify(mailer, times(1)).send(anyString(), anyString());
        db.update("UPDATE password_reset_tokens SET requested_at=? WHERE user_id=?", Timestamp.from(Instant.now().minusSeconds(61)), user);
        String second = issue();
        assertThat(first).isNotEqualTo(second);
        assertThatThrownBy(() -> service.reset(first, NEW)).hasMessageContaining("400");
        service.reset(second, NEW);
    }

    @Test void failedDeliveryRollsBackTokenReplacement() {
        String first = issue();
        db.update("UPDATE password_reset_tokens SET requested_at=? WHERE user_id=?", Timestamp.from(Instant.now().minusSeconds(61)), user);
        doThrow(new IllegalStateException("test delivery failure")).when(mailer).send(anyString(), anyString());
        assertThatThrownBy(() -> service.request(email)).isInstanceOf(IllegalStateException.class);
        service.reset(first, NEW);
    }

    @Test void disabledServiceReturnsUnavailableForEveryAddress() throws Exception {
        when(mailer.enabled()).thenReturn(false);
        var browser = new Browser();
        assertThat(browser.post("forgot-password", "{\"email\":\"" + email + "\"}", true).statusCode()).isEqualTo(503);
        assertThat(browser.post("reset-password", resetBody("a".repeat(43), NEW), true).statusCode()).isEqualTo(503);
    }

    @Test void concurrentConsumptionCanSucceedOnlyOnce() throws Exception {
        String token = issue();
        var ready = new CountDownLatch(1);
        try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
            Callable<Boolean> action = () -> { ready.await(); try { service.reset(token, NEW); return true; }
                catch (org.springframework.web.server.ResponseStatusException invalid) { return false; } };
            var first = pool.submit(action); var second = pool.submit(action); ready.countDown();
            assertThat(List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS)))
                .containsExactlyInAnyOrder(true, false);
        }
    }

    String resetBody(String token, String password) { return "{\"token\":\"" + token + "\",\"password\":\"" + password + "\"}"; }

    class Browser {
        final HttpClient client = HttpClient.newHttpClient();
        final Map<String, String> cookies = new LinkedHashMap<>();
        HttpResponse<String> send(String method, String path, String body, String csrf) throws Exception {
            var builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/v1/auth/" + path));
            if (!cookies.isEmpty()) builder.header("Cookie", String.join("; ", cookies.values()));
            if (csrf != null) builder.header("X-XSRF-TOKEN", csrf);
            if (body != null) builder.header("Content-Type", "application/json");
            builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
            var result = client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
            result.headers().allValues("set-cookie").forEach(value -> {
                String pair = value.split(";", 2)[0]; cookies.put(pair.split("=", 2)[0], pair);
            });
            return result;
        }
        HttpResponse<String> get(String path) throws Exception { return send("GET", path, null, null); }
        HttpResponse<String> post(String path, String body, boolean withCsrf) throws Exception {
            String csrf = null;
            if (withCsrf) {
                var matcher = Pattern.compile("\"token\":\"([^\"]+)\"").matcher(get("csrf").body());
                assertThat(matcher.find()).isTrue(); csrf = matcher.group(1);
            }
            return send("POST", path, body, csrf);
        }
    }
}
