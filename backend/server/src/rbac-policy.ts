import { all, fail, type Executor, type Row } from './db.ts';

/**
 * Fine-grained admin permissions. The catalog is the single source of truth for
 * server-side validation and is mirrored (with Vietnamese labels) in the admin UI.
 * Keys are stable: rename the label, never the key.
 */
export const GRANTABLE_PERMISSIONS = [
  'content:read',
  'releases:create',
  'releases:update',
  'releases:clone',
  'releases:publish',
  'cards:create',
  'cards:update',
  'cards:delete',
  'card-sets:create',
  'card-sets:update',
  'card-sets:delete',
  'characters:create',
  'characters:update',
  'characters:delete',
  'wiki:create',
  'wiki:update',
  'wiki:delete',
  'media:upload',
  'feedback:read',
  'feedback:moderate',
  'assistant:read',
  'assistant:usage:read',
  'assistant:models:update',
  'assistant:models:reorder',
  'assistant:slots:update',
  'assistant:budgets:update',
  'assistant:prompt:request',
  'assistant:prompt:update',
  'assistant:keys:read',
  'assistant:keys:create',
  'assistant:keys:reveal',
  'assistant:keys:test',
  'assistant:keys:revoke',
  'assistant:keys:manage',
  'users:read',
  // Delegable so the owner does not have to be the single person writing grant sets, but it never
  // ships in the default set: handing it out is itself the privilege that must be an explicit act.
  'permissions:manage',
] as const;

export type Permission = (typeof GRANTABLE_PERMISSIONS)[number];
export type PermissionSet = readonly string[];

/** Creating and demoting admins stays with the owner; only the grant write is delegable. */
export const OWNER_ONLY_PERMISSIONS = ['users:manage-roles'] as const;

/** Default co-admin set keeps the behaviour that existed before fine-grained RBAC. */
export const DEFAULT_DELEGATED_PERMISSIONS: readonly Permission[] =
  // Saving the assistant system prompt straight to the database is an explicit grant; the role default is
  // request-only, so a co-admin proposes a change and it lands only after someone with the update right approves it.
  // permissions:manage is excluded for the same reason: accounts promoted before this change must not gain it silently.
  GRANTABLE_PERMISSIONS.filter(permission =>
    permission !== 'assistant:keys:manage' && permission !== 'assistant:prompt:update' && permission !== 'permissions:manage');

const grantable = new Set<string>(GRANTABLE_PERMISSIONS);
export const isGrantablePermission = (value: string): value is Permission => grantable.has(value);

const CONTENT_WRITE_PERMISSIONS = new Set<string>([
  'releases:create', 'releases:update', 'releases:clone', 'releases:publish',
  'cards:create', 'cards:update', 'cards:delete',
  'card-sets:create', 'card-sets:update', 'card-sets:delete',
  'characters:create', 'characters:update', 'characters:delete',
  'wiki:create', 'wiki:update', 'wiki:delete',
  'media:upload',
]);

/** Dedupe, add module read dependencies and return the canonical catalog order. */
export function normalizePermissions(input: readonly string[]): Permission[] {
  const granted = new Set<string>();
  for (const value of input) if (isGrantablePermission(value)) granted.add(value);
  for (const permission of [...granted]) {
    if (CONTENT_WRITE_PERMISSIONS.has(permission)) granted.add('content:read');
    if (permission.startsWith('assistant:')) granted.add('assistant:read');
    // A key action without keys:read would let the account act on a key it can never list.
    if (/^assistant:keys:(create|reveal|test|revoke|manage)$/.test(permission)) granted.add('assistant:keys:read');
    // Managing grants without reading the account list is useless: the target is never visible.
    if (permission === 'permissions:manage') granted.add('users:read');
    // keys:manage is the supervisor role: it can reach every other key action.
    if (permission === 'assistant:keys:manage') {
      granted.add('assistant:keys:reveal');
      granted.add('assistant:keys:test');
      granted.add('assistant:keys:revoke');
    }
  }
  return GRANTABLE_PERMISSIONS.filter(permission => granted.has(permission));
}

/** Stored JSON is untrusted: ignore malformed rows and re-normalize old grants. */
export function decodePermissions(raw: unknown): Permission[] {
  if (typeof raw !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalizePermissions(parsed.filter((value): value is string => typeof value === 'string'));
  } catch {
    return [];
  }
}

/** Absent custom set means the role default; a stored empty array means no permissions. */
export function effectivePermissions(role: string, isOwner: boolean, custom: PermissionSet | null): string[] {
  if (role !== 'ADMIN') return [];
  if (isOwner) return [...GRANTABLE_PERMISSIONS, ...OWNER_ONLY_PERMISSIONS];
  return custom === null ? [...DEFAULT_DELEGATED_PERMISSIONS] : [...custom];
}

export interface PermissionSnapshot {
  permissions: string[];
  permissionsVersion: number;
  customPermissions: boolean;
}

export function permissionSnapshot(role: string, isOwner: boolean, stored?: Row): PermissionSnapshot {
  if (role !== 'ADMIN') return { permissions: [], permissionsVersion: 0, customPermissions: false };
  if (isOwner) return { permissions: effectivePermissions(role, true, null), permissionsVersion: 0, customPermissions: false };
  const custom = stored ? decodePermissions(stored.permissions) : null;
  return {
    permissions: effectivePermissions(role, false, custom),
    permissionsVersion: stored ? Number(stored.version) || 0 : 0,
    customPermissions: Boolean(stored),
  };
}

/** Effective privileges come from current database state; client/JWT role claims are ignored. */
export async function accessView(db: Executor, user: Row) {
  const owner = (await all(db, 'SELECT user_id FROM rbac_owner WHERE slot=1'))[0];
  const admin = user.role === 'ADMIN' && Boolean(user.enabled);
  const isOwner = admin && owner?.user_id === user.id;
  let stored: Row | undefined;
  if (admin && !isOwner) {
    stored = (await all(db, 'SELECT permissions,version FROM admin_permission_sets WHERE user_id=?', [user.id]))[0];
  }
  const snapshot = permissionSnapshot(user.role, isOwner, stored);
  return {
    adminLevel: admin ? (isOwner ? 'OWNER' : 'DELEGATED') : null,
    ...snapshot,
  };
}

/** A grant tree this deep means corrupted data; refusing the write is safer than guessing the ancestors. */
const MAX_GRANT_DEPTH = 16;

/**
 * Every account above `userId` in the grant tree: whoever wrote its permission set, then whoever wrote
 * that one. A grant holder may never work upward, so the caller deny-lists these ids. A row with no
 * granted_by was written by the owner, and the owner is already protected by its own guard, so the walk ends.
 */
export async function grantorChain(db: Executor, userId: string): Promise<Set<string>> {
  const chain = new Set<string>();
  let current = userId;
  for (let depth = 0; depth < MAX_GRANT_DEPTH; depth++) {
    const granter = (await all(db, 'SELECT granted_by FROM admin_permission_sets WHERE user_id=?', [current]))[0]?.granted_by;
    if (typeof granter !== 'string' || granter === '' || chain.has(granter)) return chain;
    chain.add(granter);
    current = granter;
  }
  return fail(403, 'GRANTOR_PROTECTED');
}
