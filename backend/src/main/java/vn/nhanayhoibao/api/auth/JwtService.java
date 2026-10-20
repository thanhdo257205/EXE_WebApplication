package vn.nhanayhoibao.api.auth;

import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.*;
import com.nimbusds.jwt.*;
import jakarta.servlet.http.HttpServletResponse;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Service;

@Service
public class JwtService {
    public static final String COOKIE = "AUTH_TOKEN";
    private static final String ISSUER = "exe-web-api";
    private static final String AUDIENCE = "exe-web";
    private final byte[] key;
    private final boolean secure;
    private final JdbcTemplate db;

    public JwtService(JdbcTemplate db, @Value("${app.auth.jwt.secret:}") String secret,
            @Value("${app.auth.jwt.required:false}") boolean required,
            @Value("${server.servlet.session.cookie.secure:false}") boolean secure) {
        this.db = db;
        this.secure = secure;
        if (secret.isBlank()) {
            if (required) throw new IllegalStateException("JWT_SECRET is required in production");
            key = new byte[32]; new SecureRandom().nextBytes(key);
        } else {
            try { key = Base64.getDecoder().decode(secret); }
            catch (IllegalArgumentException invalid) { throw new IllegalStateException("JWT_SECRET must be Base64-encoded random bytes"); }
            if (key.length < 32) throw new IllegalStateException("JWT_SECRET must contain at least 32 random bytes");
        }
    }

    public void issue(AppUser user, HttpServletResponse response) {
        Instant now = Instant.now();
        var claims = new JWTClaimsSet.Builder().issuer(ISSUER).audience(AUDIENCE)
            .subject(user.getId().toString()).jwtID(UUID.randomUUID().toString())
            .issueTime(Date.from(now)).expirationTime(Date.from(now.plusSeconds(1800)))
            .claim("ver", user.getAuthVersion()).build();
        try {
            var jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.HS256).type(JOSEObjectType.JWT).build(), claims);
            jwt.sign(new MACSigner(key));
            cookie(response, jwt.serialize(), Duration.ofMinutes(30));
        } catch (JOSEException impossible) { throw new IllegalStateException("Cannot issue authentication token"); }
    }

    public Authentication authenticate(String value) {
        if (value == null || value.length() > 2048) return null;
        try {
            var jwt = SignedJWT.parse(value);
            if (!JWSAlgorithm.HS256.equals(jwt.getHeader().getAlgorithm())
                    || !JOSEObjectType.JWT.equals(jwt.getHeader().getType()) || !jwt.verify(new MACVerifier(key))) return null;
            var claims = jwt.getJWTClaimsSet();
            Instant now = Instant.now();
            if (!ISSUER.equals(claims.getIssuer()) || !List.of(AUDIENCE).equals(claims.getAudience())
                    || claims.getExpirationTime() == null || !claims.getExpirationTime().toInstant().isAfter(now)
                    || claims.getIssueTime() == null || claims.getIssueTime().toInstant().isAfter(now.plusSeconds(30))
                    || claims.getJWTID() == null || claims.getSubject() == null || claims.getLongClaim("ver") == null) return null;
            UUID id = UUID.fromString(claims.getSubject());
            long version = claims.getLongClaim("ver");
            var rows = db.queryForList("SELECT email,role,enabled,auth_version FROM app_users WHERE id=?", id);
            if (rows.isEmpty()) return null;
            var user = rows.getFirst();
            if (!Boolean.TRUE.equals(user.get("enabled")) || ((Number) user.get("auth_version")).longValue() != version) return null;
            return UsernamePasswordAuthenticationToken.authenticated(new JwtPrincipal(id, (String) user.get("email"), version),
                null, List.of(new SimpleGrantedAuthority("ROLE_" + user.get("role"))));
        } catch (java.text.ParseException | JOSEException | IllegalArgumentException invalid) { return null; }
    }

    public void revoke(Authentication authentication) {
        if (authentication != null && authentication.getPrincipal() instanceof JwtPrincipal user) {
            db.update("UPDATE app_users SET auth_version=auth_version+1 WHERE id=? AND auth_version=?", user.id(), user.version());
        }
    }

    public void clear(HttpServletResponse response) { cookie(response, "", Duration.ZERO); }

    private void cookie(HttpServletResponse response, String value, Duration age) {
        response.addHeader(HttpHeaders.SET_COOKIE, ResponseCookie.from(COOKIE, value).httpOnly(true)
            .secure(secure).sameSite("Lax").path("/api").maxAge(age).build().toString());
    }

    public record JwtPrincipal(UUID id, String email, long version) implements java.security.Principal {
        @Override public String getName() { return email; }
    }
}
