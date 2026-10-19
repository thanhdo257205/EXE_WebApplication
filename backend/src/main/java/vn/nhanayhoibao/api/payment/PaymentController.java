package vn.nhanayhoibao.api.payment;

import jakarta.validation.Valid;
import java.util.*;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import vn.nhanayhoibao.api.auth.*;

@RestController
@RequestMapping("/api/v1")
public class PaymentController {
    private final PaymentService payments;
    private final UserRepository users;
    public PaymentController(PaymentService payments,UserRepository users) { this.payments=payments; this.users=users; }
    private AppUser user(Authentication authentication) {
        var found=authentication.getPrincipal() instanceof OidcUser oidc ? users.findByGoogleSubject(oidc.getSubject())
            : users.findByEmail(authentication.getName());
        return found.filter(AppUser::isEnabled).orElseThrow(()->new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }
    private static <T> ResponseEntity<T> response(T body) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body); }
    @GetMapping("/payments/config")
    public ResponseEntity<?> config() { return response(Map.of("provider","PAYOS","enabled",payments.ready())); }
    @PostMapping(value="/checkout",consumes="application/json")
    public ResponseEntity<?> checkout(@Valid @RequestBody CheckoutRequest body,Authentication authentication) {
        var user=user(authentication); return response(payments.checkout(user.getId(),user.getEmail(),body));
    }
    @GetMapping("/orders")
    public ResponseEntity<?> orders(Authentication authentication) { return response(payments.orders(user(authentication).getId())); }
    @GetMapping("/orders/{id}")
    public ResponseEntity<?> order(@PathVariable UUID id,Authentication authentication) { return response(payments.view(id,user(authentication).getId())); }
    @PostMapping("/orders/{id}/refresh-payment")
    public ResponseEntity<?> refresh(@PathVariable UUID id,Authentication authentication) { return response(payments.refresh(id,user(authentication).getId())); }
    @PostMapping(value="/payments/payos/webhook",consumes="application/json")
    public ResponseEntity<?> webhook(@RequestBody String body) { payments.webhook(body); return response(Map.of("received",true)); }
    // Reachable only by the internal Worker scheduled handler, protected by OriginProxyFilter.
    @PostMapping("/internal/payments/reconcile")
    public ResponseEntity<?> reconcile() { return response(Map.of("checked",payments.sweep())); }
}
