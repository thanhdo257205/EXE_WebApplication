import type { Client, InValue } from '@libsql/client';
import { z } from 'zod';
import { getCookie } from 'hono/cookie';
import { streamSSE } from 'hono/streaming';
import { all, one, scalar, execute, transaction, uuid, now, at, camel, page, fail, type Executor } from './db.ts';
import { authorize, requireActor, authenticate, type Api, type Config } from './auth.ts';

const category = z.enum(['RULE_QUESTION', 'CARD_ISSUE', 'PLAYTEST', 'OTHER']);
const status = z.enum(['NEW', 'IN_REVIEW', 'RESOLVED', 'REJECTED']);
const optionalId = z.string().uuid().nullable().optional().default(null);
const paging = z.object({ page: z.coerce.number().int().min(0).max(10000).default(0), size: z.coerce.number().int().min(1).max(100).default(20) });

async function summary(db: Executor, user: string) {
  const row = await one(db, `SELECT fb.latest AS feedback_latest,reg.latest AS registration_latest,
    fb.total+reg.total AS total,fb.unread+reg.unread AS unread FROM
    (SELECT COALESCE(MAX(n.id),0) AS latest,COUNT(*) AS total,COUNT(*)-COUNT(r.notification_id) AS unread
      FROM admin_notifications n LEFT JOIN admin_notification_reads r ON r.notification_id=n.id AND r.user_id=?) fb
    CROSS JOIN
    (SELECT COALESCE(MAX(n.id),0) AS latest,COUNT(*) AS total,COUNT(*)-COUNT(r.notification_id) AS unread
      FROM admin_registration_notifications n LEFT JOIN admin_registration_notification_reads r ON r.notification_id=n.id AND r.user_id=?) reg`, [user, user]);
  return { latestId: `${row.feedback_latest}:${row.registration_latest}`, totalElements: Number(row.total), unreadCount: Number(row.unread) };
}

function parseNotificationId(param: string | undefined): { kind: 'registration' | 'feedback'; id: number; raw: string } {
  if (!param) return fail(400, 'INVALID_REQUEST');
  const trimmed = param.trim();
  if (trimmed.startsWith('registration:')) {
    const rawNum = trimmed.slice('registration:'.length).trim();
    if (!/^[1-9]\d*$/.test(rawNum)) fail(400, 'INVALID_REQUEST');
    const id = Number(rawNum);
    if (!Number.isSafeInteger(id) || id <= 0) fail(400, 'INVALID_REQUEST');
    return { kind: 'registration', id, raw: `registration:${id}` };
  }
  if (!/^[1-9]\d*$/.test(trimmed)) fail(400, 'INVALID_REQUEST');
  const id = Number(trimmed);
  if (!Number.isSafeInteger(id) || id <= 0) fail(400, 'INVALID_REQUEST');
  return { kind: 'feedback', id, raw: String(id) };
}

