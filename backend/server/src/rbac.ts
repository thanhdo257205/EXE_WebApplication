import { z } from 'zod';
import type { Client } from '@libsql/client';
import { all, execute, fail, one, page, scalar, transaction, uuid, type Row } from './db.ts';
import { authorize, requireActor, type Api } from './auth.ts';
import { accessView } from './rbac-policy.ts';

// Ownership is a persistent account ID, never an email match or a request payload.
const ownerTable = `CREATE TABLE IF NOT EXISTS rbac_owner (
  slot INTEGER PRIMARY KEY CHECK (slot=1),
  user_id TEXT NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now'))
)`;

/** Additive upgrade: bind the sole existing enabled ADMIN once; fail closed on ambiguity. */
export async function initializeRbac(db: Client): Promise<void> {
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
