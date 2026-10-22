package vn.nhanayhoibao.api;

import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import vn.nhanayhoibao.api.admin.*;
import vn.nhanayhoibao.api.auth.*;
import vn.nhanayhoibao.api.content.PublicContentService;
import static org.assertj.core.api.Assertions.*;
import static vn.nhanayhoibao.api.admin.AdminContentModels.*;
import static vn.nhanayhoibao.api.admin.AdminContentService.Kind.*;
import static vn.nhanayhoibao.api.content.PublicContentService.Kind;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
    "spring.datasource.url=jdbc:h2:mem:publiccontent;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE",
    "app.proxy.required=true","app.proxy.secret=test-public-proxy-secret-at-least-32-characters"
})
@ActiveProfiles("local")
class PublicContentFlowTests {
    static final String SECRET="test-public-proxy-secret-at-least-32-characters";
    @Autowired PublicContentService content;
    @Autowired AdminContentService admin;
    @Autowired UserRepository users;
    @Autowired JdbcTemplate db;
    @Autowired org.springframework.transaction.PlatformTransactionManager transactions;
    @Value("${local.server.port}") int port;
    final HttpClient client=HttpClient.newHttpClient();
    UUID release,set,character,card,wiki;
    Actor actor;
    String suffix;
    @BeforeEach void setup() {
        db.update("UPDATE content_releases SET current_slot=NULL WHERE current_slot=1");
        suffix=UUID.randomUUID().toString().substring(0,8);
        var user=users.save(new AppUser("public-"+suffix+"@example.test",null,null,"Admin","ADMIN"));
        actor=new Actor(user.getId(),0);
        release=(UUID)admin.create(new CreateRelease("public-"+suffix,"Public test", "PRIVATE_RELEASE_NOTES"),actor).get("id");
        character=admin.write(release,CHARACTERS,null,new CharacterWrite(0L,null,"CHAR_"+suffix,"char-"+suffix,
            "Nhân vật","Tiểu sử",null,null,0).command(),true,actor).entityId();
        set=admin.write(release,SETS,null,new SetWrite(1L,null,"SET_"+suffix,"set-"+suffix,"Bộ thẻ",null,0).command(),true,actor).entityId();
        card=admin.write(release,CARDS,null,new CardWrite(2L,null,"CARD_"+suffix,"card-"+suffix,set,character,
            "Đồng Tiền %_!","Hiệu ứng",null,RuleStatus.NEEDS_REVIEW,2,null,0).command(),true,actor).entityId();
        wiki=admin.write(release,WIKI,null,new WikiWrite(3L,null,"wiki-"+suffix,PageType.RULE,
            "Luật chơi",null,"# Luật chơi",RuleStatus.CONFIRMED,0).command(),true,actor).entityId();
    }
    void publish() {
        db.update("UPDATE content_releases SET current_slot=NULL WHERE current_slot=1");
        db.update("UPDATE content_releases SET status='PUBLISHED',current_slot=1,published_at=? WHERE id=?",Timestamp.from(Instant.now()),release);
    }
    String query(String value) {return URLEncoder.encode(value,StandardCharsets.UTF_8);}
    HttpResponse<String> request(String method,String path,boolean proxy) throws Exception {
        var request=HttpRequest.newBuilder(URI.create("http://localhost:"+port+path));
        if(proxy)request.header("X-Origin-Verify",SECRET);
        return client.send(request.method(method,HttpRequest.BodyPublishers.noBody()).build(),HttpResponse.BodyHandlers.ofString());
    }
    HttpResponse<String> get(String path) throws Exception {return request("GET","/api/v1/content"+path,true);}

