package vn.nhanayhoibao.api.admin;

import java.net.URI;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import static vn.nhanayhoibao.api.admin.AdminContentModels.*;

@Service
public class AdminContentService {
    // SQL identifiers only come from this enum, never from query/body input.
    public enum Kind {
        CHARACTERS("characters","game_characters","character_revisions","character_id","name",
            "name,biography,ability_text,portrait_url,sort_order"),
        SETS("card-sets","card_sets","card_set_revisions","card_set_id","name","name,description,sort_order"),
        CARDS("cards","game_cards","card_revisions","card_id","name",
            "card_set_id,character_id,name,effect_text,ruling_notes,rule_status,copies_in_deck,artwork_url,sort_order"),
        WIKI("wiki-pages","wiki_pages","wiki_page_revisions","page_id","title",
            "title,summary,body_markdown,rule_status,sort_order");
        final String path,identity,revision,fk,label;
        final List<String> columns;
        Kind(String path,String identity,String revision,String fk,String label,String columns) {
            this.path=path;this.identity=identity;this.revision=revision;this.fk=fk;this.label=label;
            this.columns=List.of(columns.split(","));
        }
        public static Kind parse(String path) {
            return Arrays.stream(values()).filter(k->k.path.equals(path)).findFirst().orElseThrow(AdminContentException::missing);
        }
    }
    private final JdbcTemplate db;
    private final TransactionTemplate tx,read;

