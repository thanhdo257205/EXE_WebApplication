package vn.nhanayhoibao.api.auth;

import java.nio.charset.StandardCharsets;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class BootstrapAdmin implements ApplicationRunner {
    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final String email;
    private final String password;

    public BootstrapAdmin(UserRepository users, PasswordEncoder encoder,
            @Value("${app.auth.bootstrap-email:}") String email,
            @Value("${app.auth.bootstrap-password:}") String password) {
        this.users = users;
        this.encoder = encoder;
        this.email = email;
        this.password = password;
    }

    @Override
    public void run(ApplicationArguments arguments) {
        if (email.isBlank() && password.isBlank()) return;
        if (!email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+") || email.length() > 254
                || password.length() < 12 || password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new IllegalStateException("Bootstrap requires an email and a 12+ character password (max 72 UTF-8 bytes)");
        }
        var normalized = AccountService.normalizeEmail(email);
        // Never reset passwords or grant roles to an existing account through environment variables.
        if (users.findByEmail(normalized).isEmpty()) {
            users.save(new AppUser(normalized, encoder.encode(password), null, "Administrator", "ADMIN"));
        }
    }
}
