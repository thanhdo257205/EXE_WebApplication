import { all, type Executor, type Row } from './db.ts';

/** Effective privileges come from current database state; client/JWT role claims are ignored. */
export async function accessView(db: Executor, user: Row) {
  const owner = (await all(db, 'SELECT user_id FROM rbac_owner WHERE slot=1'))[0];
  const admin = user.role === 'ADMIN' && Boolean(user.enabled);
  const isOwner = admin && owner?.user_id === user.id;
  return {
    adminLevel: admin ? (isOwner ? 'OWNER' : 'DELEGATED') : null,
    permissions: admin ? ['admin:operate', 'users:read', ...(isOwner ? ['users:manage-roles'] : [])] : [],
  };
}
