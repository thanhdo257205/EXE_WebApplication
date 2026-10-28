import { z } from 'zod';
import type { Client } from '@libsql/client';
import { all, execute, fail, now, one, scalar, transaction, uuid, type Executor, type Row } from './db.ts';
import { authorize, requireActor, type Api } from './auth.ts';
import { accessView } from './rbac-policy.ts';
import type { Cache } from './cache.ts';
import {
  DEFAULT_MODELS,
  PROVIDER_LABELS,
  geminiProvider,
  groqProvider,
  isProviderId,
  openRouterProvider,
  workersAiProvider,
  type AssistantOptions,
  type ChatProvider,
  type FetchLike,
  type ProviderId,
} from './assistant-providers.ts';
import { decryptSecret, encryptSecret, fingerprintSecret, maskAccount, maskSecret } from './assistant-crypto.ts';

export const CREDENTIALS_CACHE_KEY = 'assistant:credentials:v1';
export const CREDENTIALS_TTL_MS = 30_000;
export const MAX_KEYS_PER_OWNER = 10;
export const MAX_ACTIVE_KEYS = 32;

export type CredentialStatus = 'PENDING' | 'ACTIVE' | 'DISABLED' | 'REVOKED';
const statusSchema = z.enum(['PENDING', 'ACTIVE', 'DISABLED', 'REVOKED']);
const providerSchema = z.enum(['workers-ai', 'gemini', 'groq', 'openrouter']);

export async function initializeAssistantCredentials(db: Client): Promise<void> {
  await execute(db, `CREATE TABLE IF NOT EXISTS assistant_credentials (
    id TEXT NOT NULL PRIMARY KEY,
    provider TEXT NOT NULL CHECK (provider IN ('workers-ai','gemini','groq','openrouter')),
    owner_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    secret_enc TEXT NOT NULL,
    key_hint TEXT NOT NULL,
    account_hint TEXT,
    fingerprint TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','DISABLED','REVOKED')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now')),
    approved_by TEXT REFERENCES app_users(id) ON DELETE SET NULL,
    approved_at TEXT,
    revoked_at TEXT
  )`);
  // A key can be re-added after revocation, so only live rows participate in the duplicate check.
  await execute(db, `CREATE UNIQUE INDEX IF NOT EXISTS ux_assistant_credentials_fingerprint
    ON assistant_credentials(provider,fingerprint) WHERE status <> 'REVOKED'`);
  await execute(db, 'CREATE INDEX IF NOT EXISTS ix_assistant_credentials_owner ON assistant_credentials(owner_id,created_at)');
  await execute(db, 'CREATE INDEX IF NOT EXISTS ix_assistant_credentials_active ON assistant_credentials(status,created_at)');
}

const aadFor = (provider: string, ownerId: string): string => `assistant-credential:v1:${provider}:${ownerId}`;

interface SecretPayload { key: string; accountId?: string }
const encodeSecret = (payload: SecretPayload): string => JSON.stringify(payload);
function decodeSecret(raw: string): SecretPayload {
  const parsed: unknown = JSON.parse(raw);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid credential payload');
  const record = parsed as Record<string, unknown>;
  if (typeof record.key !== 'string' || !record.key) throw new Error('Invalid credential payload');
  if (record.accountId !== undefined && typeof record.accountId !== 'string') throw new Error('Invalid credential payload');
  return { key: record.key, ...(typeof record.accountId === 'string' ? { accountId: record.accountId } : {}) };
}

const factoryFor = (provider: ProviderId, secret: string, accountId: string | undefined, model: string, slot: string, options: AssistantOptions, fetchImpl: FetchLike): ChatProvider => {
  switch (provider) {
    case 'workers-ai':
      if (!accountId) throw new Error('Missing account ID');
      return workersAiProvider({ accountId, token: secret, model, slot, fetch: fetchImpl });
    case 'gemini':
      return geminiProvider({ apiKey: secret, model, slot, fetch: fetchImpl });
    case 'groq':
      return groqProvider({ apiKey: secret, model, slot, fetch: fetchImpl });
    case 'openrouter':
      return openRouterProvider({ apiKey: secret, model, slot, siteUrl: options.siteUrl, fetch: fetchImpl });
  }
};

