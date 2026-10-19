package vn.nhanayhoibao.api.auth;

import java.util.List;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Service;

@Service
public class GoogleAccountService implements OAuth2UserService<OidcUserRequest, OidcUser> {
    private final UserRepository users;
    private final OidcUserService delegate = new OidcUserService();
    public GoogleAccountService(UserRepository users) { this.users = users; }

    @Override
    public OidcUser loadUser(OidcUserRequest request) {
        return provision(delegate.loadUser(request));
    }

    public OidcUser provision(OidcUser identity) {
        if (!Boolean.TRUE.equals(identity.getEmailVerified()) || identity.getEmail() == null
                || identity.getSubject() == null || identity.getSubject().isBlank()) {
            throw new OAuth2AuthenticationException("unverified_identity");
        }
        String email = AccountService.normalizeEmail(identity.getEmail());
        if (email.length() > 254) throw new OAuth2AuthenticationException("invalid_identity");
        var user = users.findByGoogleSubject(identity.getSubject()).orElseGet(() -> {
            // Linking by email without the existing user's consent risks account takeover.
            if (users.findByEmail(email).isPresent()) throw new OAuth2AuthenticationException("account_link_required");
            String name = identity.getFullName() == null ? email : identity.getFullName();
            try {
                return users.save(new AppUser(email, null, identity.getSubject(),
                    name.substring(0, Math.min(name.length(), 120)), "CUSTOMER"));
            } catch (org.springframework.dao.DataIntegrityViolationException collision) {
                throw new OAuth2AuthenticationException("identity_conflict");
            }
        });
        if (!user.isEnabled()) throw new OAuth2AuthenticationException("account_disabled");
        return new DefaultOidcUser(List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole())),
            identity.getIdToken(), identity.getUserInfo(), "sub");
    }
}
