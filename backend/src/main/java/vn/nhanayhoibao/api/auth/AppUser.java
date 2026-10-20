package vn.nhanayhoibao.api.auth;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "app_users")
public class AppUser {
    @Id
    private UUID id;
    @Column(nullable = false, unique = true, length = 254)
    private String email;
    @Column(name = "password_hash", length = 100)
    private String passwordHash;
    @Column(name = "google_subject", unique = true)
    private String googleSubject;
    @Column(name = "display_name", nullable = false, length = 120)
    private String displayName;
    @Column(nullable = false, length = 20)
    private String role;
    @Column(nullable = false)
    private boolean enabled = true;
    @Column(name = "auth_version", nullable = false)
    private long authVersion;

    protected AppUser() {}

    public AppUser(String email, String passwordHash, String googleSubject, String displayName, String role) {
        this.id = UUID.randomUUID();
        this.email = email;
        this.passwordHash = passwordHash;
        this.googleSubject = googleSubject;
        this.displayName = displayName;
        this.role = role;
    }

    public UUID getId() { return id; }
    public String getEmail() { return email; }
    public String getPasswordHash() { return passwordHash; }
    public String getGoogleSubject() { return googleSubject; }
    public String getDisplayName() { return displayName; }
    public String getRole() { return role; }
    public boolean isEnabled() { return enabled; }
    public long getAuthVersion() { return authVersion; }
}
