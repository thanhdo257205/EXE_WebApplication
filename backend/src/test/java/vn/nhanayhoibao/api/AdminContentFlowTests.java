package vn.nhanayhoibao.api;

import java.net.*;
import java.net.http.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.Pattern;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.ActiveProfiles;
import vn.nhanayhoibao.api.admin.*;
import vn.nhanayhoibao.api.auth.*;
import static org.assertj.core.api.Assertions.*;
import static vn.nhanayhoibao.api.admin.AdminContentModels.*;
import static vn.nhanayhoibao.api.admin.AdminContentService.Kind.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
    "spring.datasource.url=jdbc:h2:mem:admincontent;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE",
    "app.proxy.required=true","app.proxy.secret=test-admin-proxy-secret-at-least-32-characters"
})
@ActiveProfiles("local")
class AdminContentFlowTests {
    static final String SECRET="test-admin-proxy-secret-at-least-32-characters";
    @Autowired AdminContentService service;
    @Autowired UserRepository users;
    @Autowired JdbcTemplate db;
    @Autowired JwtService jwt;
    @Value("${local.server.port}") int port;
    Actor actor;
    AppUser administrator;
    UUID release;
    String suffix;
    @BeforeEach void setup() {
        suffix=UUID.randomUUID().toString().substring(0,8);
        administrator=users.save(new AppUser("admin-"+suffix+"@example.test",null,null,"Admin test","ADMIN"));
        actor=new Actor(administrator.getId(),0);
        release=(UUID)service.create(new CreateRelease("draft-"+suffix,"Test draft",null),actor).get("id");
    }
    long version() {return ((Number)service.release(release).get("version")).longValue();}
    CharacterWrite character(long version,String name) {return new CharacterWrite(version,null,"CHAR_"+suffix.toUpperCase(Locale.ROOT),"char-"+suffix,name,"Test biography",null,"/assets/test.png",0);}
    SetWrite set(long version,String name) {return new SetWrite(version,null,"SET_"+suffix.toUpperCase(Locale.ROOT),"set-"+suffix,name,null,0);}
    CardWrite card(long version,UUID set,UUID character,String name) {
        return new CardWrite(version,null,"CARD_"+suffix.toUpperCase(Locale.ROOT),"card-"+suffix,set,character,name,"Test effect",null,RuleStatus.NEEDS_REVIEW,1,"https://assets.example.test/card.png",0);
    }

    @Test void createsEditsListsAndPreviewsAllContentKindsWithAudit() {
        UUID character=service.write(release,CHARACTERS,null,character(0,"Test character").command(),true,actor).entityId();
        UUID set=service.write(release,SETS,null,set(1,"Test set").command(),true,actor).entityId();
        UUID card=service.write(release,CARDS,null,card(2,set,character,"Test card").command(),true,actor).entityId();
        var wiki=new WikiWrite(3L,null,"wiki-"+suffix,PageType.GUIDE,"Test guide",null,"# Test guide",RuleStatus.CONFIRMED,0);
        var page=service.write(release,WIKI,null,wiki.command(),true,actor);
        assertThat(page.releaseVersion()).isEqualTo(4);
        var updated=new CharacterWrite(4L,null,"CHAR_"+suffix.toUpperCase(Locale.ROOT),"char-"+suffix,"Renamed character","Updated biography",null,null,1);
        assertThat(service.write(release,CHARACTERS,character,updated.command(),false,actor).item()).containsEntry("name","Renamed character");
        assertThat(service.list(release,CARDS,0,20,"CARD_"+suffix).result().totalElements()).isEqualTo(1);
        assertThat(service.get(release,CARDS,card)).containsEntry("releaseVersion",5L);
        assertThat(service.preview(release)).containsEntry("previewOnly",true);
        assertThat(service.audits(0,100,release).totalElements()).isEqualTo(6);
        assertThat(service.dashboard()).containsKeys("asOf","releases","feedbackNew","cardsNeedingReview");
        UUID clone=(UUID)service.cloneRelease(release,new CloneRelease(5L,"all-"+suffix,"All kinds",null),actor).get("id");
        for(var kind:List.of(CHARACTERS,SETS,CARDS,WIKI)) {
            var original=service.list(release,kind,0,20,"").result().items().getFirst();
            var copied=service.list(clone,kind,0,20,"").result().items().getFirst();
            assertThat(copied.get("id")).isEqualTo(original.get("id"));
            assertThat(copied.get("revisionId")).isNotEqualTo(original.get("revisionId"));
        }
    }