    @Test void draftIsNeverPublicAndNoCurrentReleaseHasExplicit404() throws Exception {
        assertThat(get("/release").statusCode()).isEqualTo(404);
        for(String path:List.of("/release","/snapshot","/cards","/cards/card-"+suffix,"/cards/by-id/"+card)) {
            var response=get(path+"?releaseId="+release);
            assertThat(response.statusCode()).as(path).isEqualTo(404);
            assertThat(response.body()).contains("CONTENT_NOT_FOUND").doesNotContain("PRIVATE_RELEASE_NOTES","Public test");
            assertThat(response.headers().firstValue("cache-control")).contains("no-store");
        }
        db.update("UPDATE content_releases SET status='ARCHIVED' WHERE id=?",release);
        assertThat(get("/snapshot?releaseId="+release).statusCode()).isEqualTo(404);
    }
    @Test void anonymousReadersGetAllowlistedContentAndMetadataAcrossAllKinds() throws Exception {
        publish();
        for(var pair:List.of(new String[]{"characters","char-"},new String[]{"card-sets","set-"},
                new String[]{"cards","card-"},new String[]{"wiki-pages","wiki-"})) {
            var list=get("/"+pair[0]);
            assertThat(list.statusCode()).as(list.body()).isEqualTo(200);
            assertThat(list.body()).contains("release","result","totalElements","\"totalElements\":1");
            assertThat(list.body()).doesNotContain("PRIVATE_RELEASE_NOTES","createdBy","password","revisionId","release_notes");
            assertThat(get("/"+pair[0]+"/"+pair[1]+suffix).statusCode()).isEqualTo(200);
        }
        assertThat(get("/cards/by-id/"+card).body()).contains(card.toString(),"NEEDS_REVIEW","effectText","copiesInDeck");
        assertThat(get("/wiki-pages/by-id/"+wiki).body()).contains("bodyMarkdown","RULE");
        assertThat(get("/release").headers().firstValue("cache-control").orElseThrow()).contains("public","max-age=60");
        assertThat(get("/cards").headers().allValues("set-cookie")).isEmpty();
    }
    @Test void searchIsVietnameseAccentCaseAndLiteralSafeWithStablePagination() {
        publish();
        for(String q:List.of("dong tien","ĐỒNG TIỀN","Đồng Tiền","%_!","CARD_"+suffix,"card-"+suffix))
            assertThat(content.list(null,Kind.CARDS,0,12,q,null,null,null).result().totalElements()).as(q).isEqualTo(1);
        assertThat(content.list(null,Kind.CARDS,0,12,"' OR 1=1 --",null,null,null).result().items()).isEmpty();
        var page=content.list(null,Kind.CARDS,1,1,"",null,null,null).result();
        assertThat(page.items()).isEmpty();assertThat(page.totalElements()).isEqualTo(1);assertThat(page.totalPages()).isEqualTo(1);
        assertThat(content.list(null,Kind.WIKI,0,12,"luat",null,null,"RULE").result().items()).hasSize(1);
    }
    @Test void filtersAndHttpValidationAreBounded() throws Exception {
        publish();
        assertThat(content.list(null,Kind.CARDS,0,12,"",set,character,null).result().items()).hasSize(1);
        assertThat(content.list(null,Kind.CARDS,0,12,"",UUID.randomUUID(),null,null).result().items()).isEmpty();
        assertThat(content.list(null,Kind.WIKI,0,12,"",null,null,"FAQ").result().items()).isEmpty();
        for(String path:List.of("/cards?page=-1","/cards?size=101","/cards?page=10001","/cards?size=0",
                "/cards?releaseId=invalid","/cards?cardSetId=bad","/wiki-pages?pageType=BAD","/cards?pageType=RULE",
                "/characters?cardSetId="+set,"/cards?q="+"a".repeat(101),"/cards/by-id/not-a-uuid"))
            assertThat(get(path).statusCode()).as(path).isEqualTo(400);
        assertThat(get("/unknown-kind").statusCode()).isEqualTo(404);
        assertThat(get("/cards/missing").statusCode()).isEqualTo(404);
        assertThat(get("/cards/by-id/"+UUID.randomUUID()).statusCode()).isEqualTo(404);
    }
    @Test void paginationTransfersOnlySelectedBodiesAndPreservesSearchOrder() {
        publish();
        for(int i=0;i<24;i++) {
            UUID entity=UUID.randomUUID();
            db.update("INSERT INTO game_characters(id,code,slug) VALUES (?,?,?)",entity,"BULK_"+suffix+"_"+i,"bulk-"+suffix+"-"+i);
            db.update("INSERT INTO character_revisions(id,character_id,release_id,name,biography,sort_order) VALUES (?,?,?,?,?,?)",
                UUID.randomUUID(),entity,release,"Nhân vật %02d".formatted(i),"x".repeat(12000),1);
        }
        var transferred=new java.util.concurrent.atomic.AtomicLong();
        var measured=new JdbcTemplate(Objects.requireNonNull(db.getDataSource())) {
            @Override public List<Map<String,Object>> queryForList(String sql,Object... args) {
                var rows=super.queryForList(sql,args);
                for(var row:rows)for(var entry:row.entrySet())
                    if(entry.getKey().equalsIgnoreCase("biography") && entry.getValue() instanceof String body)
                        transferred.addAndGet(body.length());
                return rows;
            }
        };
        var service=new PublicContentService(measured,transactions);
        var result=service.list(null,Kind.CHARACTERS,1,3,"NHAN VAT",null,null,null).result();
        assertThat(result.totalElements()).isEqualTo(25);
        assertThat(result.items()).extracting(row->row.get("name"))
            .containsExactly("Nhân vật 02","Nhân vật 03","Nhân vật 04");
        // 24 large biographies exist; only the three requested bodies leave the database.
        assertThat(transferred.get()).isEqualTo(36000);
        transferred.set(0);
        assertThat(service.list(null,Kind.CHARACTERS,100,3,"",null,null,null).result().items()).isEmpty();
        assertThat(service.list(null,Kind.CHARACTERS,0,3,"missing-match",null,null,null).result().totalElements()).isZero();
        assertThat(transferred.get()).isZero();
    }
    @Test void explicitPublishedVersionRemainsPinnedWhenCurrentReleaseChanges() {
        publish();UUID original=release;
        UUID clone=(UUID)admin.cloneRelease(release,new CloneRelease(4L,"next-"+suffix,"Next",null),actor).get("id");
        assertThatThrownBy(()->content.snapshot(clone)).hasMessageContaining("not found");
        db.update("UPDATE content_releases SET current_slot=NULL,status='ARCHIVED' WHERE id=?",original);
        db.update("UPDATE content_releases SET status='PUBLISHED',current_slot=1,published_at=? WHERE id=?",Timestamp.from(Instant.now()),clone);
        assertThat(content.release(null)).containsEntry("id",clone);
        assertThat(content.list(original,Kind.CARDS,0,12,"",null,null,null).release()).containsEntry("id",original);
        assertThat(content.detail(original,Kind.CARDS,"card-"+suffix).get("release")).isEqualTo(content.release(original));
        assertThat(content.byId(null,Kind.CARDS,card).get("release")).isEqualTo(content.release(clone));
    }
    @Test void snapshotIncludesExactlyOnePublicReleaseWithoutPrivateDraftOrUserData() throws Exception {
        publish();
        var draft=admin.cloneRelease(release,new CloneRelease(4L,"draft-copy-"+suffix,"PRIVATE_DRAFT",null),actor);
        UUID privateWiki=admin.write((UUID)draft.get("id"),WIKI,null,new WikiWrite(0L,null,"private-"+suffix,PageType.FAQ,
            "PRIVATE_DRAFT_WIKI",null,"PRIVATE_DRAFT_BODY",RuleStatus.NEEDS_REVIEW,0).command(),true,actor).entityId();
        var snapshot=get("/snapshot");
        assertThat(snapshot.statusCode()).isEqualTo(200);
        assertThat(snapshot.body()).contains("\"schemaVersion\":1","characters","card-sets","cards","wiki-pages",card.toString());
        assertThat(snapshot.body()).doesNotContain("PRIVATE_DRAFT","PRIVATE_RELEASE_NOTES","createdBy","actorId","authVersion","contactEmail","previewOnly",draft.get("id").toString());
        assertThat(get("/wiki-pages/private-"+suffix).statusCode()).isEqualTo(404);
        assertThat(get("/wiki-pages/by-id/"+privateWiki).statusCode()).isEqualTo(404);
        assertThatThrownBy(()->content.snapshot((UUID)draft.get("id"))).hasMessageContaining("not found");
        db.update("UPDATE character_revisions SET biography=? WHERE release_id=?","x".repeat(500001),release);
        assertThat(get("/snapshot").statusCode()).isEqualTo(413);
        assertThat(get("/characters").body()).contains("CONTENT_TOO_LARGE");
        // A separate kind can still be paged when its own budget is within bounds.
        assertThat(get("/cards").statusCode()).isEqualTo(200);
    }
    @Test void trustedProxyIsRequiredAndPublicWriteRoutesStayClosed() throws Exception {
        publish();
        assertThat(request("GET","/api/v1/content/cards",false).statusCode()).isEqualTo(403);
        assertThat(request("POST","/api/v1/content/cards",true).statusCode()).isEqualTo(403);
        assertThat(request("DELETE","/api/v1/content/cards/"+card,true).statusCode()).isEqualTo(403);
        assertThat(request("GET","/api/v1/admin/content/releases/"+release+"/preview",true).statusCode()).isEqualTo(401);
    }
}