/** Active database credentials are tried before env slots of the same provider; env remains the system fallback. */
async function loadRuntimeOptions(db: Executor, options: AssistantOptions): Promise<AssistantOptions> {
  const master = options.credentialKey;
  if (!master) return options;
  const rows = await all(db, "SELECT id,provider,owner_id,secret_enc FROM assistant_credentials WHERE status='ACTIVE' ORDER BY created_at,id");
  const databaseProviders: ChatProvider[] = [];
  for (const row of rows) {
    if (!isProviderId(row.provider)) continue;
    try {
      const payload = decodeSecret(decryptSecret(master, row.secret_enc, aadFor(row.provider, row.owner_id)));
      const model = options.models?.[row.provider] ?? DEFAULT_MODELS[row.provider];
      databaseProviders.push(factoryFor(row.provider, payload.key, payload.accountId, model, `db:${row.id}`, options, options.fetch ?? fetch));
    } catch {
      console.warn('Assistant credential could not be decrypted', { id: row.id, provider: row.provider });
    }
  }
  const order: ProviderId[] = [];
  for (const provider of options.providers) if (!order.includes(provider.id)) order.push(provider.id);
  for (const provider of databaseProviders) if (!order.includes(provider.id)) order.push(provider.id);
  const providers: ChatProvider[] = [];
  for (const id of order) {
    providers.push(...databaseProviders.filter(provider => provider.id === id), ...options.providers.filter(provider => provider.id === id));
  }
  return { ...options, providers };
}

export const assistantRuntimeOptions = (cache: Cache, db: Executor, options: AssistantOptions | null): Promise<AssistantOptions | null> =>
  options?.credentialKey
    ? cache.cached(CREDENTIALS_CACHE_KEY, CREDENTIALS_TTL_MS, () => loadRuntimeOptions(db, options))
    : Promise.resolve(options);

const keySelect = `SELECT c.*,u.email AS owner_email,u.display_name AS owner_display_name
  FROM assistant_credentials c JOIN app_users u ON u.id=c.owner_id`;

const keyView = (row: Row, viewerIsOwner: boolean, viewerId: string) => {
  const isMine = row.owner_id === viewerId;
  return {
    id: row.id,
    provider: row.provider,
    providerLabel: isProviderId(row.provider) ? PROVIDER_LABELS[row.provider] : row.provider,
    label: row.label,
    hint: row.key_hint,
    accountHint: row.account_hint ?? null,
    status: row.status,
    ownerId: row.owner_id,
    ownerEmail: row.owner_email,
    ownerDisplayName: row.owner_display_name,
    isMine,
    canReveal: isMine || viewerIsOwner,
    canManageStatus: viewerIsOwner,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    approvedAt: row.approved_at ?? null,
  };
};

const isOwner = async (db: Executor, user: Row): Promise<boolean> =>
  (await accessView(db, user)).permissions.includes('users:manage-roles');

const audit = (db: Executor, actorId: string, action: string, id: string, details: string) =>
  execute(db, "INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,outcome,details_redacted) VALUES (?,?,?,'ASSISTANT_KEY',?,'SUCCESS',?)",
    [uuid(), actorId, action, id, details]);

const createSchema = z.object({
  provider: providerSchema,
  label: z.string().trim().min(1).max(80),
  apiKey: z.string().trim().min(8).max(4_096).refine(value => !/\s/.test(value)),
  accountId: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/).optional(),
}).strict();

const patchSchema = z.object({ status: z.enum(['ACTIVE', 'DISABLED']) }).strict();

