import type { Client } from '@libsql/client';
import { all, execute, transaction, uuid, type Executor, type Row } from './db.ts';

/** Additive startup upgrade; pending invites never grant privileges on their own. */
export async function initializeAdminInvites(db: Client): Promise<void> {
  await transaction(db, async tx => {
    await execute(tx, `CREATE TABLE IF NOT EXISTS admin_invites (
      id TEXT NOT NULL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      invited_by TEXT REFERENCES app_users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now'))
    )`);
    await execute(tx, 'CREATE INDEX IF NOT EXISTS ix_admin_invites_created ON admin_invites(created_at)');
  });
}

export const selectInvites = 'SELECT i.id,i.email,i.invited_by,i.created_at,u.display_name AS invited_by_name FROM admin_invites i LEFT JOIN app_users u ON u.id=i.invited_by';
export const inviteView = (row: Row) => ({
  id: row.id, email: row.email,
  invitedByName: row.invited_by_name ?? null,
  createdAt: row.created_at,
});

/**
 * Runs inside the registration transaction so an unavailable audit table or
 * failed role update rolls the new account back instead of granting nothing.
 * Only the Google path may call this: the provider has already verified the mailbox.
 */
export async function acceptAdminInvite(db: Executor, userId: string, email: string, source: 'google'): Promise<boolean> {
  const invite = (await all(db, 'SELECT id FROM admin_invites WHERE email=?', [email]))[0];
  if (!invite) return false;
  await execute(db, "UPDATE app_users SET role='ADMIN' WHERE id=?", [userId]);
  await execute(db, 'DELETE FROM admin_invites WHERE id=?', [invite.id]);
  await execute(db, "INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,outcome,details_redacted) VALUES (?,?,'ADMIN_INVITE_ACCEPTED','USER',?,'SUCCESS',?)",
    [uuid(), userId, userId, `role=CUSTOMER->ADMIN;invite=${invite.id};source=${source}-registration`]);
  return true;
}
