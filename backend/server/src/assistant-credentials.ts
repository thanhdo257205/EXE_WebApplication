import { z } from 'zod';
import type { Client } from '@libsql/client';
import { all, execute, fail, now, one, scalar, transaction, uuid, type Executor, type Row } from './db.ts';
import { authorizePermission, requireActor, type Actor, type Api } from './auth.ts';
import type { Cache } from './cache.ts';
import {
  DEFAULT_MODELS,
  PROVIDER_LABELS,
  geminiProvider,
  groqProvider,
  isCatalogModel,
  isProviderId,
  openRouterProvider,
  workersAiProvider,
  ProviderError,
  type AssistantOptions,
  type ChatProvider,
  type FetchLike,
  type ProviderFailure,
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
  // Test telemetry is advisory: it never changes the key status, but admins need to see the last outcome.
  for (const [column, type] of [
    ['last_test_status', 'TEXT'], ['last_test_code', 'TEXT'], ['last_test_model', 'TEXT'],
    ['last_test_latency_ms', 'INTEGER'], ['last_tested_at', 'TEXT'],
  ] as const) {
    await execute(db, `ALTER TABLE assistant_credentials ADD COLUMN ${column} ${type}`).catch(() => undefined);
  }
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

const KEY_PERMISSIONS = {
  read: 'assistant:keys:read',
  create: 'assistant:keys:create',
  reveal: 'assistant:keys:reveal',
  test: 'assistant:keys:test',
  revoke: 'assistant:keys:revoke',
  manage: 'assistant:keys:manage',
} as const;

type KeyAction = keyof typeof KEY_PERMISSIONS;

interface KeyViewer {
  id: string;
  permissions: string[];
  manage: boolean;
  holds: (permission: string) => boolean;
  /** `assistant:keys:manage` reaches every key; otherwise only the creator's own key, and only for the action granted. */
  reaches: (row: Row, action: KeyAction) => boolean;
}

const keyView = (row: Row, viewer: KeyViewer) => {
  const isMine = row.owner_id === viewer.id;
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
    canReveal: viewer.reaches(row, 'reveal'),
    canTest: viewer.reaches(row, 'test'),
    canRevoke: viewer.reaches(row, 'revoke'),
    canManageStatus: viewer.manage,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    approvedAt: row.approved_at ?? null,
    lastTest: typeof row.last_tested_at === 'string' ? {
      status: row.last_test_status === 'OK' ? 'OK' : 'FAILED',
      code: typeof row.last_test_code === 'string' ? row.last_test_code : null,
      model: typeof row.last_test_model === 'string' ? row.last_test_model : null,
      latencyMs: Number(row.last_test_latency_ms) || 0,
      testedAt: row.last_tested_at,
    } : null,
  };
};

async function keyViewer(db: Executor, actor: Actor, action: KeyAction): Promise<KeyViewer> {
  const { user, access } = await authorizePermission(db, actor, KEY_PERMISSIONS[action]);
  const permissions = access.permissions;
  const holds = (permission: string) => permissions.includes(permission);
  const manage = holds(KEY_PERMISSIONS.manage);
  return {
    id: user.id,
    permissions,
    manage,
    holds,
    reaches: (row, key) => manage || (row.owner_id === user.id && holds(KEY_PERMISSIONS[key])),
  };
}

const audit = (db: Executor, actorId: string, action: string, id: string, details: string, outcome: 'SUCCESS' | 'FAILURE' = 'SUCCESS') =>
  execute(db, "INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,outcome,details_redacted) VALUES (?,?,?,'ASSISTANT_KEY',?,?,?)",
    [uuid(), actorId, action, id, outcome, details]);

const KEY_TEST_COOLDOWN_MS = 30_000;
const KEY_TEST_TIMEOUT_MS = 10_000;
/** Reasoning models spend this budget before any visible text, so a 16-token probe reads as EMPTY. */
const KEY_TEST_MAX_TOKENS = 1_024;
const MODEL_PATTERN = /^[A-Za-z0-9@._:/+-]{1,120}$/;

