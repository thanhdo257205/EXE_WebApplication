package vn.nhanayhoibao.api;

import java.net.URI;
import java.net.http.*;
import java.time.Instant;
import java.util.Map;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.test.context.ActiveProfiles;
import vn.nhanayhoibao.api.auth.*;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:authflow;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE",
    "app.proxy.required=true", "app.proxy.secret=test-only-32-character-proxy-secret",
    "app.auth.google.enabled=true", "GOOGLE_CLIENT_ID=test-client", "GOOGLE_CLIENT_SECRET=test-secret",
    "GOOGLE_REDIRECT_URI=https://game.example.test/api/v1/auth/oauth2/callback/google"
})
@ActiveProfiles("local")
class AuthFlowTests {
    static final String SECRET = "test-only-32-character-proxy-secret";
    static final String EMAIL = "member@example.test";
    static final String PASSWORD = "test-only-long-password";
    @Value("${local.server.port}") int port;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder encoder;
    @Autowired GoogleAccountService google;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;

    @BeforeEach
    void account() {
        if (users.findByEmail(EMAIL).isEmpty()) {
            users.save(new AppUser(EMAIL, encoder.encode(PASSWORD), null, "Member", "CUSTOMER"));
        }
    }

    @Test
    void jwtCookieCsrfRotationAndLogoutRevocation() throws Exception {
        var browser = new Browser();
        assertThat(browser.send("GET", "/api/v1/auth/me", null, null).statusCode()).isEqualTo(401);
        assertThat(browser.send("POST", "/api/v1/auth/login", login(PASSWORD), null).statusCode()).isEqualTo(403);
        String csrf = browser.csrf();
        String previousSession = browser.cookie;
        var login = browser.send("POST", "/api/v1/auth/login", login(PASSWORD), csrf);
        assertThat(login.statusCode()).isEqualTo(200);
        assertThat(login.body()).contains(EMAIL, "CUSTOMER").doesNotContain("passwordHash", PASSWORD);
        assertThat(browser.cookie).isNotEqualTo(previousSession);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM SPRING_SESSION_ATTRIBUTES WHERE ATTRIBUTE_NAME = 'SPRING_SECURITY_CONTEXT'", Integer.class)).isZero();
        assertThat(login.headers().allValues("set-cookie").toString()).contains("AUTH_TOKEN=");
        assertThat(login.headers().allValues("set-cookie").toString()).containsIgnoringCase("HttpOnly");
        assertThat(browser.send("GET", "/api/v1/auth/me", null, null).statusCode()).isEqualTo(200);
        assertThat(browser.send("GET", "/api/v1/admin/private", null, null).statusCode()).isEqualTo(403);
        assertThat(browser.send("POST", "/api/v1/auth/logout", "", csrf).statusCode()).isEqualTo(403);
        csrf = browser.csrf();
        String authenticatedCookie = browser.cookie;
        assertThat(browser.send("POST", "/api/v1/auth/logout", "", csrf).statusCode()).isEqualTo(204);
        browser.cookie = authenticatedCookie;
        assertThat(browser.send("GET", "/api/v1/auth/me", null, null).statusCode()).isEqualTo(401);
    }

    @Test
    void registerNewCustomerAndAuthenticate() throws Exception {
        var browser = new Browser();
        String csrf = browser.csrf();
        var reg = browser.send("POST", "/api/v1/auth/register",
            "{\"displayName\":\"New Customer\",\"email\":\"newcustomer@example.test\",\"password\":\"ValidPass123!\"}", csrf);
        assertThat(reg.statusCode()).isEqualTo(200);
        assertThat(reg.body()).contains("newcustomer@example.test", "New Customer", "CUSTOMER");
        assertThat(browser.send("GET", "/api/v1/auth/me", null, null).statusCode()).isEqualTo(200);

        // Duplicated email is rejected
        var dup = browser.send("POST", "/api/v1/auth/register",
            "{\"displayName\":\"Other\",\"email\":\"newcustomer@example.test\",\"password\":\"ValidPass123!\"}", browser.csrf());
        assertThat(dup.statusCode()).isEqualTo(400);
    }

    @Test
    void wrongPasswordAndUnknownEmailHaveSameGenericFailure() throws Exception {
        var browser = new Browser();
        String csrf = browser.csrf();
        var wrong = browser.send("POST", "/api/v1/auth/login", login("incorrect-password"), csrf);
        var unknown = browser.send("POST", "/api/v1/auth/login",
            "{\"email\":\"unknown@example.test\",\"password\":\"incorrect-password\"}", csrf);
        assertThat(wrong.statusCode()).isEqualTo(401);
        assertThat(unknown.statusCode()).isEqualTo(401);
        assertThat(wrong.body()).isEqualTo(unknown.body());
        assertThat(browser.send("GET", "/api/v1/auth/me", null, null).statusCode()).isEqualTo(401);
        assertThat(encoder.matches(PASSWORD, users.findByEmail(EMAIL).orElseThrow().getPasswordHash())).isTrue();
    }

    @Test
    void invalidLoginPayloadIsRejectedWithoutAuthenticating() throws Exception {
        var browser = new Browser();
        var response = browser.send("POST", "/api/v1/auth/login", "{\"email\":\"invalid\",\"password\":\"\"}", browser.csrf());
        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(browser.send("GET", "/api/v1/auth/me", null, null).statusCode()).isEqualTo(401);
    }

