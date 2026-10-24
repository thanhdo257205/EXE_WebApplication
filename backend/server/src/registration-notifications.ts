import type { Executor } from './db.ts';
import { execute } from './db.ts';
import { transaction } from './db.ts';
import type { Client } from '@libsql/client';

/** Additive, idempotent startup upgrade; existing feedback events/read receipts stay intact. */
export async function initializeRegistrationNotifications(db: Client): Promise<void> {
  await transaction(db, async tx => {
    await execute(tx, `CREATE TABLE IF NOT EXISTS admin_registration_notifications (
      id INTEGER PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES app_users(id),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now'))
    )`);
    await execute(tx, `CREATE TABLE IF NOT EXISTS admin_registration_notification_reads (
      notification_id INTEGER NOT NULL REFERENCES admin_registration_notifications(id),
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      read_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now')),
      PRIMARY KEY (notification_id,user_id)
    )`);
  });
}

export async function notifyRegistration(db: Executor, userId: string): Promise<void> {
  await execute(
    db,
    'INSERT INTO admin_registration_notifications(user_id) VALUES (?) ON CONFLICT(user_id) DO NOTHING',
    [userId]
  );
}
