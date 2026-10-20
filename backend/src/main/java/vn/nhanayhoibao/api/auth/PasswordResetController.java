package vn.nhanayhoibao.api.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/auth")
public class PasswordResetController {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(PasswordResetController.class);
    private final PasswordResetService service;
    private final JwtService jwt;
    private final ThreadPoolTaskExecutor executor;

    public PasswordResetController(PasswordResetService service, JwtService jwt) {
        this.service = service;
        this.jwt = jwt;
        executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(2);
        executor.setQueueCapacity(20);
        executor.setThreadNamePrefix("password-mail-");
        executor.initialize();
    }

    @jakarta.annotation.PreDestroy
    void shutdown() { executor.shutdown(); }

    @PostMapping(value = "/forgot-password", consumes = "application/json")
    public ResponseEntity<?> forgot(@Valid @RequestBody ForgotRequest body) {
        if (!service.enabled()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Password recovery unavailable");
        try {
            executor.execute(() -> {
                try { service.request(body.email()); }
                catch (RuntimeException failure) {
                    // Never log recipient, raw link, provider response or exception message.
                    log.warn("Password recovery delivery failed; check mail service configuration and availability");
                }
            });
        } catch (org.springframework.core.task.TaskRejectedException full) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Password recovery busy");
        }
        return ResponseEntity.accepted().cacheControl(CacheControl.noStore()).body(Map.of("message",
            "Nếu email thuộc tài khoản dùng mật khẩu, bạn sẽ nhận được liên kết khôi phục. Hãy kiểm tra cả thư rác."));
    }

    @PostMapping(value = "/reset-password", consumes = "application/json")
    public ResponseEntity<Void> reset(@Valid @RequestBody ResetRequest body, jakarta.servlet.http.HttpServletResponse response) {
        service.reset(body.token(), body.password());
        jwt.clear(response);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    public record ForgotRequest(@NotBlank @Email @Size(max = 254) String email) {
        @Override public String toString() { return "ForgotRequest[redacted]"; }
    }
    public record ResetRequest(@NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{43}") String token,
            @NotBlank @Size(min = 8, max = 72) String password) {
        @Override public String toString() { return "ResetRequest[redacted]"; }
    }
}
