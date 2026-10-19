package vn.nhanayhoibao.api.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.oauth2.client.CommonOAuth2Provider;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;

@Configuration
@ConditionalOnProperty(name = "app.auth.google.enabled", havingValue = "true")
public class GoogleConfig {
    @Bean
    ClientRegistrationRepository clientRegistrationRepository(
            @Value("${GOOGLE_CLIENT_ID}") String clientId,
            @Value("${GOOGLE_CLIENT_SECRET}") String clientSecret,
            @Value("${GOOGLE_REDIRECT_URI:}") String redirectUri) {
        if (clientId.isBlank() || clientSecret.isBlank()) throw new IllegalStateException("Google credentials required");
        var google = CommonOAuth2Provider.GOOGLE.getBuilder("google")
            .clientId(clientId).clientSecret(clientSecret)
            .redirectUri(redirectUri.isBlank()
                ? "{baseUrl}/api/v1/auth/oauth2/callback/{registrationId}" : redirectUri)
            .scope("openid", "profile", "email").build();
        return new InMemoryClientRegistrationRepository(google);
    }
}
