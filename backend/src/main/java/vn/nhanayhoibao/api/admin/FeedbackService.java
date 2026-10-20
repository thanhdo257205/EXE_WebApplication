package vn.nhanayhoibao.api.admin;

import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import static vn.nhanayhoibao.api.admin.AdminContentModels.*;
import static vn.nhanayhoibao.api.admin.FeedbackController.*;

@Service
public class FeedbackService {
    private final JdbcTemplate db;
    private final TransactionTemplate tx, read;
    private final vn.nhanayhoibao.api.notifications.AdminNotificationService notifications;
    public FeedbackService(JdbcTemplate db, PlatformTransactionManager manager,vn.nhanayhoibao.api.notifications.AdminNotificationService notifications) {
        this.notifications=notifications;
        this.db=db; tx=new TransactionTemplate(manager); read=new TransactionTemplate(manager);
        read.setReadOnly(true); read.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
    }
    private void authorize(Actor actor, boolean admin, boolean lock) {
        // Submission locks its sender to serialize the per-account throttle, never an admin actor.
        var rows=db.queryForList("SELECT role,enabled,auth_version FROM app_users WHERE id=?"+(lock?" FOR UPDATE":""),actor.id());
        if(rows.isEmpty() || !Boolean.TRUE.equals(rows.getFirst().get("enabled"))
                || ((Number)rows.getFirst().get("auth_version")).longValue()!=actor.authVersion()
                || (admin && !"ADMIN".equals(rows.getFirst().get("role"))))
            throw new AdminContentException(HttpStatus.FORBIDDEN,"AUTH_REQUIRED","Current account authorization is required");
    }
    public Map<String,Object> submit(Submit body,Actor actor) {
        return tx.execute(s->{
            authorize(actor,false,true);
            if(body.cardId()!=null && body.pageId()!=null)
                throw new AdminContentException(HttpStatus.BAD_REQUEST,"INVALID_REFERENCE","Choose either a card or a wiki page");
            if((body.cardId()!=null || body.pageId()!=null) && body.releaseId()==null)
                throw new AdminContentException(HttpStatus.BAD_REQUEST,"INVALID_REFERENCE","Content feedback requires a release");
            if(body.releaseId()!=null) {
                // Draft IDs are never accepted or disclosed by this API.
                if(db.queryForObject("SELECT COUNT(*) FROM content_releases WHERE id=? AND status IN ('PUBLISHED','ARCHIVED') AND published_at IS NOT NULL",Long.class,body.releaseId())!=1)
                    throw AdminContentException.missing();
                if(body.cardId()!=null && db.queryForObject("SELECT COUNT(*) FROM card_revisions WHERE release_id=? AND card_id=?",Long.class,body.releaseId(),body.cardId())!=1)
                    throw AdminContentException.missing();
                if(body.pageId()!=null && db.queryForObject("SELECT COUNT(*) FROM wiki_page_revisions WHERE release_id=? AND page_id=?",Long.class,body.releaseId(),body.pageId())!=1)
                    throw AdminContentException.missing();
            }
            if(db.queryForObject("SELECT COUNT(*) FROM player_feedback WHERE user_id=? AND created_at>=?",Long.class,
                    actor.id(),Timestamp.from(Instant.now().minusSeconds(3600)))>=5)
                throw new AdminContentException(HttpStatus.TOO_MANY_REQUESTS,"FEEDBACK_RATE_LIMIT","At most five feedback submissions per hour");
            UUID id=UUID.randomUUID();
            db.update("INSERT INTO player_feedback(id,user_id,release_id,card_id,page_id,category,message,contact_email) VALUES (?,?,?,?,?,?,?,?)",
                id,actor.id(),body.releaseId(),body.cardId(),body.pageId(),body.category().name(),body.message().trim(),
                body.contactEmail()==null || body.contactEmail().isBlank()?null:body.contactEmail().trim());
            notifications.feedbackCreated(id);
            return Map.of("id",id,"status","NEW");
        });
    }
    private Map<String,Object> row(UUID id, boolean lock) {
        var rows=db.queryForList("SELECT * FROM player_feedback WHERE id=?"+(lock?" FOR UPDATE":""),id);
        if(rows.isEmpty())throw AdminContentException.missing();
        return rows.getFirst();
    }
    private Map<String,Object> view(Map<String,Object> row) {
        var result=new LinkedHashMap<String,Object>();
        row.forEach((key,value)->{
            var parts=key.toLowerCase(Locale.ROOT).split("_"); var name=new StringBuilder(parts[0]);
            for(int i=1;i<parts.length;i++)name.append(Character.toUpperCase(parts[i].charAt(0))).append(parts[i].substring(1));
            if(value instanceof OffsetDateTime time)value=time.toInstant().toString();
            else if(value instanceof Timestamp time)value=time.toInstant().toString();
            result.put(name.toString(),value);
        });
        return result;
    }
    public Map<String,Object> detail(UUID id) { return read.execute(s->view(row(id,false))); }
    public Page<Map<String,Object>> list(int page,int size,Status status,UUID release,Category category) {
        if(page<0 || page>10000 || size<1 || size>100)
            throw new AdminContentException(HttpStatus.BAD_REQUEST,"INVALID_QUERY","page must be 0..10000 and size 1..100");
        return read.execute(s->{
            String where=" WHERE 1=1"; var args=new ArrayList<Object>();
            if(status!=null){where+=" AND status=?";args.add(status.name());}
            if(release!=null){where+=" AND release_id=?";args.add(release);}
            if(category!=null){where+=" AND category=?";args.add(category.name());}
            long count=db.queryForObject("SELECT COUNT(*) FROM player_feedback"+where,Long.class,args.toArray());
            args.add(size); args.add(page*size);
            // Contact email, sender ID, message and internal note are only in the private detail view.
            var items=db.queryForList("SELECT id,release_id,card_id,page_id,category,status,version,created_at,updated_at FROM player_feedback"+
                where+" ORDER BY created_at DESC,id LIMIT ? OFFSET ?",args.toArray()).stream().map(this::view).toList();
            return new Page<>(items,page,size,count,(count+size-1)/size);
        });
    }
    public Map<String,Object> moderate(UUID id,Moderate body,Actor actor) {
        return tx.execute(s->{
            authorize(actor,true,false); var current=row(id,true);
            if(((Number)current.get("version")).longValue()!=body.expectedVersion())
                throw AdminContentException.conflict("VERSION_CONFLICT","Reload feedback before editing again");
            String previous=(String)current.get("status"), next=body.status().name();
            // Reopen a resolved/rejected item through IN_REVIEW; NEW is reserved for intake.
            boolean allowed=previous.equals(next) || (!next.equals("NEW") &&
                (previous.equals("NEW") || previous.equals("IN_REVIEW") || next.equals("IN_REVIEW")));
            if(!allowed)throw AdminContentException.conflict("INVALID_TRANSITION","Reopen closed feedback through IN_REVIEW");
            db.update("UPDATE player_feedback SET status=?,moderation_note=?,moderated_by=?,version=version+1,updated_at=? WHERE id=?",
                next,body.moderationNote().trim(),actor.id(),Timestamp.from(Instant.now()),id);
            db.update("INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,outcome,details_redacted) VALUES (?,?,?,?,?,'SUCCESS',?)",
                UUID.randomUUID(),actor.id(),"FEEDBACK_MODERATED","PLAYER_FEEDBACK",id,
                "from="+previous+";to="+next+";version="+(body.expectedVersion()+1));
            return view(row(id,false));
        });
    }
}