export function assistantCredentialRoutes(app: Api, db: Client, options: AssistantOptions | null) {
  app.get('/api/v1/admin/assistant/keys', async c => {
    const actor = requireActor(c, true);
    return c.json(await transaction(db, async tx => {
      const current = await authorize(tx, actor, true);
      const owner = await isOwner(tx, current);
      const rows = owner
        ? await all(tx, keySelect + " WHERE c.status<>'REVOKED' ORDER BY c.created_at DESC,c.id")
        : await all(tx, keySelect + " WHERE c.owner_id=? AND c.status<>'REVOKED' ORDER BY c.created_at DESC,c.id", [current.id]);
      return {
        items: rows.map(row => keyView(row, owner, current.id)),
        canManage: owner,
        storageAvailable: Boolean(options?.credentialKey),
        limits: { perOwner: MAX_KEYS_PER_OWNER, active: MAX_ACTIVE_KEYS },
      };
    }, 'read'));
  });

  app.post('/api/v1/admin/assistant/keys', async c => {
    const actor = requireActor(c, true);
    const body = createSchema.parse(await c.req.json());
    const master = options?.credentialKey;
    if (!master) return fail(503, 'KEY_STORAGE_UNAVAILABLE');
    if (body.provider === 'workers-ai' ? !body.accountId : Boolean(body.accountId)) return fail(400, 'INVALID_ACCOUNT_ID');
    const secret = body.provider === 'workers-ai' ? `${body.accountId}:${body.apiKey}` : body.apiKey;
    const fingerprint = fingerprintSecret(master, body.provider, secret);
    return c.json(await transaction(db, async tx => {
      const current = await authorize(tx, actor, true);
      const owner = await isOwner(tx, current);
      const live = await scalar(tx, "SELECT COUNT(*) FROM assistant_credentials WHERE owner_id=? AND status<>'REVOKED'", [current.id]);
      if (live >= MAX_KEYS_PER_OWNER) return fail(409, 'KEY_LIMIT_REACHED');
      if ((await all(tx, "SELECT id FROM assistant_credentials WHERE provider=? AND fingerprint=? AND status<>'REVOKED'", [body.provider, fingerprint])).length) {
        return fail(409, 'DUPLICATE_KEY');
      }
      const status: CredentialStatus = owner ? 'ACTIVE' : 'PENDING';
      if (status === 'ACTIVE' && await scalar(tx, "SELECT COUNT(*) FROM assistant_credentials WHERE status='ACTIVE'") >= MAX_ACTIVE_KEYS) {
        return fail(409, 'KEY_LIMIT_REACHED');
      }
      const id = uuid(), timestamp = now();
      const encrypted = encryptSecret(master, encodeSecret({ key: body.apiKey, ...(body.accountId ? { accountId: body.accountId } : {}) }), aadFor(body.provider, current.id));
      if (status === 'ACTIVE') {
        await execute(tx, `INSERT INTO assistant_credentials(id,provider,owner_id,label,secret_enc,key_hint,account_hint,fingerprint,status,created_at,updated_at,approved_by,approved_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [id, body.provider, current.id, body.label, encrypted, maskSecret(body.apiKey), body.accountId ? maskAccount(body.accountId) : null, fingerprint, status, timestamp, timestamp, current.id, timestamp]);
      } else {
        await execute(tx, `INSERT INTO assistant_credentials(id,provider,owner_id,label,secret_enc,key_hint,account_hint,fingerprint,status,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [id, body.provider, current.id, body.label, encrypted, maskSecret(body.apiKey), body.accountId ? maskAccount(body.accountId) : null, fingerprint, status, timestamp, timestamp]);
      }
      await audit(tx, current.id, 'ASSISTANT_KEY_CREATED', id, `provider=${body.provider};status=${status};owner=${current.id}`);
      return { item: keyView(await one(tx, keySelect + ' WHERE c.id=?', [id]), owner, current.id) };
    }));
  });

  app.post('/api/v1/admin/assistant/keys/:id/reveal', async c => {
    const actor = requireActor(c, true);
    const id = z.string().uuid().parse(c.req.param('id'));
    const master = options?.credentialKey;
    if (!master) return fail(503, 'KEY_STORAGE_UNAVAILABLE');
    return c.json(await transaction(db, async tx => {
      const current = await authorize(tx, actor, true);
      const owner = await isOwner(tx, current);
      const row = await one(tx, keySelect + ' WHERE c.id=?', [id]);
      // Delegated admins get 404 for a foreign key so they cannot probe which keys exist.
      if (!owner && row.owner_id !== current.id) return fail(404, 'KEY_NOT_FOUND');
      if (row.status === 'REVOKED' || !row.secret_enc) return fail(409, 'KEY_REVOKED');
      let payload: SecretPayload;
      try { payload = decodeSecret(decryptSecret(master, row.secret_enc, aadFor(row.provider, row.owner_id))); }
      catch { return fail(409, 'KEY_UNREADABLE'); }
      // The audit row is part of the transaction: a failed audit withholds the plaintext.
      await audit(tx, current.id, 'ASSISTANT_KEY_REVEALED', id,
        `provider=${row.provider};owner=${row.owner_id};scope=${row.owner_id === current.id ? 'own' : 'owner'}`);
      return { apiKey: payload.key, accountId: payload.accountId ?? null };
    }));
  });

  app.patch('/api/v1/admin/assistant/keys/:id', async c => {
    const actor = requireActor(c, true);
    const id = z.string().uuid().parse(c.req.param('id'));
    const body = patchSchema.parse(await c.req.json());
    return c.json(await transaction(db, async tx => {
      const current = await authorize(tx, actor, true);
      if (!await isOwner(tx, current)) return fail(403, 'OWNER_REQUIRED');
      const row = await one(tx, keySelect + ' WHERE c.id=?', [id]);
      if (row.status === 'REVOKED') return fail(409, 'KEY_REVOKED');
      if (!statusSchema.safeParse(row.status).success) return fail(409, 'KEY_UNREADABLE');
      if (row.status === body.status) return { item: keyView(row, true, current.id), changed: false };
      if (body.status === 'ACTIVE' && row.status !== 'ACTIVE'
        && await scalar(tx, "SELECT COUNT(*) FROM assistant_credentials WHERE status='ACTIVE'") >= MAX_ACTIVE_KEYS) {
        return fail(409, 'KEY_LIMIT_REACHED');
      }
      const timestamp = now();
      if (body.status === 'ACTIVE') {
        await execute(tx, 'UPDATE assistant_credentials SET status=?,updated_at=?,approved_by=?,approved_at=? WHERE id=?',
          [body.status, timestamp, current.id, timestamp, id]);
      } else {
        await execute(tx, 'UPDATE assistant_credentials SET status=?,updated_at=? WHERE id=?', [body.status, timestamp, id]);
      }
      const action = body.status === 'ACTIVE' ? (row.status === 'PENDING' ? 'ASSISTANT_KEY_APPROVED' : 'ASSISTANT_KEY_REENABLED') : 'ASSISTANT_KEY_DISABLED';
      await audit(tx, current.id, action, id, `provider=${row.provider};from=${row.status};to=${body.status};owner=${row.owner_id}`);
      return { item: keyView(await one(tx, keySelect + ' WHERE c.id=?', [id]), true, current.id), changed: true };
    }));
  });

  app.delete('/api/v1/admin/assistant/keys/:id', async c => {
    const actor = requireActor(c, true);
    const id = z.string().uuid().parse(c.req.param('id'));
    return c.json(await transaction(db, async tx => {
      const current = await authorize(tx, actor, true);
      const owner = await isOwner(tx, current);
      const row = await one(tx, keySelect + ' WHERE c.id=?', [id]);
      if (!owner && row.owner_id !== current.id) return fail(404, 'KEY_NOT_FOUND');
      if (row.status === 'REVOKED') return fail(409, 'KEY_REVOKED');
      const timestamp = now();
      // Revocation removes the ciphertext but keeps metadata for the audit trail.
      await execute(tx, "UPDATE assistant_credentials SET status='REVOKED',secret_enc='',updated_at=?,revoked_at=? WHERE id=?",
        [timestamp, timestamp, id]);
      await audit(tx, current.id, 'ASSISTANT_KEY_REVOKED', id, `provider=${row.provider};owner=${row.owner_id};status=${row.status}`);
      return { removed: true };
    }));
  });
}
