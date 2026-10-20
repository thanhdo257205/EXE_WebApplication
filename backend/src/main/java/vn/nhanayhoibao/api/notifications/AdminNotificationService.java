package vn.nhanayhoibao.api.notifications;

import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import vn.nhanayhoibao.api.admin.AdminContentException;
import vn.nhanayhoibao.api.admin.AdminContentModels.Actor;

@Service
public class AdminNotificationService {
    public record Item(String id,String type,String title,UUID sourceId,String href,String createdAt,boolean read) {}
    public record Summary(String latestId,long totalElements,long unreadCount) {}
    public record Page(List<Item> items,int page,int size,long totalElements,long totalPages,long unreadCount) {}
    private final JdbcTemplate db;
    private final TransactionTemplate tx,read;
    public AdminNotificationService(JdbcTemplate db,PlatformTransactionManager manager) {
        this.db=db;tx=new TransactionTemplate(manager);read=new TransactionTemplate(manager);
        read.setReadOnly(true);read.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
    }
    private void authorize(Actor actor) {
        var rows=db.queryForList("SELECT enabled,role,auth_version FROM app_users WHERE id=?",actor.id());
        if(rows.isEmpty() || !Boolean.TRUE.equals(rows.getFirst().get("enabled")) || !"ADMIN".equals(rows.getFirst().get("role"))
                || ((Number)rows.getFirst().get("auth_version")).longValue()!=actor.authVersion())
            throw new AdminContentException(HttpStatus.FORBIDDEN,"ADMIN_REQUIRED","Current administrator authorization is required");
    }
    // Called inside the feedback transaction: no notification is visible for a rolled-back submission.
    public void feedbackCreated(UUID feedback) {
        db.update("INSERT INTO admin_notifications(feedback_id) VALUES (?)",feedback);
    }
    Summary summary(UUID user) {
        return read.execute(s->{
            var row=db.queryForMap("SELECT COALESCE(MAX(n.id),0) AS latest,COUNT(*) AS total,COUNT(*)-COUNT(r.notification_id) AS unread FROM admin_notifications n LEFT JOIN admin_notification_reads r ON r.notification_id=n.id AND r.user_id=?",user);
            return new Summary(row.get("latest").toString(),((Number)row.get("total")).longValue(),((Number)row.get("unread")).longValue());
        });
    }
    public Page list(Actor actor,int page,int size) {
        if(page<0 || page>10000 || size<1 || size>50)
            throw new AdminContentException(HttpStatus.BAD_REQUEST,"INVALID_QUERY","page must be 0..10000 and size 1..50");
        return read.execute(s->{
            authorize(actor);var summary=summary(actor.id());
            var items=db.query("SELECT n.id,n.feedback_id,n.created_at,r.read_at FROM admin_notifications n LEFT JOIN admin_notification_reads r ON r.notification_id=n.id AND r.user_id=? ORDER BY n.id DESC LIMIT ? OFFSET ?",
                (row,index)->new Item(Long.toString(row.getLong("id")),"FEEDBACK_NEW","Có phản hồi người chơi mới",
                    row.getObject("feedback_id",UUID.class),"/admin",row.getObject("created_at",OffsetDateTime.class).toInstant().toString(),
                    row.getObject("read_at")!=null),actor.id(),size,page*size);
            return new Page(items,page,size,summary.totalElements(),(summary.totalElements()+size-1)/size,summary.unreadCount());
        });
    }
    public Map<String,Object> markRead(Actor actor,long id) {
        return tx.execute(s->{
            authorize(actor);
            // Serializing this small mutation makes repeated clicks idempotent on H2 and PostgreSQL.
            if(db.queryForList("SELECT id FROM admin_notifications WHERE id=? FOR UPDATE",id).isEmpty())
                throw new AdminContentException(HttpStatus.NOT_FOUND,"NOT_FOUND","Notification not found");
            db.update("INSERT INTO admin_notification_reads(notification_id,user_id) SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM admin_notification_reads WHERE notification_id=? AND user_id=?)",
                id,actor.id(),id,actor.id());
            return Map.of("id",Long.toString(id),"read",true);
        });
    }
}
