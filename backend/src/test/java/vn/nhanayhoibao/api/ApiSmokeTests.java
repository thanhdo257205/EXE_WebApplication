package vn.nhanayhoibao.api;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class ApiSmokeTests {
    @Value("${local.server.port}")
    int port;
    final HttpClient client = HttpClient.newHttpClient();

    @Test
    void exposesHealthAndInfoButProtectsOtherEndpoints() throws Exception {
        var health = get("/actuator/health");
        assertThat(health.statusCode()).isEqualTo(200);
        assertThat(health.body()).contains("UP");
        var info = get("/api/v1/info");
        assertThat(info.statusCode()).isEqualTo(200);
        assertThat(info.body()).contains("EXE_WebApplication");
        assertThat(get("/api/v1/admin").statusCode()).isEqualTo(401);
    }

    @Test
    void permitsOnlyConfiguredCorsOrigin() throws Exception {
        var allowed = preflight("http://localhost:4200");
        assertThat(allowed.statusCode()).isEqualTo(200);
        assertThat(allowed.headers().firstValue("access-control-allow-origin"))
            .contains("http://localhost:4200");
        assertThat(preflight("https://untrusted.example").statusCode()).isEqualTo(403);
    }

    HttpResponse<String> get(String path) throws Exception {
        return client.send(HttpRequest.newBuilder(uri(path)).GET().build(), HttpResponse.BodyHandlers.ofString());
    }

    HttpResponse<String> preflight(String origin) throws Exception {
        var request = HttpRequest.newBuilder(uri("/api/v1/info"))
            .header("Origin", origin).header("Access-Control-Request-Method", "GET")
            .method("OPTIONS", HttpRequest.BodyPublishers.noBody()).build();
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }

    URI uri(String path) { return URI.create("http://localhost:" + port + path); }
}
