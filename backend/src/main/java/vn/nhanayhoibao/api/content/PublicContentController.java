package vn.nhanayhoibao.api.content;

import java.time.Duration;
import java.util.UUID;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import static vn.nhanayhoibao.api.content.PublicContentService.Kind;

@RestController
@RequestMapping("/api/v1/content")
public class PublicContentController {
    private final PublicContentService service;
    public PublicContentController(PublicContentService service) {this.service=service;}
    private ResponseEntity<?> ok(Object body) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic()).body(body);
    }
    @GetMapping("/release") public ResponseEntity<?> release(@RequestParam(required=false) UUID releaseId) {
        return ok(service.release(releaseId));
    }
    @GetMapping("/snapshot") public ResponseEntity<?> snapshot(@RequestParam(required=false) UUID releaseId) {
        return ok(service.snapshot(releaseId));
    }
    @GetMapping("/{kind}") public ResponseEntity<?> list(@PathVariable String kind,@RequestParam(required=false) UUID releaseId,
            @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="12") int size,
            @RequestParam(defaultValue="") String q,@RequestParam(required=false) UUID cardSetId,
            @RequestParam(required=false) UUID characterId,@RequestParam(required=false) String pageType) {
        return ok(service.list(releaseId,Kind.parse(kind),page,size,q,cardSetId,characterId,pageType));
    }
    @GetMapping("/{kind}/by-id/{id}") public ResponseEntity<?> byId(@PathVariable String kind,@PathVariable UUID id,
            @RequestParam(required=false) UUID releaseId) {return ok(service.byId(releaseId,Kind.parse(kind),id));}
    @GetMapping("/{kind}/{slug}") public ResponseEntity<?> detail(@PathVariable String kind,@PathVariable String slug,
            @RequestParam(required=false) UUID releaseId) {return ok(service.detail(releaseId,Kind.parse(kind),slug));}
}
