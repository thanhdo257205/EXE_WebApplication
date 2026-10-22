package vn.nhanayhoibao.api.content;

import java.sql.Timestamp;
import java.text.Normalizer;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class PublicContentService {
    // Explicit public allowlists. Never reuse admin preview, SELECT * or user-supplied SQL identifiers.
    public enum Kind {
        CHARACTERS("characters","game_characters","character_revisions","character_id",
            "i.code,i.slug,r.name,r.biography,r.ability_text,r.portrait_url,r.sort_order",
            "name,biography,ability_text,portrait_url"),
        SETS("card-sets","card_sets","card_set_revisions","card_set_id",
            "i.code,i.slug,r.name,r.description,r.sort_order","name,description"),
        CARDS("cards","game_cards","card_revisions","card_id",
            "i.code,i.slug,r.card_set_id,r.character_id,r.name,r.effect_text,r.ruling_notes,r.rule_status,r.copies_in_deck,r.artwork_url,r.sort_order",
            "name,effect_text,ruling_notes,rule_status,artwork_url"),
        WIKI("wiki-pages","wiki_pages","wiki_page_revisions","page_id",
            "i.slug,i.page_type,r.title,r.summary,r.body_markdown,r.rule_status,r.sort_order",
            "title,summary,body_markdown,rule_status");
        final String path,identity,revision,fk,columns,textColumns;
        Kind(String path,String identity,String revision,String fk,String columns,String textColumns) {
            this.path=path;this.identity=identity;this.revision=revision;this.fk=fk;this.columns=columns;this.textColumns=textColumns;
        }
        public static Kind parse(String path) {
            return Arrays.stream(values()).filter(k->k.path.equals(path)).findFirst().orElseThrow(PublicContentException::missing);
        }
    }
    public record Page(List<Map<String,Object>> items,int page,int size,long totalElements,long totalPages) {}
    public record Listing(Map<String,Object> release,Page result) {}
    private final JdbcTemplate db;
    private final TransactionTemplate read;
    private static final Pattern ACCENTS=Pattern.compile("\\p{M}+");
    private record Candidate(UUID id,int order,String name) {}
    public PublicContentService(JdbcTemplate db,PlatformTransactionManager manager) {
        this.db=db;read=new TransactionTemplate(manager);
        read.setReadOnly(true);read.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
    }
    private static Map<String,Object> camel(Map<String,Object> row) {
        var result=new LinkedHashMap<String,Object>();
        row.forEach((key,value)->{
            var words=key.toLowerCase(Locale.ROOT).split("_");var name=new StringBuilder(words[0]);
            for(int i=1;i<words.length;i++)name.append(Character.toUpperCase(words[i].charAt(0))).append(words[i].substring(1));
            if(value instanceof Timestamp time)value=time.toInstant().toString();
            else if(value instanceof OffsetDateTime time)value=time.toInstant().toString();
            result.put(name.toString(),value);
        });return result;
    }
    private Map<String,Object> releaseRow(UUID release) {
        String where=release==null?"current_slot=1 AND status='PUBLISHED'":"id=? AND status IN ('PUBLISHED','ARCHIVED')";
        var rows=db.queryForList("SELECT id,version_label,title,published_at,version FROM content_releases WHERE "+where+
            " AND published_at IS NOT NULL",release==null?new Object[]{}:new Object[]{release});
        if(rows.isEmpty())throw PublicContentException.missing();
        return camel(rows.getFirst());
    }
    public Map<String,Object> release(UUID release) {return read.execute(s->releaseRow(release));}
    private String select(Kind kind) {
        return "SELECT i.id,"+kind.columns+" FROM "+kind.identity+" i JOIN "+kind.revision+" r ON r."+kind.fk+"=i.id";
    }
    // Bounded reads keep accent-insensitive Java search portable on both H2 and PostgreSQL,
    // without extensions, N+1 queries or loading unbounded content into the Free-tier JVM.
    private void budget(UUID release,List<Kind> kinds) {
        long count=0,characters=0;
        for(var kind:kinds) {
            String text=String.join("+",Arrays.stream(kind.textColumns.split(",")).map(c->"COALESCE(CHAR_LENGTH("+c+"),0)").toList());
            var totals=db.queryForMap("SELECT COUNT(*) AS rows_count,COALESCE(SUM("+text+"),0) AS text_count FROM "+kind.revision+" WHERE release_id=?",release);
            count+=((Number)totals.get("rows_count")).longValue();characters+=((Number)totals.get("text_count")).longValue();
        }
        if(count>2000 || characters>500000)
            throw new PublicContentException(HttpStatus.PAYLOAD_TOO_LARGE,"CONTENT_TOO_LARGE","Published content exceeds the supported read budget");
    }
    static String normalize(String value) {
        return ACCENTS.matcher(Normalizer.normalize(value,Normalizer.Form.NFD)).replaceAll("")
            .toLowerCase(Locale.ROOT).replace('đ','d').trim();
    }
    private List<Map<String,Object>> items(UUID release,Kind kind) {
        return db.queryForList(select(kind)+" WHERE r.release_id=? ORDER BY r.sort_order,i.id",release)
            .stream().map(PublicContentService::camel).toList();
    }
    public Listing list(UUID requested,Kind kind,int page,int size,String q,UUID set,UUID character,String pageType) {
        if(page<0 || page>10000 || size<1 || size>100 || q==null || q.length()>100
                || ((set!=null || character!=null) && kind!=Kind.CARDS)
                || (pageType!=null && (kind!=Kind.WIKI || !Set.of("STORY","RULE","GUIDE","FAQ","DEVLOG").contains(pageType))))
            throw PublicContentException.query();
        return read.execute(s->{
            var release=releaseRow(requested);UUID id=(UUID)release.get("id");budget(id,List.of(kind));
            String query=normalize(q);
            // Search/sort only bounded metadata. Large bodies, biographies and artwork URLs
            // cross the database connection only for the requested page, in this same snapshot.
            String title=kind==Kind.WIKI?"r.title":"r.name";
            String code=kind==Kind.WIKI?"NULL":"i.code";
            var sql=new StringBuilder("SELECT i.id,r.sort_order,"+title+" AS label,i.slug,"+code+
                " AS code FROM "+kind.identity+" i JOIN "+kind.revision+" r ON r."+kind.fk+"=i.id WHERE r.release_id=?");
            var args=new ArrayList<Object>();args.add(id);
            if(set!=null){sql.append(" AND r.card_set_id=?");args.add(set);}
            if(character!=null){sql.append(" AND r.character_id=?");args.add(character);}
            if(pageType!=null){sql.append(" AND i.page_type=?");args.add(pageType);}
            var sorted=db.query(sql.toString(),(row,index)->{
                String name=normalize(row.getString("label"));
                boolean matches=query.isEmpty() || name.contains(query) || normalize(row.getString("slug")).contains(query)
                    || (row.getString("code")!=null && normalize(row.getString("code")).contains(query));
                return matches?new Candidate(row.getObject("id",UUID.class),row.getInt("sort_order"),name):null;
            },args.toArray()).stream().filter(Objects::nonNull).sorted(Comparator
                .comparingInt(Candidate::order).thenComparing(Candidate::name)
                .thenComparing(row->row.id().toString())).toList();
            long count=sorted.size();
            var selected=sorted.stream().skip((long)page*size).limit(size).map(Candidate::id).toList();
            List<Map<String,Object>> result=List.of();
            if(!selected.isEmpty()) {
                var pageArgs=new ArrayList<Object>();pageArgs.add(id);pageArgs.addAll(selected);
                var rows=db.queryForList(select(kind)+" WHERE r.release_id=? AND i.id IN ("+
                    String.join(",",Collections.nCopies(selected.size(),"?"))+")",pageArgs.toArray());
                var byId=new HashMap<UUID,Map<String,Object>>();
                for(var row:rows)byId.put((UUID)row.get("id"),camel(row));
                result=selected.stream().map(byId::get).toList();
            }
            return new Listing(release,new Page(result,page,size,count,(count+size-1)/size));
        });
    }
    public Map<String,Object> detail(UUID requested,Kind kind,String key) {
        if(key.length()>160 || !key.matches("[a-zA-Z0-9_-]+"))throw PublicContentException.missing();
        return read.execute(s->{
            var release=releaseRow(requested);UUID id=(UUID)release.get("id");
            // Slug route supports permanent URLs; UUID lookup is a separate, unambiguous route.
            var rows=db.queryForList(select(kind)+" WHERE r.release_id=? AND i.slug=?",id,key);
            if(rows.isEmpty())throw PublicContentException.missing();
            return Map.of("release",release,"item",camel(rows.getFirst()));
        });
    }
    public Map<String,Object> byId(UUID requested,Kind kind,UUID entity) {
        return read.execute(s->{
            var release=releaseRow(requested);
            var rows=db.queryForList(select(kind)+" WHERE r.release_id=? AND i.id=?",release.get("id"),entity);
            if(rows.isEmpty())throw PublicContentException.missing();
            return Map.of("release",release,"item",camel(rows.getFirst()));
        });
    }
    public Map<String,Object> snapshot(UUID requested) {
        return read.execute(s->{
            var release=releaseRow(requested);UUID id=(UUID)release.get("id");budget(id,List.of(Kind.values()));
            var content=new LinkedHashMap<String,Object>();
            for(var kind:Kind.values())content.put(kind.path,items(id,kind));
            return Map.of("schemaVersion",1,"release",release,"content",content);
        });
    }
}
