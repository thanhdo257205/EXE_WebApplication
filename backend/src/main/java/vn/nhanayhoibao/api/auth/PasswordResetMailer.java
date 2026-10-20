package vn.nhanayhoibao.api.auth;

public interface PasswordResetMailer {
    boolean enabled();
    void send(String recipient, String resetUrl);
}