    @Test void staleVersionCannotOverwriteContentOrCreateAnAudit() {
        UUID id=service.write(release,CHARACTERS,null,character(0,"First").command(),true,actor).entityId();
        long before=service.audits(0,100,release).totalElements();
        assertThatThrownBy(()->service.write(release,CHARACTERS,id,character(0,"Lost update").command(),false,actor))
            .isInstanceOf(AdminContentException.class).hasMessageContaining("Reload");
        assertThat(service.list(release,CHARACTERS,0,20,"First").result().totalElements()).isEqualTo(1);
        assertThat(version()).isEqualTo(1);
        assertThat(service.audits(0,100,release).totalElements()).isEqualTo(before);
    }

    @Test void crossReleaseReferencesRollbackNewIdentityAndVersion() {
        UUID other=(UUID)service.create(new CreateRelease("other-"+suffix,"Other",null),actor).get("id");
        UUID set=service.write(other,SETS,null,set(0,"Other set").command(),true,actor).entityId();
        assertThatThrownBy(()->service.write(release,CARDS,null,card(0,set,null,"Invalid").command(),true,actor))
            .hasMessageContaining("same release");
        assertThat(version()).isZero();
        assertThat(db.queryForObject("SELECT COUNT(*) FROM game_cards WHERE code=?",Long.class,"CARD_"+suffix.toUpperCase(Locale.ROOT))).isZero();
        assertThat(service.audits(0,100,release).totalElements()).isEqualTo(1);
    }

    @Test void deletingRevisionPreservesIdentityAndBlocksReferencedSetOrCharacter() {
        UUID character=service.write(release,CHARACTERS,null,character(0,"Character").command(),true,actor).entityId();
        UUID set=service.write(release,SETS,null,set(1,"Set").command(),true,actor).entityId();
        UUID card=service.write(release,CARDS,null,card(2,set,character,"Card").command(),true,actor).entityId();
        assertThatThrownBy(()->service.delete(release,SETS,set,3,actor)).hasMessageContaining("dependent");
        assertThatThrownBy(()->service.delete(release,CHARACTERS,character,3,actor)).hasMessageContaining("dependent");
        service.delete(release,CARDS,card,3,actor);service.delete(release,SETS,set,4,actor);
        assertThat(service.identities(SETS,0,100,"SET_"+suffix).items()).hasSize(1);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM game_cards WHERE id=?",Long.class,card)).isEqualTo(1);
        assertThat(service.list(release,SETS,0,20,"").result().items()).isEmpty();
    }

    @Test void publishedAndArchivedReleasesAreImmutableButCanBeCloned() {
        UUID set=service.write(release,SETS,null,set(0,"Set").command(),true,actor).entityId();
        service.write(release,CARDS,null,card(1,set,null,"Card").command(),true,actor);
        db.update("UPDATE content_releases SET status='PUBLISHED',published_at=? WHERE id=?",java.sql.Timestamp.from(Instant.now()),release);
        assertThatThrownBy(()->service.update(release,new UpdateRelease(2L,"Changed",null),actor)).hasMessageContaining("Only draft");
        assertThatThrownBy(()->service.delete(release,SETS,set,2,actor)).hasMessageContaining("Only draft");
        UUID clone=(UUID)service.cloneRelease(release,new CloneRelease(2L,"clone-"+suffix,"Clone",null),actor).get("id");
        assertThat(service.release(clone)).containsEntry("status","DRAFT").containsEntry("version",0L);
        assertThat(service.list(clone,SETS,0,20,"").result().items().getFirst()).containsEntry("id",set);
        assertThat(service.list(clone,CARDS,0,20,"").result().totalElements()).isEqualTo(1);
        db.update("UPDATE content_releases SET status='ARCHIVED' WHERE id=?",release);
        assertThatThrownBy(()->service.write(release,SETS,set,set(2,"Changed").command(),false,actor)).hasMessageContaining("Only draft");
    }

    @Test void stableCodeSlugAndPageTypeCannotBeChanged() {
        UUID id=service.write(release,SETS,null,set(0,"First").command(),true,actor).entityId();
        var renamed=new SetWrite(1L,null,"RENAMED","renamed","Name",null,0);
        assertThatThrownBy(()->service.write(release,SETS,id,renamed.command(),false,actor)).hasMessageContaining("immutable");
        assertThat(version()).isEqualTo(1);
    }

    @Test void twoAdministratorsCannotOverwriteSameReleaseVersion() throws Exception {
        var other=users.save(new AppUser("other-"+suffix+"@example.test",null,null,"Other admin","ADMIN"));
        var secondActor=new Actor(other.getId(),0);
        var start=new CountDownLatch(1);
        try(var pool=Executors.newVirtualThreadPerTaskExecutor()) {
            var first=pool.submit(()->attemptUpdate(start,actor));var second=pool.submit(()->attemptUpdate(start,secondActor));start.countDown();
            assertThat(List.of(first.get(10,TimeUnit.SECONDS),second.get(10,TimeUnit.SECONDS))).containsExactlyInAnyOrder(true,false);
        }
        assertThat(version()).isEqualTo(1);
        assertThat(service.audits(0,100,release).totalElements()).isEqualTo(2);
    }
    boolean attemptUpdate(CountDownLatch start,Actor actor) throws InterruptedException {
        start.await();try{service.update(release,new UpdateRelease(0L,"Concurrent",null),actor);return true;}
        catch(AdminContentException conflict){return false;}
    }

