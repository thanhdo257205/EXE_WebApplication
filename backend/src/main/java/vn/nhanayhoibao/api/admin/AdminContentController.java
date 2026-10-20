package vn.nhanayhoibao.api.admin;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import vn.nhanayhoibao.api.auth.JwtService;
import static vn.nhanayhoibao.api.admin.AdminContentModels.*;
import static vn.nhanayhoibao.api.admin.AdminContentService.Kind;

@Validated
@RestController
@RequestMapping("/api/v1/admin")
public class AdminContentController {
    private final AdminContentService service;
    public AdminContentController(AdminContentService service) { this.service=service; }
    private static Actor actor(Authentication authentication) {
        if(authentication==null || !(authentication.getPrincipal() instanceof JwtService.JwtPrincipal user))
            throw new AdminContentException(HttpStatus.FORBIDDEN,"ADMIN_REQUIRED","Administrator JWT authentication is required");
        return new Actor(user.id(),user.version());
    }
    private static <T> ResponseEntity<T> ok(T body) {return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);}
    private static <T> ResponseEntity<T> created(T body) {return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(body);}

    @GetMapping("/dashboard") public ResponseEntity<?> dashboard() {return ok(service.dashboard());}
    @GetMapping("/content/identities/{kind}") public ResponseEntity<?> identities(@PathVariable String kind,
            @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size,
            @RequestParam(defaultValue="") String q) {return ok(service.identities(Kind.parse(kind),page,size,q));}
    @GetMapping("/content/releases") public ResponseEntity<?> releases(@RequestParam(defaultValue="0") int page,
            @RequestParam(defaultValue="20") int size,@RequestParam(required=false) String status) {
        return ok(service.releases(page,size,status));
    }
    @PostMapping("/content/releases") public ResponseEntity<?> create(@Valid @RequestBody CreateRelease body,Authentication authentication) {
        return created(service.create(body,actor(authentication)));
    }
    @GetMapping("/content/releases/{release}") public ResponseEntity<?> release(@PathVariable UUID release) {return ok(service.release(release));}
    @PutMapping("/content/releases/{release}") public ResponseEntity<?> update(@PathVariable UUID release,
            @Valid @RequestBody UpdateRelease body,Authentication authentication) {return ok(service.update(release,body,actor(authentication)));}
    @PostMapping("/content/releases/{release}/clone") public ResponseEntity<?> cloneRelease(@PathVariable UUID release,
            @Valid @RequestBody CloneRelease body,Authentication authentication) {return created(service.cloneRelease(release,body,actor(authentication)));}
    @GetMapping("/content/releases/{release}/preview") public ResponseEntity<?> preview(@PathVariable UUID release) {return ok(service.preview(release));}

    @GetMapping("/content/releases/{release}/{kind}") public ResponseEntity<?> list(@PathVariable UUID release,
            @PathVariable String kind,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size,
            @RequestParam(defaultValue="") String q) {return ok(service.list(release,Kind.parse(kind),page,size,q));}
    @GetMapping("/content/releases/{release}/{kind}/{id}") public ResponseEntity<?> get(@PathVariable UUID release,
            @PathVariable String kind,@PathVariable UUID id) {return ok(service.get(release,Kind.parse(kind),id));}
    @DeleteMapping("/content/releases/{release}/{kind}/{id}") public ResponseEntity<?> delete(@PathVariable UUID release,
            @PathVariable String kind,@PathVariable UUID id,@RequestParam @PositiveOrZero long expectedVersion,Authentication authentication) {
        return ok(service.delete(release,Kind.parse(kind),id,expectedVersion,actor(authentication)));
    }

    @PostMapping("/content/releases/{release}/characters") public ResponseEntity<?> addCharacter(@PathVariable UUID release,
            @Valid @RequestBody CharacterWrite body,Authentication authentication) {return created(service.write(release,Kind.CHARACTERS,null,body.command(),true,actor(authentication)));}
    @PutMapping("/content/releases/{release}/characters/{id}") public ResponseEntity<?> editCharacter(@PathVariable UUID release,@PathVariable UUID id,
            @Valid @RequestBody CharacterWrite body,Authentication authentication) {return ok(service.write(release,Kind.CHARACTERS,id,body.command(),false,actor(authentication)));}
    @PostMapping("/content/releases/{release}/card-sets") public ResponseEntity<?> addSet(@PathVariable UUID release,
            @Valid @RequestBody SetWrite body,Authentication authentication) {return created(service.write(release,Kind.SETS,null,body.command(),true,actor(authentication)));}
    @PutMapping("/content/releases/{release}/card-sets/{id}") public ResponseEntity<?> editSet(@PathVariable UUID release,@PathVariable UUID id,
            @Valid @RequestBody SetWrite body,Authentication authentication) {return ok(service.write(release,Kind.SETS,id,body.command(),false,actor(authentication)));}
    @PostMapping("/content/releases/{release}/cards") public ResponseEntity<?> addCard(@PathVariable UUID release,
            @Valid @RequestBody CardWrite body,Authentication authentication) {return created(service.write(release,Kind.CARDS,null,body.command(),true,actor(authentication)));}
    @PutMapping("/content/releases/{release}/cards/{id}") public ResponseEntity<?> editCard(@PathVariable UUID release,@PathVariable UUID id,
            @Valid @RequestBody CardWrite body,Authentication authentication) {return ok(service.write(release,Kind.CARDS,id,body.command(),false,actor(authentication)));}
    @PostMapping("/content/releases/{release}/wiki-pages") public ResponseEntity<?> addWiki(@PathVariable UUID release,
            @Valid @RequestBody WikiWrite body,Authentication authentication) {return created(service.write(release,Kind.WIKI,null,body.command(),true,actor(authentication)));}
    @PutMapping("/content/releases/{release}/wiki-pages/{id}") public ResponseEntity<?> editWiki(@PathVariable UUID release,@PathVariable UUID id,
            @Valid @RequestBody WikiWrite body,Authentication authentication) {return ok(service.write(release,Kind.WIKI,id,body.command(),false,actor(authentication)));}

    @GetMapping("/content/audit-events") public ResponseEntity<?> audits(@RequestParam(defaultValue="0") int page,
            @RequestParam(defaultValue="20") int size,@RequestParam(required=false) UUID releaseId) {
        return ok(service.audits(page,size,releaseId));
    }
}
