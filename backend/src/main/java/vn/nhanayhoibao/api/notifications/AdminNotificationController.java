package vn.nhanayhoibao.api.notifications;

import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import vn.nhanayhoibao.api.admin.AdminContentException;
import vn.nhanayhoibao.api.admin.AdminContentModels.Actor;
import vn.nhanayhoibao.api.auth.JwtService;

@RestController
@RequestMapping("/api/v1/admin/notifications")
public class AdminNotificationController {
    private final AdminNotificationService service;
    private final AdminNotificationStreams streams;
    public AdminNotificationController(AdminNotificationService service,AdminNotificationStreams streams){this.service=service;this.streams=streams;}
    private Actor actor(Authentication authentication) {
        if(authentication==null || !(authentication.getPrincipal() instanceof JwtService.JwtPrincipal user))
            throw new AdminContentException(HttpStatus.FORBIDDEN,"ADMIN_REQUIRED","Administrator authentication is required");
        return new Actor(user.id(),user.version());
    }
    @GetMapping public ResponseEntity<?> list(Authentication authentication,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.list(actor(authentication),page,size));
    }
    @PostMapping("/{id}/read") public ResponseEntity<?> markRead(Authentication authentication,@PathVariable long id) {
        if(id<1)throw new AdminContentException(HttpStatus.BAD_REQUEST,"INVALID_QUERY","Invalid notification ID");
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.markRead(actor(authentication),id));
    }
    @GetMapping(value="/stream",produces=MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<SseEmitter> stream(@CookieValue(name=JwtService.COOKIE,required=false) String token) {
        return ResponseEntity.ok().header("X-Accel-Buffering","no").header("Cache-Control","no-store, no-transform").body(streams.open(token));
    }
}