    @Test
    void validLongEmailCanBeStoredAsJdbcSessionPrincipal() throws Exception {
        String email = "member@" + "a".repeat(50) + "." + "b".repeat(50) + ".test";
        users.save(new AppUser(email, encoder.encode(PASSWORD), null, "Long Email", "CUSTOMER"));
        var browser = new Browser();
        var response = browser.send("POST", "/api/v1/auth/login",
            "{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\"}", browser.csrf());
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(browser.send("GET", "/api/v1/auth/me", null, null).statusCode()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM SPRING_SESSION WHERE PRINCIPAL_NAME = ?", Integer.class, email)).isZero();
    }

    @Test
    void proxySecretIsRequiredAndHealthRemainsPublic() throws Exception {
        var client = HttpClient.newHttpClient();
        for (String secret : new String[] { "", "wrong-secret" }) {
            var builder = HttpRequest.newBuilder(uri("/api/v1/info")).GET();
            if (!secret.isEmpty()) builder.header("X-Origin-Verify", secret);
            assertThat(client.send(builder.build(), HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(403);
        }
        assertThat(client.send(HttpRequest.newBuilder(uri("/actuator/health")).GET().build(),
            HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(200);
        assertThat(new Browser().send("GET", "/api/v1/info", null, null).statusCode()).isEqualTo(200);
    }

    @Test
    void googleAuthorizationRedirectContainsStateAndRejectsMissingStateCallback() throws Exception {
        var browser = new Browser();
        var start = browser.send("GET", "/api/v1/auth/oauth2/authorization/google", null, null);
        assertThat(start.statusCode()).isEqualTo(302);
        String location = start.headers().firstValue("location").orElseThrow();
        assertThat(location).startsWith("https://accounts.google.com/").contains("state=", "nonce=", "code_challenge=");
        String redirectUri = java.util.Arrays.stream(URI.create(location).getRawQuery().split("&"))
            .filter(parameter -> parameter.startsWith("redirect_uri="))
            .map(parameter -> java.net.URLDecoder.decode(parameter.substring("redirect_uri=".length()), java.nio.charset.StandardCharsets.UTF_8))
            .findFirst().orElseThrow();
        assertThat(redirectUri).isEqualTo("https://game.example.test/api/v1/auth/oauth2/callback/google");
        var callback = browser.send("GET", "/api/v1/auth/oauth2/callback/google?code=invalid", null, null);
        assertThat(callback.statusCode()).isEqualTo(302);
        assertThat(callback.headers().firstValue("location").orElseThrow()).contains("authError=google");
        assertThat(browser.send("GET", "/api/v1/auth/me", null, null).statusCode()).isEqualTo(401);
    }

    @Test
    void googleRequiresVerifiedEmailAndNeverLinksExistingEmailAutomatically() {
        assertThatThrownBy(() -> google.provision(identity("unverified", "unverified@example.test", false)))
            .isInstanceOf(OAuth2AuthenticationException.class);
        assertThatThrownBy(() -> google.provision(identity("collision", EMAIL, true)))
            .isInstanceOf(OAuth2AuthenticationException.class);
        var identity = identity("google-stable-subject", "google@example.test", true);
        var first = google.provision(identity);
        var second = google.provision(identity);
        assertThat(first.getAuthorities()).extracting(Object::toString).containsExactly("ROLE_CUSTOMER");
        assertThat(second.getSubject()).isEqualTo(first.getSubject());
        assertThat(users.findByGoogleSubject(identity.getSubject()).orElseThrow().getPasswordHash()).isNull();
    }

    DefaultOidcUser identity(String sub, String email, boolean verified) {
        var token = new OidcIdToken("test-token", Instant.now(), Instant.now().plusSeconds(60),
            Map.of("sub", sub, "email", email, "email_verified", verified, "name", "Google Member"));
        return new DefaultOidcUser(java.util.List.of(), token);
    }

    String login(String password) { return "{\"email\":\"" + EMAIL + "\",\"password\":\"" + password + "\"}"; }
    URI uri(String path) { return URI.create("http://localhost:" + port + path); }

    class Browser {
        final HttpClient client = HttpClient.newHttpClient();
        String cookie = "";
        HttpResponse<String> send(String method, String path, String body, String csrf) throws Exception {
            var request = HttpRequest.newBuilder(uri(path)).header("X-Origin-Verify", SECRET);
            if (!cookie.isEmpty()) request.header("Cookie", cookie);
            if (csrf != null) request.header("X-XSRF-TOKEN", csrf);
            if (body != null) request.header("Content-Type", "application/json");
            request.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
            var response = client.send(request.build(), HttpResponse.BodyHandlers.ofString());
            for (String value : response.headers().allValues("set-cookie")) {
                String pair = value.split(";", 2)[0];
                String name = pair.split("=", 2)[0];
                var pairs = new java.util.LinkedHashMap<String, String>();
                for (String existing : cookie.split("; ")) {
                    if (existing.contains("=")) pairs.put(existing.split("=", 2)[0], existing);
                }
                pairs.put(name, pair);
                cookie = String.join("; ", pairs.values());
            }
            return response;
        }
        String csrf() throws Exception {
            var response = send("GET", "/api/v1/auth/csrf", null, null);
            assertThat(response.statusCode()).isEqualTo(200);
            var matcher = Pattern.compile("\\\"token\\\":\\\"([^\\\"]+)\\\"").matcher(response.body());
            assertThat(matcher.find()).isTrue();
            return matcher.group(1);
        }
    }
}
