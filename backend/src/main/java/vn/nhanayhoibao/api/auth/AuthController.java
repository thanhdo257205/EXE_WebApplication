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
    private final boolean googleEnabled;

    public AuthController(AuthenticationManager authentications, SecurityContextRepository contexts,
            SessionAuthenticationStrategy sessions, UserRepository users,
            @Value("${app.auth.google.enabled:false}") boolean googleEnabled) {
        this.authentications = authentications;
        this.contexts = contexts;
        this.sessions = sessions;
        this.users = users;
        this.googleEnabled = googleEnabled;
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
        Authentication authentication = authentications.authenticate(
            UsernamePasswordAuthenticationToken.unauthenticated(AccountService.normalizeEmail(body.email()), body.password()));
        sessions.onAuthentication(authentication, request, response);
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        contexts.saveContext(context, request, response);
        return noStore(userResponse(authentication));
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

    private static <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    public record LoginRequest(@NotBlank @Email @Size(max = 254) String email,
            @NotBlank @Size(max = 72) String password) {
        @Override public String toString() { return "LoginRequest[redacted]"; }
    }
    public record UserResponse(UUID id, String email, String displayName, String role) {}
    public record CsrfResponse(String headerName, String token) {}
    public record AuthConfig(boolean password, boolean google, String googleLoginUrl) {}
}
