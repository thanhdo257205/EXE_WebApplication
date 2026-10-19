package vn.nhanayhoibao.api.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class OriginProxyFilter extends OncePerRequestFilter {
    private final boolean required;
    private final byte[] secret;

    public OriginProxyFilter(@Value("${app.proxy.required:false}") boolean required,
            @Value("${app.proxy.secret:}") String secret) {
        if (required && secret.length() < 32) throw new IllegalStateException("Proxy secret must contain at least 32 characters");
        this.required = required;
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        boolean health = "GET".equals(request.getMethod()) && "/actuator/health".equals(request.getRequestURI());
        String supplied = request.getHeader("X-Origin-Verify");
        if (required && !health && (supplied == null || !MessageDigest.isEqual(secret, supplied.getBytes(StandardCharsets.UTF_8)))) {
            SecurityConfig.problem(response, 403, "Proxy required");
            return;
        }
        chain.doFilter(request, response);
    }
}
