import { z } from 'zod';
import type { Client } from '@libsql/client';
import { all, execute, fail, one, page, scalar, transaction, uuid, type Row } from './db.ts';
import { authorize, requireActor, type Api } from './auth.ts';
import { accessView } from './rbac-policy.ts';
import { initializeAdminInvites, inviteView, selectInvites } from './admin-invites.ts';

// Ownership is a persistent account ID, never an email match or a request payload.
const ownerTable = `CREATE TABLE IF NOT EXISTS rbac_owner (
  slot INTEGER PRIMARY KEY CHECK (slot=1),
  user_id TEXT NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now'))
)`;

/** Additive upgrade: bind the sole existing enabled ADMIN once; fail closed on ambiguity. */
export async function initializeRbac(db: Client): Promise<void> {
  await initializeAdminInvites(db);
  await execute(db, ownerTable);
  await transaction(db, async tx => {
    if ((await all(tx, 'SELECT user_id FROM rbac_owner WHERE slot=1')).length) return;
    const admins = await all(tx, "SELECT id,enabled FROM app_users WHERE role='ADMIN' LIMIT 2");
    if (admins.length > 1) throw new Error('RBAC owner is ambiguous; select the existing owner through a reviewed database migration');
    if (admins.length === 1 && admins[0].enabled) {
      await execute(tx, 'INSERT INTO rbac_owner(slot,user_id) VALUES (1,?)', [admins[0].id]);
      await execute(tx, "INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,outcome,details_redacted) VALUES (?,?,'RBAC_OWNER_INITIALIZED','USER',?,'SUCCESS','source=sole-existing-admin')", [uuid(), admins[0].id, admins[0].id]);
    }
  });
}

const userColumns = 'u.id,u.email,u.display_name,u.role,u.enabled,u.auth_version,u.created_at,o.user_id AS owner_id';
const selectUsers = `SELECT ${userColumns} FROM app_users u LEFT JOIN rbac_owner o ON o.user_id=u.id AND o.slot=1`;
const accountView = (u: Row) => ({
  id: u.id, email: u.email, displayName: u.display_name, role: u.role,
  enabled: Boolean(u.enabled), version: u.auth_version, createdAt: u.created_at,
  adminLevel: u.role === 'ADMIN' ? (u.owner_id === u.id ? 'OWNER' : 'DELEGATED') : null,
});

const inviteEmail = z.string().trim().email().max(254).transform(s => s.toLowerCase());