    @Test void paginationSearchAndImageValidationRejectInvalidInput() {
        assertThatThrownBy(()->service.list(release,SETS,0,101,"")).hasMessageContaining("size");
        assertThatThrownBy(()->service.releases(0,20,"bad")).hasMessageContaining("status");
        var invalid=new CharacterWrite(0L,null,"CHAR_"+suffix,"char-"+suffix,"Name","Bio",null,"javascript:alert(1)",0);
        assertThatThrownBy(()->service.write(release,CHARACTERS,null,invalid.command(),true,actor)).hasMessageContaining("HTTPS");
        service.write(release,SETS,null,set(0,"Test % literal").command(),true,actor);
        assertThat(service.list(release,SETS,0,20,"%").result().totalElements()).isEqualTo(1);
        assertThat(service.list(release,SETS,1,1,"").result().items()).isEmpty();
    }

    @Test void mutationsRecheckAdminRoleEnabledAndAuthVersion() {
        db.update("UPDATE app_users SET auth_version=1 WHERE id=?",actor.id());
        assertThatThrownBy(()->service.update(release,new UpdateRelease(0L,"Changed",null),actor)).hasMessageContaining("authorization");
        db.update("UPDATE app_users SET auth_version=0,role='CUSTOMER' WHERE id=?",actor.id());
        assertThatThrownBy(()->service.update(release,new UpdateRelease(0L,"Changed",null),actor)).hasMessageContaining("authorization");
        db.update("UPDATE app_users SET role='ADMIN',enabled=FALSE WHERE id=?",actor.id());
        assertThatThrownBy(()->service.update(release,new UpdateRelease(0L,"Changed",null),actor)).hasMessageContaining("authorization");
        assertThat(version()).isZero();
    }

    @Test void realEndpointsRequireAdminJwtCsrfAndTrustedProxy() throws Exception {
        var anonymous=new Browser(null);
        assertThat(anonymous.send("GET","/api/v1/admin/dashboard",null,false,true).statusCode()).isEqualTo(401);
        var customer=users.save(new AppUser("customer-"+suffix+"@example.test",null,null,"Customer","CUSTOMER"));
        assertThat(new Browser(customer).send("GET","/api/v1/admin/dashboard",null,false,true).statusCode()).isEqualTo(403);
        var admin=new Browser(administrator);
        assertThat(admin.send("GET","/api/v1/admin/dashboard",null,false,false).statusCode()).isEqualTo(403);
        var ok=admin.send("GET","/api/v1/admin/dashboard",null,false,true);
        assertThat(ok.statusCode()).isEqualTo(200);assertThat(ok.headers().firstValue("cache-control")).contains("no-store");
        String path="/api/v1/admin/content/releases/"+release;
        assertThat(admin.send("PUT",path,"{\"expectedVersion\":0,\"title\":\"Edited\"}",false,true).statusCode()).isEqualTo(403);
        assertThat(admin.send("PUT",path,"{\"expectedVersion\":0,\"title\":\"Edited\"}",true,true).statusCode()).isEqualTo(200);
        var conflict=admin.send("PUT",path,"{\"expectedVersion\":0,\"title\":\"Lost\"}",true,true);
        assertThat(conflict.statusCode()).isEqualTo(409);assertThat(conflict.body()).contains("VERSION_CONFLICT");
        assertThat(anonymous.send("GET",path+"/preview",null,false,true).statusCode()).isEqualTo(401);
        assertThat(new Browser(customer).send("GET",path+"/preview",null,false,true).statusCode()).isEqualTo(403);
        assertThat(admin.send("GET",path+"/preview",null,false,true).statusCode()).isEqualTo(200);
    }