export function feedbackRoutes(app: Api, db: Client, cfg: Config) {
  app.post('/api/v1/feedback', async c => {
    const actor = requireActor(c); const b = z.object({ releaseId: optionalId, cardId: optionalId, pageId: optionalId, category, message: z.string().trim().min(1).max(5000), contactEmail: z.union([z.literal(''), z.string().email().max(254)]).nullable().optional() }).parse(await c.req.json());
    return c.json(await transaction(db, async tx => {
      await authorize(tx, actor);
      if ((b.cardId && b.pageId) || ((b.cardId || b.pageId) && !b.releaseId)) return fail(400, 'INVALID_REFERENCE');
      if (b.releaseId) {
        await one(tx, "SELECT id FROM content_releases WHERE id=? AND status IN ('PUBLISHED','ARCHIVED') AND published_at IS NOT NULL", [b.releaseId]);
        if (b.cardId) await one(tx, 'SELECT id FROM card_revisions WHERE release_id=? AND card_id=?', [b.releaseId, b.cardId]);
        if (b.pageId) await one(tx, 'SELECT id FROM wiki_page_revisions WHERE release_id=? AND page_id=?', [b.releaseId, b.pageId]);
      }
      if (await scalar(tx, 'SELECT COUNT(*) FROM player_feedback WHERE user_id=? AND created_at>=?', [actor.id, at(Date.now() - 3600000)]) >= 5) return fail(429, 'FEEDBACK_RATE_LIMIT');
      const id = uuid(); await execute(tx, 'INSERT INTO player_feedback(id,user_id,release_id,card_id,page_id,category,message,contact_email) VALUES (?,?,?,?,?,?,?,?)', [id, actor.id, b.releaseId, b.cardId, b.pageId, b.category, b.message, b.contactEmail || null]);
      await execute(tx, 'INSERT INTO admin_notifications(feedback_id) VALUES (?)', [id]);
      return { id, status: 'NEW' };
    }), 201);
  });
  app.get('/api/v1/admin/feedback', async c => c.json(await transaction(db, async tx => {
    requireActor(c, true); const q = paging.parse(c.req.query()), state = status.optional().parse(c.req.query('status')), kind = category.optional().parse(c.req.query('category')), release = z.string().uuid().optional().parse(c.req.query('releaseId'));
    let where = ' WHERE 1=1'; const args: InValue[] = [];
    for (const [column, value] of [['status', state], ['category', kind], ['release_id', release]]) if (value) { where += ` AND ${column}=?`; args.push(value); }
    const count = await scalar(tx, 'SELECT COUNT(*) FROM player_feedback' + where, args);
    return page((await all(tx, 'SELECT id,release_id,card_id,page_id,category,status,version,created_at,updated_at FROM player_feedback' + where + ' ORDER BY created_at DESC,id LIMIT ? OFFSET ?', [...args, q.size, q.page * q.size])).map(camel), q.page, q.size, count);
  }, 'read')));
  app.get('/api/v1/admin/feedback/:id', async c => { requireActor(c, true); return c.json(camel(await one(db, 'SELECT * FROM player_feedback WHERE id=?', [z.string().uuid().parse(c.req.param('id'))]))); });
  app.put('/api/v1/admin/feedback/:id', async c => {
    const actor = requireActor(c, true), id = z.string().uuid().parse(c.req.param('id')); const b = z.object({ expectedVersion: z.number().int().nonnegative(), status, moderationNote: z.string().trim().min(1).max(2000) }).parse(await c.req.json());
    return c.json(await transaction(db, async tx => {
      await authorize(tx, actor, true); const current = await one(tx, 'SELECT * FROM player_feedback WHERE id=?', [id]);
      if (current.version !== b.expectedVersion) return fail(409, 'VERSION_CONFLICT');
      const previous = current.status, next = b.status;
      if (!(previous === next || (next !== 'NEW' && (['NEW', 'IN_REVIEW'].includes(previous) || next === 'IN_REVIEW')))) return fail(409, 'INVALID_TRANSITION');
      await execute(tx, 'UPDATE player_feedback SET status=?,moderation_note=?,moderated_by=?,version=version+1,updated_at=? WHERE id=?', [next, b.moderationNote, actor.id, now(), id]);
      await execute(tx, "INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,outcome,details_redacted) VALUES (?,?,'FEEDBACK_MODERATED','PLAYER_FEEDBACK',?,'SUCCESS',?)", [uuid(), actor.id, id, `from=${previous};to=${next};version=${b.expectedVersion + 1}`]);
      return camel(await one(tx, 'SELECT * FROM player_feedback WHERE id=?', [id]));
    }));
  });
  app.get('/api/v1/admin/notifications', async c => c.json(await transaction(db, async tx => {
    const actor = requireActor(c, true); await authorize(tx, actor, true); const q = paging.extend({ size: z.coerce.number().int().min(1).max(50).default(20) }).parse(c.req.query()); const s = await summary(tx, actor.id);
    const rows = await all(tx, `
      SELECT event_type, numeric_id, source_id, created_at, read_at FROM (
        SELECT 'FEEDBACK_NEW' AS event_type, n.id AS numeric_id, n.feedback_id AS source_id, n.created_at, r.read_at
        FROM admin_notifications n
        LEFT JOIN admin_notification_reads r ON r.notification_id=n.id AND r.user_id=?
        UNION ALL
        SELECT 'USER_REGISTERED' AS event_type, n.id AS numeric_id, n.user_id AS source_id, n.created_at, r.read_at
        FROM admin_registration_notifications n
        LEFT JOIN admin_registration_notification_reads r ON r.notification_id=n.id AND r.user_id=?
      )
      ORDER BY created_at DESC, numeric_id DESC, event_type ASC
      LIMIT ? OFFSET ?
    `, [actor.id, actor.id, q.size, q.page * q.size]);
    return {
      ...page(rows.map(row => {
        const isReg = row.event_type === 'USER_REGISTERED';
        return {
          id: isReg ? `registration:${row.numeric_id}` : String(row.numeric_id),
          type: row.event_type,
          title: isReg ? 'Có tài khoản mới đăng ký' : 'Có phản hồi người chơi mới',
          sourceId: row.source_id,
          href: isReg ? '/admin/users' : '/admin',
          createdAt: row.created_at,
          read: row.read_at !== null,
        };
      }), q.page, q.size, s.totalElements),
      unreadCount: s.unreadCount,
    };
  }, 'read')));
  app.post('/api/v1/admin/notifications/:id/read', async c => {
    const actor = requireActor(c, true), target = parseNotificationId(c.req.param('id'));
    return c.json(await transaction(db, async tx => {
      await authorize(tx, actor, true);
      if (target.kind === 'registration') {
        await one(tx, 'SELECT id FROM admin_registration_notifications WHERE id=?', [target.id]);
        await execute(tx, 'INSERT INTO admin_registration_notification_reads(notification_id,user_id) VALUES (?,?) ON CONFLICT(notification_id,user_id) DO NOTHING', [target.id, actor.id]);
      } else {
        await one(tx, 'SELECT id FROM admin_notifications WHERE id=?', [target.id]);
        await execute(tx, 'INSERT INTO admin_notification_reads(notification_id,user_id) VALUES (?,?) ON CONFLICT(notification_id,user_id) DO NOTHING', [target.id, actor.id]);
      }
      return { id: target.raw, read: true };
    }));
  });
  const streams = new Map<string, number>();
  app.get('/api/v1/admin/notifications/stream', c => {
    const actor = requireActor(c, true), token = getCookie(c, 'AUTH_TOKEN');
    if ([...streams.values()].reduce((a, b) => a + b, 0) >= 20 || (streams.get(actor.id) || 0) >= 2) return fail(429, 'STREAM_LIMIT');
    streams.set(actor.id, (streams.get(actor.id) || 0) + 1);
    c.header('Cache-Control', 'no-store, no-transform');
    return streamSSE(c, async stream => {
      const opened = Date.now(); let previous = ''; let aborted = false; stream.onAbort(() => { aborted = true; });
      try {
        while (!aborted) {
          const user = await authenticate(db, cfg, token);
          if (!user || user.role !== 'ADMIN') { await stream.writeSSE({ event: 'auth-required', data: JSON.stringify({ code: 'AUTH_REQUIRED' }) }); break; }
          if (Date.now() - opened >= 45000) { await stream.writeSSE({ event: 'renew', data: JSON.stringify({ reconnect: true }) }); break; }
          const s = await summary(db, actor.id), signature = JSON.stringify(s);
          if (signature !== previous) { await stream.writeSSE({ event: 'summary', id: s.latestId, data: signature, retry: 10000 }); previous = signature; }
          else await stream.write(': heartbeat\n\n');
          await stream.sleep(5000);
        }
      } catch { if (!aborted) await stream.writeSSE({ event: 'retry', data: JSON.stringify({ reconnect: true }) }).catch(() => undefined); }
      finally { const count = (streams.get(actor.id) || 1) - 1; if (count) streams.set(actor.id, count); else streams.delete(actor.id); }
    });
  });
}
