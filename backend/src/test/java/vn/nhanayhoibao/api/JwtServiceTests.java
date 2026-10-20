package vn.nhanayhoibao.api;

import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import vn.nhanayhoibao.api.auth.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class JwtServiceTests {
    final byte[] key = new byte[32];
    final JdbcTemplate db = mock(JdbcTemplate.class);
    final JwtService service = new JwtService(db, Base64.getEncoder().encodeToString(key), true, true);

    @Test void signedCookieAuthenticatesAndChecksCurrentAccountVersionAndRole() {
        var user = new AppUser("member@example.test", "hash", null, "Member", "CUSTOMER");
        var response = new MockHttpServletResponse();
        service.issue(user, response);
        String cookie = response.getHeader("Set-Cookie");
        assertThat(cookie).contains("HttpOnly", "Secure", "SameSite=Lax", "Path=/api", "Max-Age=1800");
        String token = cookie.split(";", 2)[0].substring("AUTH_TOKEN=".length());
        when(db.queryForList(anyString(), eq(user.getId()))).thenReturn(List.of(Map.of("email", user.getEmail(),
            "role", "ADMIN", "enabled", true, "auth_version", 0L)));
        var auth = service.authenticate(token);
        assertThat(auth.getName()).isEqualTo(user.getEmail());
        assertThat(auth.getAuthorities()).extracting(Object::toString).containsExactly("ROLE_ADMIN");
        service.revoke(auth);
        verify(db).update(anyString(), eq(user.getId()), eq(0L));
        when(db.queryForList(anyString(), eq(user.getId()))).thenReturn(List.of(Map.of("email", user.getEmail(),
            "role", "CUSTOMER", "enabled", true, "auth_version", 1L)));
        assertThat(service.authenticate(token)).isNull();
    }

    String signed(String issuer, String audience, Instant expiry, JWSAlgorithm algorithm, byte[] signingKey) throws Exception {
        var jwt = new SignedJWT(new JWSHeader.Builder(algorithm).type(JOSEObjectType.JWT).build(),
            new JWTClaimsSet.Builder().issuer(issuer).audience(audience).subject(UUID.randomUUID().toString())
                .jwtID(UUID.randomUUID().toString()).issueTime(new Date()).expirationTime(Date.from(expiry)).claim("ver", 0L).build());
        jwt.sign(new MACSigner(signingKey)); return jwt.serialize();
    }

    @Test void rejectsExpiredWrongIssuerAudienceSignatureAlgorithmAndMalformedTokensBeforeDatabase() throws Exception {
        assertThat(service.authenticate(signed("exe-web-api", "exe-web", Instant.now().minusSeconds(1), JWSAlgorithm.HS256, key))).isNull();
        assertThat(service.authenticate(signed("other", "exe-web", Instant.now().plusSeconds(60), JWSAlgorithm.HS256, key))).isNull();
        assertThat(service.authenticate(signed("exe-web-api", "other", Instant.now().plusSeconds(60), JWSAlgorithm.HS256, key))).isNull();
        var otherKey = new byte[32]; Arrays.fill(otherKey, (byte) 1);
        assertThat(service.authenticate(signed("exe-web-api", "exe-web", Instant.now().plusSeconds(60), JWSAlgorithm.HS256, otherKey))).isNull();
        assertThat(service.authenticate(signed("exe-web-api", "exe-web", Instant.now().plusSeconds(60), JWSAlgorithm.HS384, new byte[48]))).isNull();
        assertThat(service.authenticate("invalid")).isNull();
        assertThat(service.authenticate("x".repeat(2049))).isNull();
        verifyNoInteractions(db);
    }

    @Test void productionRequiresStrongConfiguredSigningKey() {
        assertThatThrownBy(() -> new JwtService(db, "", true, true)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new JwtService(db, "not-base64", true, true)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new JwtService(db, Base64.getEncoder().encodeToString(new byte[16]), true, true)).isInstanceOf(IllegalStateException.class);
    }
}