    public AdminContentService(JdbcTemplate db,org.springframework.transaction.PlatformTransactionManager manager) {
        this.db=db;tx=new TransactionTemplate(manager);read=new TransactionTemplate(manager);
        read.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
        read.setReadOnly(true);
    }
    private static Map<String,Object> camel(Map<String,Object> row) {
        var result=new LinkedHashMap<String,Object>();
        row.forEach((key,value)->{
            var words=key.toLowerCase(Locale.ROOT).split("_");var name=new StringBuilder(words[0]);
            for(int i=1;i<words.length;i++) name.append(Character.toUpperCase(words[i].charAt(0))).append(words[i].substring(1));
            if(value instanceof Timestamp timestamp) value=timestamp.toInstant().toString();
            else if(value instanceof OffsetDateTime timestamp) value=timestamp.toInstant().toString();
            result.put(name.toString(),value);
        });return result;
    }
    private Map<String,Object> releaseRow(UUID id,boolean lock) {
        var rows=db.queryForList("SELECT * FROM content_releases WHERE id=?"+(lock?" FOR UPDATE":""),id);
        if(rows.isEmpty())throw AdminContentException.missing();return rows.getFirst();
    }
    private static long version(Map<String,Object> row) {return ((Number)row.get("version")).longValue();}
    private void actor(Actor actor) {
        var rows=db.queryForList("SELECT role,enabled,auth_version FROM app_users WHERE id=? FOR UPDATE",actor.id());
        if(rows.isEmpty() || !Boolean.TRUE.equals(rows.getFirst().get("enabled"))
                || !"ADMIN".equals(rows.getFirst().get("role"))
                || ((Number)rows.getFirst().get("auth_version")).longValue()!=actor.authVersion())
            throw new AdminContentException(HttpStatus.FORBIDDEN,"ADMIN_REQUIRED","Current administrator authorization is required");
    }
    private void editable(Map<String,Object> release,long expected) {
        if(!"DRAFT".equals(release.get("status")))throw AdminContentException.conflict("RELEASE_IMMUTABLE","Only draft releases may be edited");
        if(version(release)!=expected)throw AdminContentException.conflict("VERSION_CONFLICT","Reload the release before editing again");
    }
    private long advance(UUID release) {
        db.update("UPDATE content_releases SET version=version+1 WHERE id=?",release);
        return version(releaseRow(release,false));
    }
    private void audit(Actor actor,String action,String type,UUID entity,UUID release,long version) {
        db.update("INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,outcome,details_redacted) VALUES (?,?,?,?,?,'SUCCESS',?)",
            UUID.randomUUID(),actor.id(),action,type,entity,"releaseId="+release+";version="+version);
    }
    private static <T> Page<T> page(List<T> items,int page,int size,long count) {
        return new Page<>(items,page,size,count,(count+size-1)/size);
    }
    private static void paging(int page,int size,String q) {
        if(page<0 || page>10000 || size<1 || size>100 || q==null || q.length()>100)
            throw new AdminContentException(HttpStatus.BAD_REQUEST,"INVALID_QUERY","page must be 0..10000, size 1..100 and q at most 100 characters");
    }
    public Page<Map<String,Object>> releases(int page,int size,String status) {
        paging(page,size,"");
        if(status!=null && !Set.of("DRAFT","PUBLISHED","ARCHIVED").contains(status))
            throw new AdminContentException(HttpStatus.BAD_REQUEST,"INVALID_QUERY","Unsupported release status");
        return read.execute(s->{
            String where=status==null?"":" WHERE status=?";var args=new ArrayList<Object>();if(status!=null)args.add(status);
            long count=db.queryForObject("SELECT COUNT(*) FROM content_releases"+where,Long.class,args.toArray());
            args.add(size);args.add(page*size);
            return page(db.queryForList("SELECT * FROM content_releases"+where+" ORDER BY created_at DESC,id LIMIT ? OFFSET ?",args.toArray())
                .stream().map(AdminContentService::camel).toList(),page,size,count);
        });
    }
    public Map<String,Object> release(UUID id) {return read.execute(s->camel(releaseRow(id,false)));}
    public Map<String,Object> create(CreateRelease request,Actor actor) {
        return tx.execute(s->{actor(actor);UUID id=UUID.randomUUID();
            db.update("INSERT INTO content_releases(id,version_label,title,release_notes,created_by) VALUES (?,?,?,?,?)",
                id,request.versionLabel(),request.title().trim(),request.releaseNotes(),actor.id());
            audit(actor,"CONTENT_RELEASE_CREATED","CONTENT_RELEASE",id,id,0);
            return camel(releaseRow(id,false));});
    }
    public Map<String,Object> update(UUID id,UpdateRelease request,Actor actor) {
        return tx.execute(s->{actor(actor);editable(releaseRow(id,true),request.expectedVersion());
            db.update("UPDATE content_releases SET title=?,release_notes=? WHERE id=?",request.title().trim(),request.releaseNotes(),id);
            long version=advance(id);audit(actor,"CONTENT_RELEASE_UPDATED","CONTENT_RELEASE",id,id,version);
            return camel(releaseRow(id,false));});
    }
    public Map<String,Object> cloneRelease(UUID source,CloneRelease request,Actor actor) {
        return tx.execute(s->{actor(actor);var original=releaseRow(source,true);
            if(version(original)!=request.sourceVersion())throw AdminContentException.conflict("VERSION_CONFLICT","Reload source release before cloning");
            previewBudget(source);
            UUID id=UUID.randomUUID();
            db.update("INSERT INTO content_releases(id,version_label,title,release_notes,created_by) VALUES (?,?,?,?,?)",
                id,request.versionLabel(),request.title().trim(),request.releaseNotes(),actor.id());
            for(var kind:Kind.values()) {
                // The order copies referenced sets/characters before cards.
                var columns=new ArrayList<>(List.of("id",kind.fk,"release_id"));columns.addAll(kind.columns);
                var batch=new ArrayList<Object[]>();
                for(var row:db.queryForList("SELECT * FROM "+kind.revision+" WHERE release_id=?",source)) {
                    var values=new ArrayList<Object>(List.of(UUID.randomUUID(),row.get(kind.fk),id));
                    kind.columns.forEach(column->values.add(row.get(column)));
                    batch.add(values.toArray());
                }
                if(!batch.isEmpty())db.batchUpdate("INSERT INTO "+kind.revision+" ("+String.join(",",columns)+") VALUES ("+
                    String.join(",",Collections.nCopies(columns.size(),"?"))+")",batch);
            }
            audit(actor,"CONTENT_RELEASE_CLONED","CONTENT_RELEASE",id,id,0);
            return camel(releaseRow(id,false));});
    }
    private String select(Kind kind) {
        String identity=kind==Kind.WIKI?"i.slug,i.page_type":"i.code,i.slug";
        return "SELECT i.id,"+identity+",r.id AS revision_id,r.release_id,"+
            String.join(",",kind.columns.stream().map(c->"r."+c).toList())+
            " FROM "+kind.identity+" i JOIN "+kind.revision+" r ON r."+kind.fk+"=i.id";
    }
    private Map<String,Object> item(UUID release,Kind kind,UUID id) {
        var rows=db.queryForList(select(kind)+" WHERE r.release_id=? AND i.id=?",release,id);
        if(rows.isEmpty())throw AdminContentException.missing();return camel(rows.getFirst());
    }
    public Map<String,Object> get(UUID release,Kind kind,UUID id) {
        return read.execute(s->{var row=releaseRow(release,false);
            return Map.of("releaseVersion",version(row),"item",item(release,kind,id));});
    }
    public RevisionPage list(UUID release,Kind kind,int page,int size,String q) {
        paging(page,size,q);
        return read.execute(s->{var row=releaseRow(release,false);
            String escaped="%"+q.trim().toLowerCase(Locale.ROOT).replace("!","!!").replace("%","!%").replace("_","!_")+"%";
            String where=" WHERE r.release_id=? AND (LOWER(r."+kind.label+") LIKE ? ESCAPE '!' OR LOWER(i.slug) LIKE ? ESCAPE '!'"+
                (kind==Kind.WIKI?"":" OR LOWER(i.code) LIKE ? ESCAPE '!'")+")";
            var args=new ArrayList<Object>(List.of(release,escaped,escaped));if(kind!=Kind.WIKI)args.add(escaped);
            long count=db.queryForObject("SELECT COUNT(*) FROM "+kind.revision+" r JOIN "+kind.identity+" i ON i.id=r."+kind.fk+where,Long.class,args.toArray());
            args.add(size);args.add(page*size);
            var items=db.queryForList(select(kind)+where+" ORDER BY r.sort_order,r."+kind.label+",i.id LIMIT ? OFFSET ?",
                args.toArray()).stream().map(AdminContentService::camel).toList();
            return new RevisionPage(version(row),page(items,page,size,count));});
    }
    private void insert(String table,List<String> columns,List<Object> values) {
        db.update("INSERT INTO "+table+" ("+String.join(",",columns)+") VALUES ("+
            String.join(",",Collections.nCopies(columns.size(),"?"))+")",values.toArray());
    }
    private void identity(Kind kind,UUID id,Command command,boolean create) {
        var rows=db.queryForList("SELECT * FROM "+kind.identity+" WHERE id=?",id);
        if(rows.isEmpty()) {
            if(!create || command.entityId()!=null)throw AdminContentException.missing();
            if(kind==Kind.WIKI) db.update("INSERT INTO wiki_pages(id,slug,page_type) VALUES (?,?,?)",id,command.slug(),command.pageType());
            else db.update("INSERT INTO "+kind.identity+"(id,code,slug) VALUES (?,?,?)",id,command.code(),command.slug());
        } else {
            var row=rows.getFirst();
            boolean same=Objects.equals(row.get("slug"),command.slug()) && (kind==Kind.WIKI
                ? Objects.equals(row.get("page_type"),command.pageType()) : Objects.equals(row.get("code"),command.code()));
            if(!same)throw AdminContentException.conflict("IDENTITY_IMMUTABLE","Identity code, slug and page type are immutable");
        }
    }
    private static void image(Object value) {
        if(value==null)return;String url=(String)value;
        try {
            URI uri=URI.create(url);
            boolean asset=url.startsWith("/assets/") && !url.contains("\\") && !url.contains("..") && !uri.isAbsolute();
            boolean https="https".equals(uri.getScheme()) && uri.getHost()!=null && uri.getUserInfo()==null;
            if(!asset && !https)throw new IllegalArgumentException();
        }catch(IllegalArgumentException invalid){throw new AdminContentException(HttpStatus.BAD_REQUEST,"INVALID_IMAGE_URL","Image must use HTTPS or a local /assets/ path");}
    }
    public Mutation write(UUID release,Kind kind,UUID pathId,Command command,boolean create,Actor actor) {
        return tx.execute(s->{actor(actor);editable(releaseRow(release,true),command.expectedVersion());
            UUID id=create?(command.entityId()==null?UUID.randomUUID():command.entityId()):pathId;
            if(!create && command.entityId()!=null && !command.entityId().equals(id))
                throw AdminContentException.conflict("IDENTITY_IMMUTABLE","Body entityId must match path identity");
            if(!create)item(release,kind,id);
            identity(kind,id,command,create);
            image(command.fields().get("portrait_url"));image(command.fields().get("artwork_url"));
            if(kind==Kind.CARDS) {
                for(var ref:new Object[][]{{Kind.SETS,command.fields().get("card_set_id")},{Kind.CHARACTERS,command.fields().get("character_id")}}) {
                    if(ref[1]!=null) {
                        var target=(Kind)ref[0];
                        if(db.queryForObject("SELECT COUNT(*) FROM "+target.revision+" WHERE release_id=? AND "+target.fk+"=?",Integer.class,release,ref[1])!=1)
                            throw AdminContentException.conflict("REFERENCE_NOT_IN_RELEASE","Card references must exist in the same release");
                    }
                }
            }
            if(create) {
                var columns=new ArrayList<>(List.of("id",kind.fk,"release_id"));columns.addAll(kind.columns);
                var values=new ArrayList<Object>(List.of(UUID.randomUUID(),id,release));
                kind.columns.forEach(c->values.add(command.fields().get(c)));insert(kind.revision,columns,values);
            } else {
                var args=new ArrayList<Object>();kind.columns.forEach(c->args.add(command.fields().get(c)));args.add(release);args.add(id);
                db.update("UPDATE "+kind.revision+" SET "+String.join(",",kind.columns.stream().map(c->c+"=?").toList())+
                    " WHERE release_id=? AND "+kind.fk+"=?",args.toArray());
            }
            long version=advance(release);audit(actor,"CONTENT_"+kind.name()+(create?"_CREATED":"_UPDATED"),kind.name(),id,release,version);
            return new Mutation(id,version,item(release,kind,id));});
    }
    public DeleteResult delete(UUID release,Kind kind,UUID id,long expected,Actor actor) {
        return tx.execute(s->{actor(actor);editable(releaseRow(release,true),expected);item(release,kind,id);
            if(kind==Kind.SETS || kind==Kind.CHARACTERS) {
                String ref=kind==Kind.SETS?"card_set_id":"character_id";
                if(db.queryForObject("SELECT COUNT(*) FROM card_revisions WHERE release_id=? AND "+ref+"=?",Long.class,release,id)>0)
                    throw AdminContentException.conflict("CONTENT_IN_USE","Remove dependent card revisions before removing this revision");
            }
            db.update("DELETE FROM "+kind.revision+" WHERE release_id=? AND "+kind.fk+"=?",release,id);
            long version=advance(release);audit(actor,"CONTENT_"+kind.name()+"_REMOVED",kind.name(),id,release,version);
            return new DeleteResult(id,version);});
    }
    private void previewBudget(UUID release) {
        long count=0,characters=0;
            for(var kind:Kind.values()) {
                count+=db.queryForObject("SELECT COUNT(*) FROM "+kind.revision+" WHERE release_id=?",Long.class,release);
                var text=kind.columns.stream().filter(c->!c.endsWith("_id") && !Set.of("sort_order","copies_in_deck").contains(c))
                    .map(c->"COALESCE(CHAR_LENGTH("+c+"),0)").toList();
                characters+=db.queryForObject("SELECT COALESCE(SUM("+String.join("+",text)+"),0) FROM "+kind.revision+" WHERE release_id=?",Long.class,release);
            }
            if(count>2000 || characters>500000)throw new AdminContentException(HttpStatus.PAYLOAD_TOO_LARGE,"PREVIEW_TOO_LARGE","Use paginated content endpoints for this release");
    }
    public Map<String,Object> preview(UUID release) {
        return read.execute(s->{var row=releaseRow(release,false);previewBudget(release);
            var content=new LinkedHashMap<String,Object>();
            for(var kind:Kind.values())content.put(kind.path,db.queryForList(select(kind)+" WHERE r.release_id=? ORDER BY r.sort_order,i.id",release)
                .stream().map(AdminContentService::camel).toList());
            return Map.of("release",camel(row),"content",content,"previewOnly",true);});
    }
    public Map<String,Object> dashboard() {
        return read.execute(s->{var counts=new LinkedHashMap<String,Object>();
            for(String status:List.of("DRAFT","PUBLISHED","ARCHIVED"))counts.put(status.toLowerCase(Locale.ROOT),
                db.queryForObject("SELECT COUNT(*) FROM content_releases WHERE status=?",Long.class,status));
            return Map.of("asOf",Instant.now().toString(),"releases",counts,
                "feedbackNew",db.queryForObject("SELECT COUNT(*) FROM player_feedback WHERE status='NEW'",Long.class),
                "cardsNeedingReview",db.queryForObject("SELECT COUNT(*) FROM card_revisions r JOIN content_releases c ON c.id=r.release_id WHERE c.status='DRAFT' AND r.rule_status='NEEDS_REVIEW'",Long.class));});
    }
    public Page<Map<String,Object>> audits(int page,int size,UUID release) {
        paging(page,size,"");
        return read.execute(s->{String where=" WHERE action LIKE 'CONTENT!_%' ESCAPE '!'";var args=new ArrayList<Object>();
            if(release!=null){where+=" AND details_redacted LIKE ?";args.add("releaseId="+release+";version=%");}
            long count=db.queryForObject("SELECT COUNT(*) FROM audit_events"+where,Long.class,args.toArray());
            args.add(size);args.add(page*size);
            return page(db.queryForList("SELECT id,actor_id,action,entity_type,entity_id,outcome,details_redacted,created_at FROM audit_events"+where+
                " ORDER BY created_at DESC,id LIMIT ? OFFSET ?",args.toArray()).stream().map(AdminContentService::camel).toList(),page,size,count);});
    }
    public Page<Map<String,Object>> identities(Kind kind,int page,int size,String q) {
        paging(page,size,q);
        return read.execute(s->{String escaped="%"+q.trim().toLowerCase(Locale.ROOT).replace("!","!!").replace("%","!%").replace("_","!_")+"%";
            String label=kind==Kind.WIKI?"page_type":"code";
            String where=" WHERE LOWER(slug) LIKE ? ESCAPE '!' OR LOWER("+label+") LIKE ? ESCAPE '!'";
            long count=db.queryForObject("SELECT COUNT(*) FROM "+kind.identity+where,Long.class,escaped,escaped);
            return page(db.queryForList("SELECT id,slug,"+label+" FROM "+kind.identity+where+" ORDER BY slug,id LIMIT ? OFFSET ?",
                escaped,escaped,size,page*size).stream().map(AdminContentService::camel).toList(),page,size,count);});
    }
}
