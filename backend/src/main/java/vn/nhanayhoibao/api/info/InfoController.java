package vn.nhanayhoibao.api.info;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/info")
public class InfoController {
    private final String commit;

    public InfoController(@Value("${RENDER_GIT_COMMIT:local}") String commit) {
        this.commit = commit;
    }

    @GetMapping
    public ApplicationInfo info() {
        return new ApplicationInfo("EXE_WebApplication", "0.0.1", "scaffold", commit);
    }

    public record ApplicationInfo(String application, String version, String stage, String commit) {}
}
