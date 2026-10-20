package vn.nhanayhoibao.api.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.*;
import java.io.IOException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

// Constructed inside the SecurityFilterChain, not registered as a servlet filter.
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    private final JwtService jwt;
    public JwtAuthenticationFilter(JwtService jwt) { this.jwt = jwt; }

    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        if (request.getCookies() != null) {
            for (var cookie : request.getCookies()) {
                if (JwtService.COOKIE.equals(cookie.getName())) {
                    var authentication = jwt.authenticate(cookie.getValue());
                    if (authentication != null) {
                        var context = SecurityContextHolder.createEmptyContext();
                        context.setAuthentication(authentication);
                        SecurityContextHolder.setContext(context);
                    }
                    break;
                }
            }
        }
        chain.doFilter(request, response);
    }
}