export function rbacRoutes(app: Api, db: Client) {
  app.get('/api/v1/admin/users', async c => {
    const actor = requireActor(c, true);
    const q = z.object({
      page: z.coerce.number().int().min(0).max(10000).default(0),
      size: z.coerce.number().int().min(1).max(100).default(20),
      q: z.string().trim().max(100).default(''),
    }).parse(c.req.query());
    return c.json(await transaction(db, async tx => {
      const current = await authorize(tx, actor, true);
      const escaped = `%${q.q.toLowerCase().replace(/[!%_]/g, ch => '!' + ch)}%`;
      const where = " WHERE lower(u.email) LIKE ? ESCAPE '!' OR lower(u.display_name) LIKE ? ESCAPE '!'";
      const args = [escaped, escaped];
      const count = await scalar(tx, 'SELECT COUNT(*) FROM app_users u' + where, args);
      const users = await all(tx, selectUsers + where + ' ORDER BY u.created_at,u.id LIMIT ? OFFSET ?', [...args, q.size, q.page * q.size]);
      const access = await accessView(tx, current);
      return { ...page(users.map(accountView), q.page, q.size, count), canManageRoles: access.permissions.includes('users:manage-roles') };
    }, 'read'));
  });

  app.get('/api/v1/admin/users/invites', async c => {
    const actor = requireActor(c, true);
    return c.json(await transaction(db, async tx => {
      const current = await authorize(tx, actor, true);
      const access = await accessView(tx, current);
      const invites = await all(tx, selectInvites + ' ORDER BY i.created_at,i.id');
      return { items: invites.map(inviteView), canManageRoles: access.permissions.includes('users:manage-roles') };
    }, 'read'));
  });

  // Owner adds a co-admin by email: an existing account is promoted at once, a new email
  // becomes a pending invite accepted inside the registration transaction.
  app.post('/api/v1/admin/users/invites', async c => {
    const actor = requireActor(c, true);
    const b = z.object({ email: inviteEmail }).strict().parse(await c.req.json());
    return c.json(await transaction(db, async tx => {
      const current = await authorize(tx, actor, true);
      if (!(await accessView(tx, current)).permissions.includes('users:manage-roles')) return fail(403, 'OWNER_REQUIRED');
      const target = (await all(tx, selectUsers + ' WHERE u.email=?', [b.email]))[0];
      if (target) {
        if (target.owner_id === target.id) return fail(409, 'ALREADY_OWNER');
        if (target.role === 'ADMIN') return fail(409, 'ALREADY_ADMIN');
        if (!target.enabled) return fail(409, 'ACCOUNT_DISABLED');
        await execute(tx, "UPDATE app_users SET role='ADMIN',auth_version=auth_version+1 WHERE id=?", [target.id]);
        await execute(tx, 'DELETE FROM password_reset_tokens WHERE user_id=?', [target.id]);
        await execute(tx, 'DELETE FROM admin_invites WHERE email=?', [b.email]);
        await execute(tx, "INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,outcome,details_redacted) VALUES (?,?,'USER_ROLE_CHANGED','USER',?,'SUCCESS',?)",
          [uuid(), actor.id, target.id, `role=${target.role}->ADMIN;version=${target.auth_version + 1};source=admin-invite`]);
        return { status: 'PROMOTED', account: accountView(await one(tx, selectUsers + ' WHERE u.id=?', [target.id])) };
      }
      if ((await all(tx, 'SELECT id FROM admin_invites WHERE email=?', [b.email])).length) return fail(409, 'INVITE_EXISTS');
      const id = uuid();
      await execute(tx, 'INSERT INTO admin_invites(id,email,invited_by) VALUES (?,?,?)', [id, b.email, actor.id]);
      await execute(tx, "INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,outcome,details_redacted) VALUES (?,?,'ADMIN_INVITE_CREATED','ADMIN_INVITE',?,'SUCCESS','source=admin-invite;status=pending')",
        [uuid(), actor.id, id]);
      return { status: 'INVITED', invite: inviteView(await one(tx, selectInvites + ' WHERE i.id=?', [id])) };
    }));
  });

  app.delete('/api/v1/admin/users/invites/:id', async c => {
    const actor = requireActor(c, true);
    const inviteId = z.string().uuid().parse(c.req.param('id'));
    return c.json(await transaction(db, async tx => {
      const current = await authorize(tx, actor, true);
      if (!(await accessView(tx, current)).permissions.includes('users:manage-roles')) return fail(403, 'OWNER_REQUIRED');
      if ((await execute(tx, 'DELETE FROM admin_invites WHERE id=?', [inviteId])).rowsAffected !== 1) return fail(404, 'INVITE_NOT_FOUND');
      await execute(tx, "INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,outcome,details_redacted) VALUES (?,?,'ADMIN_INVITE_REVOKED','ADMIN_INVITE',?,'SUCCESS','source=admin-invite')",
        [uuid(), actor.id, inviteId]);
      return { removed: true };
    }));
  });

  app.put('/api/v1/admin/users/:id/role', async c => {
    const actor = requireActor(c, true);
    const targetId = z.string().uuid().parse(c.req.param('id'));
    const b = z.object({ role: z.enum(['ADMIN', 'CUSTOMER']), expectedVersion: z.number().int().nonnegative() }).strict().parse(await c.req.json());
    return c.json(await transaction(db, async tx => {
      // Re-check both current role/session and immutable ownership under the write lock.
      const current = await authorize(tx, actor, true);
      if (!(await accessView(tx, current)).permissions.includes('users:manage-roles')) return fail(403, 'OWNER_REQUIRED');
      const target = await one(tx, selectUsers + ' WHERE u.id=?', [targetId]);
      if (target.owner_id === target.id) return fail(403, 'OWNER_PROTECTED');
      if (target.auth_version !== b.expectedVersion) return fail(409, 'VERSION_CONFLICT');
      if (b.role === 'ADMIN' && !target.enabled) return fail(409, 'ACCOUNT_DISABLED');
      if (target.role === b.role) return { item: accountView(target), changed: false };
      await execute(tx, 'UPDATE app_users SET role=?,auth_version=auth_version+1 WHERE id=? AND auth_version=?', [b.role, target.id, b.expectedVersion]);
      await execute(tx, 'DELETE FROM password_reset_tokens WHERE user_id=?', [target.id]);
      await execute(tx, "INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,outcome,details_redacted) VALUES (?,?,'USER_ROLE_CHANGED','USER',?,'SUCCESS',?)",
        [uuid(), actor.id, target.id, `role=${target.role}->${b.role};version=${b.expectedVersion + 1}`]);
      return { item: accountView(await one(tx, selectUsers + ' WHERE u.id=?', [target.id])), changed: true };
    }));
  });
}
