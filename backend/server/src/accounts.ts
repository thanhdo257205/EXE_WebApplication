import type { Client } from '@libsql/client';
import { all, execute, fail, one, transaction, uuid } from './db.ts';
import { notifyRegistration } from './registration-notifications.ts';
import { acceptAdminInvite } from './admin-invites.ts';

/**
 * Password registration proves no mailbox ownership, so a pending invite is never
 * consumed here. The owner must promote the account explicitly after verification.
 */
export async function registerPasswordAccount(db: Client, account: { email: string; passwordHash: string; displayName: string }) {
  return transaction(db, async tx => {
    const id = uuid();
    await execute(tx, 'INSERT INTO app_users(id,email,password_hash,display_name,role) VALUES (?,?,?,?,?)', [id, account.email, account.passwordHash, account.displayName, 'CUSTOMER']);
    await notifyRegistration(tx, id);
    return one(tx, 'SELECT * FROM app_users WHERE id=?', [id]);
  });
}

/** Called only after the OAuth callback has verified provider signature, nonce and email. */
export async function googleAccount(db: Client, identity: { subject: string; email: string; displayName: string }) {
  return transaction(db, async tx => {
    const found = (await all(tx, 'SELECT * FROM app_users WHERE google_subject=?', [identity.subject]))[0];
    if (found) { if (!found.enabled) return fail(401, 'OAUTH_FAILED'); return found; }
    if ((await all(tx, 'SELECT id FROM app_users WHERE email=?', [identity.email])).length) return fail(409, 'ACCOUNT_LINK_REQUIRED');
    const id = uuid();
    await execute(tx, 'INSERT INTO app_users(id,email,google_subject,display_name,role) VALUES (?,?,?,?,?)', [id, identity.email, identity.subject, identity.displayName, 'CUSTOMER']);
    await acceptAdminInvite(tx, id, identity.email, 'google');
    await notifyRegistration(tx, id);
    return one(tx, 'SELECT * FROM app_users WHERE id=?', [id]);
  });
}
