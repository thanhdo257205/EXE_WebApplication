package vn.nhanayhoibao.api.auth;

import java.util.Locale;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class AccountService implements UserDetailsService {
    private final UserRepository users;

    public AccountService(UserRepository users) { this.users = users; }

    public static String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    @Override
    public UserDetails loadUserByUsername(String email) {
        var account = users.findByEmail(normalizeEmail(email))
            .filter(user -> user.getPasswordHash() != null)
            .orElseThrow(() -> new UsernameNotFoundException("Invalid credentials"));
        return User.withUsername(account.getEmail()).password(account.getPasswordHash())
            .roles(account.getRole()).disabled(!account.isEnabled()).build();
    }
}