    @Test void typedCrudRoutesReturnCamelCaseVersionsAndProtectDraftDetails() throws Exception {
        var admin=new Browser(administrator);String root="/api/v1/admin/content/releases/"+release;
        String body="{\"expectedVersion\":0,\"code\":\"SET_"+suffix.toUpperCase(Locale.ROOT)+"\",\"slug\":\"set-"+suffix+"\",\"name\":\"HTTP set\"}";
        var created=admin.send("POST",root+"/card-sets",body,true,true);
        assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
        assertThat(created.body()).contains("releaseVersion","entityId","sortOrder").doesNotContain("sort_order");
        UUID id=(UUID)service.list(release,SETS,0,20,"").result().items().getFirst().get("id");
        var updated=admin.send("PUT",root+"/card-sets/"+id,body.replace("\"expectedVersion\":0","\"expectedVersion\":1").replace("HTTP set","Renamed"),true,true);
        assertThat(updated.statusCode()).isEqualTo(200);assertThat(updated.body()).contains("Renamed");
        assertThat(admin.send("GET",root+"/card-sets/"+id,null,false,true).statusCode()).isEqualTo(200);
        assertThat(admin.send("DELETE",root+"/card-sets/"+id+"?expectedVersion=2",null,true,true).statusCode()).isEqualTo(200);
        assertThat(admin.send("GET",root+"/card-sets/"+id,null,false,true).statusCode()).isEqualTo(404);
        var customer=users.save(new AppUser("other-customer-"+suffix+"@example.test",null,null,"Customer","CUSTOMER"));
        assertThat(new Browser(customer).send("GET",root+"/cards",null,false,true).statusCode()).isEqualTo(403);
    }

    @Test void previewBudgetRejectsOversizedSnapshotsAndClonesWithoutSideEffects() {
        UUID id=service.write(release,CHARACTERS,null,character(0,"Character").command(),true,actor).entityId();
        // Simulate legacy/bulk data exceeding the aggregate preview budget without allocating it in the API.
        db.update("UPDATE character_revisions SET biography=? WHERE release_id=? AND character_id=?","x".repeat(500001),release,id);
        assertThatThrownBy(()->service.preview(release)).hasMessageContaining("paginated");
        assertThatThrownBy(()->service.cloneRelease(release,new CloneRelease(1L,"too-large-"+suffix,"Too large",null),actor)).hasMessageContaining("paginated");
        assertThat(db.queryForObject("SELECT COUNT(*) FROM content_releases WHERE version_label=?",Long.class,"too-large-"+suffix)).isZero();
        assertThat(service.list(release,CHARACTERS,0,20,"").result().totalElements()).isEqualTo(1);
    }

    @Test void validationAndDatabaseConflictsHaveSafeApiErrors() throws Exception {
        var browser=new Browser(administrator);
        var malformed=browser.send("POST","/api/v1/admin/content/releases","{\"versionLabel\":\"invalid label\",\"title\":\"\"}",true,true);
        assertThat(malformed.statusCode()).isEqualTo(400);assertThat(malformed.body()).contains("VALIDATION_FAILED","versionLabel");
        var duplicate=browser.send("POST","/api/v1/admin/content/releases","{\"versionLabel\":\"draft-"+suffix+"\",\"title\":\"Duplicate\"}",true,true);
        assertThat(duplicate.statusCode()).isEqualTo(409);assertThat(duplicate.body()).contains("RESOURCE_CONFLICT").doesNotContain("INSERT INTO","password_hash");
        assertThat(browser.send("GET","/api/v1/admin/content/releases/not-a-uuid",null,false,true).statusCode()).isEqualTo(400);
        assertThat(browser.send("GET","/api/v1/admin/content/releases/"+release+"/wrong-kind",null,false,true).statusCode()).isEqualTo(404);
        assertThat(browser.send("DELETE","/api/v1/admin/content/releases/"+release+"/cards/"+UUID.randomUUID()+"?expectedVersion=-1",null,true,true).statusCode()).isEqualTo(400);
    }

    class Browser {
        final CookieManager cookies=new CookieManager(null,CookiePolicy.ACCEPT_ALL);
        final HttpClient client=HttpClient.newBuilder().cookieHandler(cookies).build();
        Browser(AppUser user) throws Exception {
            if(user!=null){var response=new MockHttpServletResponse();jwt.issue(user,response);
                cookies.put(URI.create("http://localhost:"+port+"/api"),Map.of("Set-Cookie",response.getHeaders("Set-Cookie")));}
        }
        HttpResponse<String> send(String method,String path,String body,boolean csrf,boolean proxy) throws Exception {
            String token=null;
            if(csrf){var response=send("GET","/api/v1/auth/csrf",null,false,true);
                var matcher=Pattern.compile("\"token\":\"([^\"]+)\"").matcher(response.body());assertThat(matcher.find()).isTrue();token=matcher.group(1);}
            var request=HttpRequest.newBuilder(URI.create("http://localhost:"+port+path));
            if(proxy)request.header("X-Origin-Verify",SECRET);
            if(token!=null)request.header("X-XSRF-TOKEN",token);
            if(body!=null)request.header("Content-Type","application/json");
            return client.send(request.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(body)).build(),HttpResponse.BodyHandlers.ofString());
        }
    }
}
