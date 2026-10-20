package vn.nhanayhoibao.api.auth;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PasswordResetService {
    private final JdbcTemplate db;
    private final TransactionTemplate tx;
    private final PasswordEncoder encoder;
    private final PasswordResetMailer mailer;
    private final String publicOrigin;
    private final SecureRandom random = new SecureRandom();

    public PasswordResetService(JdbcTemplate db, org.springframework.transaction.PlatformTransactionManager manager,
            PasswordEncoder encoder, PasswordResetMailer mailer,
            @Value("${app.auth.password-reset.public-origin:http://localhost:4200}") String publicOrigin) {
        this.db = db;
        this.tx = new TransactionTemplate(manager);
        this.encoder = encoder;
        this.mailer = mailer;
        var origin = URI.create(publicOrigin);
        boolean local = "http".equals(origin.getScheme()) && ("localhost".equals(origin.getHost()) || "127.0.0.1".equals(origin.getHost()));
        if (origin.getHost() == null || (!"https".equals(origin.getScheme()) && !local)
                || origin.getUserInfo() != null || origin.getQuery() != null || origin.getFragment() != null
                || !(origin.getPath().isEmpty() || "/".equals(origin.getPath()))) {
            throw new IllegalStateException("Invalid password recovery public origin");
        }
        this.publicOrigin = publicOrigin.replaceAll("/$", "");
    }

    public boolean enabled() { return mailer.enabled(); }

    // Called on a bounded worker so the public response does not disclose account existence by mail latency.
    public void request(String email) {
        if (!enabled()) return;
        tx.executeWithoutResult(status -> {
            var users = db.queryForList("SELECT * FROM app_users WHERE email=? FOR UPDATE", AccountService.normalizeEmail(email));
            if (users.isEmpty()) return;
            var user = users.getFirst();
            // Recovery must never add a password to an account that only uses Google.
            if (!Boolean.TRUE.equals(user.get("enabled")) || user.get("password_hash") == null) return;
            UUID id = (UUID) user.get("id");
            Instant now = Instant.now();
            if (db.queryForObject("SELECT COUNT(*) FROM password_reset_tokens WHERE user_id=? AND requested_at>?",
                    Integer.class, id, Timestamp.from(now.minusSeconds(60))) > 0) return;
            byte[] bytes = new byte[32];
            random.nextBytes(bytes);
            String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
            db.update("DELETE FROM password_reset_tokens WHERE user_id=?", id);
            db.update("INSERT INTO password_reset_tokens(user_id,token_hash,requested_at,expires_at) VALUES (?,?,?,?)",
                id, digest(token), Timestamp.from(now), Timestamp.from(now.plusSeconds(900)));
            // A failed send rolls back replacement, preserving the previous valid link.
            // The link cannot be consumed until this transaction commits.
            mailer.send((String) user.get("email"), publicOrigin + "/dat-lai-mat-khau#token=" + token);
        });
    }

    public void reset(String token, String password) {
        if (!enabled()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Password recovery unavailable");
        if (!token.matches("[A-Za-z0-9_-]{43}") || password.isBlank() || password.length() < 8
                || password.getBytes(StandardCharsets.UTF_8).length > 72) throw invalid();
        String hash = digest(token);
        tx.executeWithoutResult(status -> {
            var candidates = db.queryForList("SELECT user_id FROM password_reset_tokens WHERE token_hash=?", hash);
            if (candidates.isEmpty()) throw invalid();
            UUID id = (UUID) candidates.getFirst().get("user_id");
            // Same lock order as issuance; serialize concurrent resets/resends for this account.
            var user = db.queryForMap("SELECT * FROM app_users WHERE id=? FOR UPDATE", id);
            if (!Boolean.TRUE.equals(user.get("enabled")) || user.get("password_hash") == null) throw invalid();
            if (db.queryForObject("SELECT COUNT(*) FROM password_reset_tokens WHERE user_id=? AND token_hash=? AND expires_at>?",
                    Integer.class, id, hash, Timestamp.from(Instant.now())) != 1) throw invalid();
            db.update("UPDATE app_users SET password_hash=?,auth_version=auth_version+1 WHERE id=?", encoder.encode(password), id);
            db.update("DELETE FROM password_reset_tokens WHERE user_id=?", id);
            // Password principals use email; OIDC principals use the stable Google subject.
            db.update("DELETE FROM SPRING_SESSION WHERE PRINCIPAL_NAME=? OR PRINCIPAL_NAME=?", user.get("email"), user.get("google_subject"));
        });
    }

    private static ResponseStatusException invalid() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid or expired recovery link");
    }

    static String digest(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
}
