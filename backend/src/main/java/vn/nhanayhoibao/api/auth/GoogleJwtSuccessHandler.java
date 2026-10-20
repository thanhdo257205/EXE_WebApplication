package vn.nhanayhoibao.api.auth;

import jakarta.servlet.http.*;
import java.io.IOException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;

public class GoogleJwtSuccessHandler implements AuthenticationSuccessHandler {
    private final JwtService jwt;
    private final UserRepository users;
    public GoogleJwtSuccessHandler(JwtService jwt, UserRepository users) { this.jwt = jwt; this.users = users; }

    @Override public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
            Authentication authentication) throws IOException {
        var oidc = (OidcUser) authentication.getPrincipal();
        var user = users.findByGoogleSubject(oidc.getSubject()).filter(AppUser::isEnabled)
            .orElseThrow(() -> new BadCredentialsException("Invalid credentials"));
        jwt.issue(user, response);
        if (request.getSession(false) != null) request.getSession(false).invalidate();
        response.sendRedirect("/");
    }
}