/** The test must call the same model the live router would use, including the admin override. */
function testModelFor(provider: ProviderId, modelOverrides: string | undefined, options: AssistantOptions | null): string {
  const fallback = options?.models?.[provider] ?? DEFAULT_MODELS[provider];
  if (!modelOverrides) return fallback;
  try {
    const parsed: unknown = JSON.parse(modelOverrides);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
    const value = (parsed as Record<string, unknown>)[provider];
    return typeof value === 'string' && MODEL_PATTERN.test(value) ? value : fallback;
  } catch { return fallback; }
}

const createSchema = z.object({
  provider: providerSchema,
  label: z.string().trim().min(1).max(80),
  apiKey: z.string().trim().min(8).max(4_096).refine(value => !/\s/.test(value)),
  accountId: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/).optional(),
}).strict();

const patchSchema = z.object({ status: z.enum(['ACTIVE', 'DISABLED']) }).strict();
const testSchema = z.object({ model: z.string().trim().max(120).regex(MODEL_PATTERN).optional() }).strict();

export function assistantCredentialRoutes(app: Api, db: Client, options: AssistantOptions | null) {
  // In-memory cooldown per key: admins can re-test after 30s, but a stuck key cannot burn quota in a loop.
  const testCooldown = new Map<string, number>();

  app.get('/api/v1/admin/assistant/keys', async c => {
    const actor = requireActor(c, true);
    return c.json(await transaction(db, async tx => {
      const viewer = await keyViewer(tx, actor, 'read');
      const rows = await all(tx, viewer.manage
        ? keySelect + " WHERE c.status<>'REVOKED' ORDER BY c.created_at DESC,c.id"
        : keySelect + " WHERE c.owner_id=? AND c.status<>'REVOKED' ORDER BY c.created_at DESC,c.id",
        viewer.manage ? [] : [viewer.id]);
      return {
        items: rows.map(row => keyView(row, viewer)),
        canManage: viewer.manage,
        canCreate: viewer.holds(KEY_PERMISSIONS.create),
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
      const viewer = await keyViewer(tx, actor, 'create');
      const live = await scalar(tx, "SELECT COUNT(*) FROM assistant_credentials WHERE owner_id=? AND status<>'REVOKED'", [viewer.id]);
      if (live >= MAX_KEYS_PER_OWNER) return fail(409, 'KEY_LIMIT_REACHED');
      if ((await all(tx, "SELECT id FROM assistant_credentials WHERE provider=? AND fingerprint=? AND status<>'REVOKED'", [body.provider, fingerprint])).length) {
        return fail(409, 'DUPLICATE_KEY');
      }
      const status: CredentialStatus = viewer.manage ? 'ACTIVE' : 'PENDING';
      if (status === 'ACTIVE' && await scalar(tx, "SELECT COUNT(*) FROM assistant_credentials WHERE status='ACTIVE'") >= MAX_ACTIVE_KEYS) {
        return fail(409, 'KEY_LIMIT_REACHED');
      }
      const id = uuid(), timestamp = now();
      const encrypted = encryptSecret(master, encodeSecret({ key: body.apiKey, ...(body.accountId ? { accountId: body.accountId } : {}) }), aadFor(body.provider, viewer.id));
      if (status === 'ACTIVE') {
        await execute(tx, `INSERT INTO assistant_credentials(id,provider,owner_id,label,secret_enc,key_hint,account_hint,fingerprint,status,created_at,updated_at,approved_by,approved_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [id, body.provider, viewer.id, body.label, encrypted, maskSecret(body.apiKey), body.accountId ? maskAccount(body.accountId) : null, fingerprint, status, timestamp, timestamp, viewer.id, timestamp]);
      } else {
        await execute(tx, `INSERT INTO assistant_credentials(id,provider,owner_id,label,secret_enc,key_hint,account_hint,fingerprint,status,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [id, body.provider, viewer.id, body.label, encrypted, maskSecret(body.apiKey), body.accountId ? maskAccount(body.accountId) : null, fingerprint, status, timestamp, timestamp]);
      }
      await audit(tx, viewer.id, 'ASSISTANT_KEY_CREATED', id, `provider=${body.provider};status=${status};owner=${viewer.id}`);
      return { item: keyView(await one(tx, keySelect + ' WHERE c.id=?', [id]), viewer) };
    }));
  });

  app.post('/api/v1/admin/assistant/keys/:id/reveal', async c => {
    const actor = requireActor(c, true);
    const id = z.string().uuid().parse(c.req.param('id'));
    const master = options?.credentialKey;
    if (!master) return fail(503, 'KEY_STORAGE_UNAVAILABLE');
    return c.json(await transaction(db, async tx => {
      const viewer = await keyViewer(tx, actor, 'reveal');
      const row = await one(tx, keySelect + ' WHERE c.id=?', [id]);
      // Admins without reach get 404 for a foreign key so they cannot probe which keys exist.
      if (!viewer.reaches(row, 'reveal')) return fail(404, 'KEY_NOT_FOUND');
      if (row.status === 'REVOKED' || !row.secret_enc) return fail(409, 'KEY_REVOKED');
      let payload: SecretPayload;
      try { payload = decodeSecret(decryptSecret(master, row.secret_enc, aadFor(row.provider, row.owner_id))); }
      catch { return fail(409, 'KEY_UNREADABLE'); }
      // The audit row is part of the transaction: a failed audit withholds the plaintext.
      await audit(tx, viewer.id, 'ASSISTANT_KEY_REVEALED', id,
        `provider=${row.provider};owner=${row.owner_id};scope=${row.owner_id === viewer.id ? 'own' : 'managed'}`);
      return { apiKey: payload.key, accountId: payload.accountId ?? null };
    }));
  });

  app.patch('/api/v1/admin/assistant/keys/:id', async c => {
    const actor = requireActor(c, true);
    const id = z.string().uuid().parse(c.req.param('id'));
    const body = patchSchema.parse(await c.req.json());
    return c.json(await transaction(db, async tx => {
      const viewer = await keyViewer(tx, actor, 'manage');
      const row = await one(tx, keySelect + ' WHERE c.id=?', [id]);
      if (row.status === 'REVOKED') return fail(409, 'KEY_REVOKED');
      if (!statusSchema.safeParse(row.status).success) return fail(409, 'KEY_UNREADABLE');
      if (row.status === body.status) return { item: keyView(row, viewer), changed: false };
      if (body.status === 'ACTIVE' && row.status !== 'ACTIVE'
        && await scalar(tx, "SELECT COUNT(*) FROM assistant_credentials WHERE status='ACTIVE'") >= MAX_ACTIVE_KEYS) {
        return fail(409, 'KEY_LIMIT_REACHED');
      }
      const timestamp = now();
      if (body.status === 'ACTIVE') {
        await execute(tx, 'UPDATE assistant_credentials SET status=?,updated_at=?,approved_by=?,approved_at=? WHERE id=?',
          [body.status, timestamp, viewer.id, timestamp, id]);
      } else {
        await execute(tx, 'UPDATE assistant_credentials SET status=?,updated_at=? WHERE id=?', [body.status, timestamp, id]);
      }
      const action = body.status === 'ACTIVE' ? (row.status === 'PENDING' ? 'ASSISTANT_KEY_APPROVED' : 'ASSISTANT_KEY_REENABLED') : 'ASSISTANT_KEY_DISABLED';
      await audit(tx, viewer.id, action, id, `provider=${row.provider};from=${row.status};to=${body.status};owner=${row.owner_id}`);
      return { item: keyView(await one(tx, keySelect + ' WHERE c.id=?', [id]), viewer), changed: true };
    }));
  });

  app.delete('/api/v1/admin/assistant/keys/:id', async c => {
    const actor = requireActor(c, true);
    const id = z.string().uuid().parse(c.req.param('id'));
    return c.json(await transaction(db, async tx => {
      const viewer = await keyViewer(tx, actor, 'revoke');
      const row = await one(tx, keySelect + ' WHERE c.id=?', [id]);
      if (!viewer.reaches(row, 'revoke')) return fail(404, 'KEY_NOT_FOUND');
      if (row.status === 'REVOKED') return fail(409, 'KEY_REVOKED');
      const timestamp = now();
      // Revocation removes the ciphertext but keeps metadata for the audit trail.
      await execute(tx, "UPDATE assistant_credentials SET status='REVOKED',secret_enc='',updated_at=?,revoked_at=? WHERE id=?",
        [timestamp, timestamp, id]);
      await audit(tx, viewer.id, 'ASSISTANT_KEY_REVOKED', id, `provider=${row.provider};owner=${row.owner_id};status=${row.status}`);
      return { removed: true };
    }));
  });

  app.post('/api/v1/admin/assistant/keys/:id/test', async c => {
    const actor = requireActor(c, true);
    const id = z.string().uuid().parse(c.req.param('id'));
    const body = testSchema.parse(await c.req.json().catch(() => ({})));
    const master = options?.credentialKey;
    if (!master) return fail(503, 'KEY_STORAGE_UNAVAILABLE');
    // Reading and decrypting happen in one short transaction; the provider call must not hold a DB lock.
    const target = await transaction(db, async tx => {
      const viewer = await keyViewer(tx, actor, 'test');
      const row = await one(tx, keySelect + ' WHERE c.id=?', [id]);
      if (!viewer.reaches(row, 'test')) return fail(404, 'KEY_NOT_FOUND');
      if (row.status === 'REVOKED' || !row.secret_enc) return fail(409, 'KEY_REVOKED');
      if (!isProviderId(row.provider)) return fail(409, 'KEY_UNREADABLE');
      const waitMs = (testCooldown.get(id) ?? 0) - Date.now();
      if (waitMs > 0) {
        c.header('Retry-After', String(Math.ceil(waitMs / 1000)));
        return fail(429, 'KEY_TEST_COOLDOWN');
      }
      let payload: SecretPayload;
      try { payload = decodeSecret(decryptSecret(master, row.secret_enc, aadFor(row.provider, row.owner_id))); }
      catch { return fail(409, 'KEY_UNREADABLE'); }
      const settingsRow = (await all(tx, 'SELECT model_overrides FROM assistant_settings WHERE slot=1'))[0];
      const modelOverrides = typeof settingsRow?.model_overrides === 'string' ? settingsRow.model_overrides : undefined;
      return {
        actorId: viewer.id,
        ownerId: row.owner_id,
        provider: row.provider,
        payload,
        configuredModel: testModelFor(row.provider, modelOverrides, options),
      };
    }, 'read');

    // A bulk run may probe a catalog alternative; anything else must be the model the router already uses.
    const model = body.model ?? target.configuredModel;
    if (body.model && body.model !== target.configuredModel && !isCatalogModel(target.provider, body.model)) {
      return fail(400, 'INVALID_MODEL');
    }

    testCooldown.set(id, Date.now() + KEY_TEST_COOLDOWN_MS);
    if (testCooldown.size > 500) {
      const cutoff = Date.now();
      for (const [key, until] of testCooldown) if (until <= cutoff) testCooldown.delete(key);
    }

    const started = Date.now();
    let status: 'OK' | 'FAILED' = 'OK';
    let code: ProviderFailure | null = null;
    try {
      const provider = factoryFor(target.provider, target.payload.key, target.payload.accountId, model, `db:${id}`, options, options.fetch ?? fetch);
      await provider.complete({
        system: 'You are a connectivity probe. Reply with the single word OK.',
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: KEY_TEST_MAX_TOKENS,
        temperature: 0,
        signal: AbortSignal.timeout(KEY_TEST_TIMEOUT_MS),
      });
    } catch (error) {
      status = 'FAILED';
      // Only the normalized failure leaves this process: raw provider errors may echo the credential.
      code = error instanceof ProviderError ? error.failure : 'INVALID';
    }
    const latencyMs = Date.now() - started;
    const testedAt = now();
    await execute(db, 'UPDATE assistant_credentials SET last_test_status=?,last_test_code=?,last_test_model=?,last_test_latency_ms=?,last_tested_at=? WHERE id=?',
      [status, code, model, latencyMs, testedAt, id]);
    await audit(db, target.actorId, 'ASSISTANT_KEY_TESTED', id,
      `provider=${target.provider};owner=${target.ownerId};model=${model};result=${status}${code ? `;code=${code}` : ''};latency=${latencyMs}`,
      status === 'OK' ? 'SUCCESS' : 'FAILURE');
    // A failed test never changes the key state: the admin decides whether to disable or revoke it.
    return c.json({ status, code, provider: target.provider, model, latencyMs, testedAt });
  });
}
