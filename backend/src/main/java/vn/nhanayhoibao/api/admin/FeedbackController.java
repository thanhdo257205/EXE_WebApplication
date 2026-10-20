package vn.nhanayhoibao.api.admin;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.UUID;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import vn.nhanayhoibao.api.auth.JwtService;
import static vn.nhanayhoibao.api.admin.AdminContentModels.Actor;

@RestController
@RequestMapping("/api/v1")
public class FeedbackController {
    public enum Category { RULE_QUESTION, CARD_ISSUE, PLAYTEST, OTHER }
    public enum Status { NEW, IN_REVIEW, RESOLVED, REJECTED }
    public record Submit(UUID releaseId, UUID cardId, UUID pageId, @NotNull Category category,
        @NotBlank @Size(max=5000) String message, @Email @Size(max=254) String contactEmail) {}
    public record Moderate(@NotNull @PositiveOrZero Long expectedVersion, @NotNull Status status,
        @NotBlank @Size(max=2000) String moderationNote) {}
    private final FeedbackService service;
    public FeedbackController(FeedbackService service) { this.service=service; }
    private Actor actor(Authentication authentication) {
        if (authentication==null || !(authentication.getPrincipal() instanceof JwtService.JwtPrincipal user))
            throw new AdminContentException(HttpStatus.UNAUTHORIZED,"AUTH_REQUIRED","JWT authentication is required");
        return new Actor(user.id(),user.version());
    }
    private ResponseEntity<?> ok(Object body) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body); }
    @PostMapping("/feedback") public ResponseEntity<?> submit(@Valid @RequestBody Submit body, Authentication auth) {
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(service.submit(body,actor(auth)));
    }
    @GetMapping("/admin/feedback") public ResponseEntity<?> list(@RequestParam(defaultValue="0") int page,
            @RequestParam(defaultValue="20") int size, @RequestParam(required=false) Status status,
            @RequestParam(required=false) UUID releaseId, @RequestParam(required=false) Category category) {
        return ok(service.list(page,size,status,releaseId,category));
    }
    @GetMapping("/admin/feedback/{id}") public ResponseEntity<?> detail(@PathVariable UUID id) { return ok(service.detail(id)); }
    @PutMapping("/admin/feedback/{id}") public ResponseEntity<?> moderate(@PathVariable UUID id,
            @Valid @RequestBody Moderate body, Authentication auth) { return ok(service.moderate(id,body,actor(auth))); }
}
