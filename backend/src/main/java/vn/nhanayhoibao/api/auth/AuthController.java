package vn.nhanayhoibao.api.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.*;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;
import vn.nhanayhoibao.api.config.SecurityConfig;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final AuthenticationManager authentications;
    private final SecurityContextRepository contexts;
    private final SessionAuthenticationStrategy sessions;
    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final boolean googleEnabled;
    private final JwtService jwt;

    public AuthController(AuthenticationManager authentications, SecurityContextRepository contexts,
            SessionAuthenticationStrategy sessions, UserRepository users, PasswordEncoder passwordEncoder, JwtService jwt,
            @Value("${app.auth.google.enabled:false}") boolean googleEnabled) {
        this.authentications = authentications;
        this.contexts = contexts;
        this.sessions = sessions;
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.googleEnabled = googleEnabled;
        this.jwt = jwt;
    }

    @GetMapping("/csrf")
    public ResponseEntity<CsrfResponse> csrf(CsrfToken csrf) {
        return noStore(new CsrfResponse(csrf.getHeaderName(), csrf.getToken()));
    }

    @GetMapping("/config")
    public ResponseEntity<AuthConfig> config() {
        return noStore(new AuthConfig(true, googleEnabled,
            googleEnabled ? "/api/v1/auth/oauth2/authorization/google" : null));
    }

    @PostMapping(value = "/login", consumes = "application/json")
    public ResponseEntity<UserResponse> login(@Valid @RequestBody LoginRequest body,
            HttpServletRequest request, HttpServletResponse response) {
        if (body.password().getBytes(StandardCharsets.UTF_8).length > 72) throw new BadCredentialsException("Invalid credentials");
        // Capture the version before password verification: a concurrent reset must not mint a fresh valid JWT.
        var candidate = users.findByEmail(AccountService.normalizeEmail(body.email()));
        Authentication authentication = authentications.authenticate(
            UsernamePasswordAuthenticationToken.unauthenticated(AccountService.normalizeEmail(body.email()), body.password()));
        var user = candidate.orElseThrow(() -> new BadCredentialsException("Invalid credentials"));
        sessions.onAuthentication(authentication, request, response);
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        contexts.saveContext(context, request, response);
        jwt.issue(user, response);
        if (request.getSession(false) != null) request.getSession(false).invalidate();
        return noStore(userResponse(authentication));
    }

    @PostMapping(value = "/register", consumes = "application/json")
    public ResponseEntity<UserResponse> register(@Valid @RequestBody RegisterRequest body,
            HttpServletRequest request, HttpServletResponse response) {
        if (body.password().getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new BadCredentialsException("Invalid credentials");
        }
        String normalizedEmail = AccountService.normalizeEmail(body.email());
        if (users.findByEmail(normalizedEmail).isPresent()) {
            throw new IllegalArgumentException("Email already registered");
        }
        var user = new AppUser(
            normalizedEmail,
            passwordEncoder.encode(body.password()),
            null,
            body.displayName().trim(),
            "CUSTOMER"
        );
        users.save(user);

        Authentication authentication = authentications.authenticate(
            UsernamePasswordAuthenticationToken.unauthenticated(normalizedEmail, body.password()));
        sessions.onAuthentication(authentication, request, response);
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        contexts.saveContext(context, request, response);
        jwt.issue(user, response);
        if (request.getSession(false) != null) request.getSession(false).invalidate();
        return noStore(new UserResponse(user.getId(), user.getEmail(), user.getDisplayName(), user.getRole()));
    }

    @GetMapping("/me")
    public ResponseEntity<UserResponse> me(Authentication authentication) {
        return noStore(userResponse(authentication));
    }

    private UserResponse userResponse(Authentication authentication) {
        var account = authentication.getPrincipal() instanceof OidcUser oidc
            ? users.findByGoogleSubject(oidc.getSubject()) : users.findByEmail(authentication.getName());
        var user = account.filter(AppUser::isEnabled).orElseThrow(() -> new BadCredentialsException("Invalid credentials"));
        return new UserResponse(user.getId(), user.getEmail(), user.getDisplayName(), user.getRole());
    }

    @ExceptionHandler(AuthenticationException.class)
    void invalidCredentials(HttpServletResponse response) throws java.io.IOException {
        SecurityConfig.problem(response, 401, "Invalid credentials");
    }

    @ExceptionHandler(IllegalArgumentException.class)
    void illegalArgument(HttpServletResponse response, IllegalArgumentException ex) throws java.io.IOException {
        SecurityConfig.problem(response, 400, ex.getMessage());
    }

    private static <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    public record LoginRequest(@NotBlank @Email @Size(max = 254) String email,
            @NotBlank @Size(max = 72) String password) {
        @Override public String toString() { return "LoginRequest[redacted]"; }
    }
    public record RegisterRequest(
        @NotBlank @Size(max = 120) String displayName,
        @NotBlank @Email @Size(max = 254) String email,
        @NotBlank @Size(min = 6, max = 72) String password) {
        @Override public String toString() { return "RegisterRequest[redacted]"; }
    }
    public record UserResponse(UUID id, String email, String displayName, String role) {}
    public record CsrfResponse(String headerName, String token) {}
    public record AuthConfig(boolean password, boolean google, String googleLoginUrl) {}
}
