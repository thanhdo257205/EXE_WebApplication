package vn.nhanayhoibao.api.config;

import java.util.Arrays;
import java.util.List;
import vn.nhanayhoibao.api.auth.AccountService;
import vn.nhanayhoibao.api.auth.GoogleAccountService;
import vn.nhanayhoibao.api.auth.JwtService;
import vn.nhanayhoibao.api.auth.JwtAuthenticationFilter;
import vn.nhanayhoibao.api.auth.UserRepository;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.authentication.logout.LogoutFilter;
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.session.CompositeSessionAuthenticationStrategy;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;

import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfAuthenticationStrategy;
import org.springframework.security.web.csrf.CsrfTokenRepository;

import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.web.cors.*;

@Configuration
public class SecurityConfig {
    @Bean
    PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(12); }

    @Bean
    AuthenticationManager authenticationManager(AccountService accounts, PasswordEncoder encoder) {
        var provider = new DaoAuthenticationProvider(accounts);
        provider.setPasswordEncoder(encoder);
        return new ProviderManager(provider);
    }

    @Bean
    SecurityContextRepository securityContextRepository() { return new RequestAttributeSecurityContextRepository(); }

    @Bean
    CsrfTokenRepository csrfTokenRepository(@Value("${server.servlet.session.cookie.secure:false}") boolean secure) {
        var repository = new CookieCsrfTokenRepository();
        repository.setCookiePath("/api");
        repository.setCookieCustomizer(cookie -> cookie.httpOnly(true).secure(secure).sameSite("Lax"));
        repository.setHeaderName("X-XSRF-TOKEN");
        return repository;
    }

    @Bean
    SessionAuthenticationStrategy sessionAuthenticationStrategy(CsrfTokenRepository csrf) {
        return new CompositeSessionAuthenticationStrategy(List.of(
            new CsrfAuthenticationStrategy(csrf)));
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, SecurityContextRepository contexts,
            CsrfTokenRepository csrf, GoogleAccountService googleAccounts,
            ObjectProvider<ClientRegistrationRepository> registrations, JwtService jwt, UserRepository users) throws Exception {
        http.cors(cors -> {})
            .securityContext(context -> context.securityContextRepository(contexts))
            .csrf(config -> config.csrfTokenRepository(csrf).ignoringRequestMatchers(
                org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher.withDefaults()
                    .matcher(HttpMethod.POST, "/api/v1/payments/payos/webhook"),
                org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher.withDefaults()
                    .matcher(HttpMethod.POST, "/api/v1/internal/payments/reconcile")))
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .addFilterBefore(new JwtAuthenticationFilter(jwt), LogoutFilter.class)
            .requestCache(cache -> cache.disable())
            .formLogin(form -> form.disable())
            .httpBasic(basic -> basic.disable())
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(request -> request.getDispatcherType()==jakarta.servlet.DispatcherType.ASYNC
                    && request.getRequestURI().equals("/api/v1/admin/notifications/stream")).permitAll()
                .requestMatchers(HttpMethod.GET, "/api/v1/info", "/actuator/health",
                    "/api/v1/auth/csrf", "/api/v1/auth/config", "/api/v1/payments/config").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/v1/payments/payos/webhook", "/api/v1/internal/payments/reconcile").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/v1/payments/return/*").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/v1/content/**", "/api/v1/shop/products").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/v1/checkout", "/api/v1/orders/*/refresh-payment", "/api/v1/feedback").authenticated()
                .requestMatchers(HttpMethod.GET, "/api/v1/orders", "/api/v1/orders/*").authenticated()
                .requestMatchers(HttpMethod.POST, "/api/v1/auth/login", "/api/v1/auth/register",
                    "/api/v1/auth/forgot-password", "/api/v1/auth/reset-password").permitAll()
                .requestMatchers("/api/v1/auth/oauth2/**").permitAll()
                .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                .requestMatchers("/api/v1/auth/me").authenticated()
                .anyRequest().denyAll())
            .logout(logout -> logout.logoutUrl("/api/v1/auth/logout")
                .addLogoutHandler((request, response, authentication) -> { jwt.revoke(authentication); jwt.clear(response); })
                .invalidateHttpSession(true).clearAuthentication(true).deleteCookies("SESSION")
                .logoutSuccessHandler((request, response, authentication) -> response.setStatus(204)))
            .exceptionHandling(errors -> errors
                .authenticationEntryPoint((request, response, exception) -> problem(response, 401, "Unauthorized"))
                .accessDeniedHandler((request, response, exception) -> problem(response, 403, "Forbidden")));
        if (registrations.getIfAvailable() != null) {
            http.oauth2Login(oauth -> oauth
                .authorizationEndpoint(endpoint -> endpoint.baseUri("/api/v1/auth/oauth2/authorization"))
                .redirectionEndpoint(endpoint -> endpoint.baseUri("/api/v1/auth/oauth2/callback/*"))
                .userInfoEndpoint(info -> info.oidcUserService(googleAccounts))
                .securityContextRepository(contexts)
                .authorizedClientRepository(new vn.nhanayhoibao.api.auth.DiscardingOAuth2AuthorizedClientRepository())
                .successHandler(new vn.nhanayhoibao.api.auth.GoogleJwtSuccessHandler(jwt, users))
                .failureHandler((request, response, exception) -> {
                    if (request.getSession(false) != null) request.getSession(false).invalidate();
                    response.sendRedirect("/dang-nhap?authError=google");
                }));
        }
        return http.build();
    }

    public static void problem(jakarta.servlet.http.HttpServletResponse response, int status, String title)
            throws java.io.IOException {
        response.setStatus(status);
        response.setContentType("application/problem+json");
        response.setHeader("Cache-Control", "no-store");
        response.getWriter().write("{\"type\":\"about:blank\",\"title\":\"" + title + "\",\"status\":" + status + "}");
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(@Value("${app.cors.allowed-origins}") String allowedOrigins) {
        var configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(Arrays.stream(allowedOrigins.split(","))
            .map(String::trim).filter(origin -> !origin.isEmpty()).toList());
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("Content-Type", "X-XSRF-TOKEN", "X-Turnstile-Token"));
        configuration.setAllowCredentials(true);
        var source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
