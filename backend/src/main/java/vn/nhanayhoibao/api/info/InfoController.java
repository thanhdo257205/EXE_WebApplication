package vn.nhanayhoibao.api.info;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/info")
public class InfoController {
    @GetMapping
    public ApplicationInfo info() {
        return new ApplicationInfo("EXE_WebApplication", "0.0.1", "scaffold");
    }

    public record ApplicationInfo(String application, String version, String stage) {}
}
