package vn.nhanayhoibao.api.notifications;

import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import vn.nhanayhoibao.api.admin.AdminContentException;
import vn.nhanayhoibao.api.auth.JwtService;

@Service
public class AdminNotificationStreams {
    private final JwtService jwt;
    private final AdminNotificationService notifications;
    private final ScheduledExecutorService clock=Executors.newSingleThreadScheduledExecutor(r->{var thread=new Thread(r,"admin-notifications");thread.setDaemon(true);return thread;});
    private final ExecutorService writers=Executors.newVirtualThreadPerTaskExecutor();
    private final Map<UUID,Session> sessions=new ConcurrentHashMap<>();
    private static final long LIFETIME=45_000;
    private static final class Session {
        final UUID id=UUID.randomUUID(),user;
        final String token;
        final SseEmitter emitter=new SseEmitter(60_000L);
        final long opened=System.nanoTime();
        AdminNotificationService.Summary previous;
        final java.util.concurrent.atomic.AtomicBoolean writing=new java.util.concurrent.atomic.AtomicBoolean();
        Session(UUID user,String token){this.user=user;this.token=token;}
    }
    public AdminNotificationStreams(JwtService jwt,AdminNotificationService notifications,
            @Value("${app.notifications.tick-ms:5000}") long tick) {
        this.jwt=jwt;this.notifications=notifications;
        clock.scheduleWithFixedDelay(this::pulse,Math.max(100,tick),Math.max(100,tick),TimeUnit.MILLISECONDS);
    }
    private UUID authorized(String token) {
        var authentication=jwt.authenticate(token);
        if(authentication==null || authentication.getAuthorities().stream().noneMatch(a->a.getAuthority().equals("ROLE_ADMIN")))return null;
        return ((JwtService.JwtPrincipal)authentication.getPrincipal()).id();
    }
    public synchronized SseEmitter open(String token) {
        UUID user=authorized(token);
        if(user==null)throw new AdminContentException(HttpStatus.FORBIDDEN,"ADMIN_REQUIRED","Administrator authentication is required");
        if(sessions.size()>=20 || sessions.values().stream().filter(s->s.user.equals(user)).count()>=2)
            throw new AdminContentException(HttpStatus.TOO_MANY_REQUESTS,"STREAM_LIMIT","Too many notification connections");
        var session=new Session(user,token);sessions.put(session.id,session);
        session.emitter.onCompletion(()->sessions.remove(session.id));
        session.emitter.onTimeout(()->close(session));
        session.emitter.onError(error->sessions.remove(session.id));
        clock.execute(()->dispatch(session));
        return session.emitter;
    }
    private void close(Session session) {sessions.remove(session.id);session.emitter.complete();}
    private void pulse() {for(var session:List.copyOf(sessions.values()))dispatch(session);}
    private void dispatch(Session session) {
        // At most one bounded writer per admitted stream: a slow client cannot stall every admin.
        if(session.writing.compareAndSet(false,true))writers.execute(()->{
            try {send(session);}finally{session.writing.set(false);}
        });
    }
    private void send(Session session) {
        if(!sessions.containsKey(session.id))return;
        try {
            // Recheck signature, absolute JWT expiry, enabled, role and auth_version on every pulse.
            // Every query releases its database connection before writing to the client.
            if(!session.user.equals(authorized(session.token))) {
                session.emitter.send(SseEmitter.event().name("auth-required").data(Map.of("code","AUTH_REQUIRED")));
                close(session);return;
            }
            if(TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-session.opened)>=LIFETIME) {
                session.emitter.send(SseEmitter.event().name("renew").data(Map.of("reconnect",true)));
                close(session);return;
            }
            var summary=notifications.summary(session.user);
            if(!summary.equals(session.previous)) {
                session.emitter.send(SseEmitter.event().name("summary").id(summary.latestId()).reconnectTime(10_000).data(summary));
                session.previous=summary;
            } else session.emitter.send(SseEmitter.event().comment("heartbeat"));
        } catch(IOException disconnected) {sessions.remove(session.id);}
        catch(Exception unavailable) {
            // No request/JWT/database exception is sent to the browser or application logs.
            try {session.emitter.send(SseEmitter.event().name("retry").data(Map.of("reconnect",true)));}catch(Exception ignored){}
            close(session);
        }
    }
    @PreDestroy void stop() {clock.shutdownNow();for(var session:List.copyOf(sessions.values()))close(session);writers.shutdownNow();}
}
