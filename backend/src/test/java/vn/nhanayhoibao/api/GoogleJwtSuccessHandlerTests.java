package vn.nhanayhoibao.api;

import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import vn.nhanayhoibao.api.auth.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class GoogleJwtSuccessHandlerTests {
    @Test void googleIdentityIssuesJwtAndRemovesTemporaryOauthSession() throws Exception {
        var users = mock(UserRepository.class);
        var jwt = mock(JwtService.class);
        var identity = mock(OidcUser.class);
        when(identity.getSubject()).thenReturn("google-subject");
        var user = new AppUser("google@example.test", null, "google-subject", "Google", "CUSTOMER");
        when(users.findByGoogleSubject("google-subject")).thenReturn(Optional.of(user));
        var request = new MockHttpServletRequest();
        var session = new MockHttpSession(); request.setSession(session);
        var response = new MockHttpServletResponse();
        new GoogleJwtSuccessHandler(jwt, users).onAuthenticationSuccess(request, response,
            UsernamePasswordAuthenticationToken.authenticated(identity, null, java.util.List.of()));
        verify(jwt).issue(user, response);
        assertThat(session.isInvalid()).isTrue();
        assertThat(response.getRedirectedUrl()).isEqualTo("/");
    }
}
