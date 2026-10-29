import { z } from 'zod';
import type { Client } from '@libsql/client';
import { all, execute, fail, now, transaction, uuid, type Executor } from './db.ts';
import { authorize, authorizePermission, requireActor, type Api } from './auth.ts';
import { accessView } from './rbac-policy.ts';
import type { Cache } from './cache.ts';
import {
  DEFAULT_MODELS,
  DEFAULT_ORDER,
  MODEL_CATALOG,
  PROVIDER_LABELS,
  isProviderId,
  isSafeModelPath,
  type AssistantOptions,
  type ChatProvider,
  type ProviderId,
} from './assistant-providers.ts';
import { assistantRuntimeOptions } from './assistant-credentials.ts';
import { usageSummary } from './assistant-usage.ts';

export interface AssistantSettings {
  order: ProviderId[];
  models: Record<string, string>;
  disabledSlots: string[];
  /** Admin-declared daily token budget per provider; absent means no bar is drawn. */
  tokenBudgets: Record<string, number>;
  /** Admin-declared daily token budget per stored credential id (one card per key). */
  keyBudgets: Record<string, number>;
  version: number;
  updatedAt: string | null;
}

export const SETTINGS_KEY = 'assistant:settings:v1';
export const SETTINGS_TTL_MS = 30_000;
const SLOT_PATTERN = /^(?:[a-z0-9-]+#\d{1,3}|db:[0-9a-f-]{36})$/;
const KEY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TOKEN_BUDGET = 2_000_000_000;

// Providers retired these ids, so any stored override would fail every request with INVALID.
// Only exact ids shipped as product defaults are rewritten; custom admin choices stay untouched.
const RETIRED_MODEL_REPLACEMENTS: Readonly<Record<ProviderId, Readonly<Record<string, string>>>> = {
  'workers-ai': {},
  gemini: {
    'gemini-2.5-flash': DEFAULT_MODELS.gemini,
    'gemini-2.5-flash-lite': DEFAULT_MODELS.gemini,
  },
  groq: {
    'llama-3.3-70b-versatile': DEFAULT_MODELS.groq,
    'llama-3.1-8b-instant': DEFAULT_MODELS.groq,
  },
  openrouter: {
    'meta-llama/llama-3.3-70b-instruct:free': DEFAULT_MODELS.openrouter,
  },
  motapis: {},
};

// MộtAPI bills per token, so a small daily ceiling ships with it and shows up as a quota bar the admin
// can raise or clear; the free tiers keep their own provider-side limits. Budgets are advisory counters
// (see usageSummary) — the real spend guard is that motapis sits last in DEFAULT_ORDER.
export const DEFAULT_TOKEN_BUDGETS: Readonly<Partial<Record<ProviderId, number>>> = { motapis: 200_000 };

function upgradedModelOverrides(raw: string): string | null {
  const overrides = jsonObject(raw);
  let changed = false;
  for (const provider of Object.keys(RETIRED_MODEL_REPLACEMENTS) as ProviderId[]) {
    const model = overrides[provider];
    const replacement = typeof model === 'string' ? RETIRED_MODEL_REPLACEMENTS[provider][model] : undefined;
    if (replacement) { overrides[provider] = replacement; changed = true; }
  }
  return changed ? JSON.stringify(overrides) : null;
}

export async function initializeAssistantSettings(db: Client): Promise<void> {
  await execute(db, `CREATE TABLE IF NOT EXISTS assistant_settings (
    slot INTEGER PRIMARY KEY CHECK (slot=1),
    provider_order TEXT NOT NULL,
    model_overrides TEXT NOT NULL,
    disabled_slots TEXT NOT NULL,
    token_budgets TEXT NOT NULL DEFAULT '{}',
    key_budgets TEXT NOT NULL DEFAULT '{}',
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    updated_by TEXT REFERENCES app_users(id) ON DELETE SET NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now'))
  )`);
  await execute(db, "ALTER TABLE assistant_settings ADD COLUMN token_budgets TEXT NOT NULL DEFAULT '{}'").catch(() => undefined);
  await execute(db, "ALTER TABLE assistant_settings ADD COLUMN key_budgets TEXT NOT NULL DEFAULT '{}'").catch(() => undefined);
  const stored = (await all(db, 'SELECT model_overrides FROM assistant_settings WHERE slot=1'))[0];
  if (typeof stored?.model_overrides === 'string') {
    const upgraded = upgradedModelOverrides(stored.model_overrides);
    if (upgraded) await execute(db, 'UPDATE assistant_settings SET model_overrides=?,version=version+1 WHERE slot=1', [upgraded]);
  }
}

export function defaultAssistantSettings(options: AssistantOptions | null): AssistantSettings {
  const configured = options?.providers ?? [];
  const order: ProviderId[] = [];
  for (const provider of configured) if (!order.includes(provider.id)) order.push(provider.id);
  // A stored credential makes its provider appear before the env slots it was merged with, so arrival
  // order alone would float a paid last-resort provider to the front of a database that has no plan yet.
  order.sort((a, b) => DEFAULT_ORDER.indexOf(a) - DEFAULT_ORDER.indexOf(b));
  const models: Record<string, string> = { ...DEFAULT_MODELS };
  // The first slot of a provider carries the env-configured model, so it becomes the default override.
  for (const provider of configured) if (!(provider.id in models) || models[provider.id] === DEFAULT_MODELS[provider.id]) models[provider.id] = provider.model;
  return { order: order.length ? order : [...DEFAULT_ORDER], models, disabledSlots: [], tokenBudgets: { ...DEFAULT_TOKEN_BUDGETS }, keyBudgets: {}, version: 0, updatedAt: null };
}

const jsonArray = (value: unknown): string[] => {
  if (typeof value !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch { return []; }
};
const jsonObject = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'string') return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
};
function normalizeKeyBudgets(raw: unknown): Record<string, number> {
  const budgets: Record<string, number> = {};
  for (const [id, value] of Object.entries(jsonObject(raw))) {
    const amount = Number(value);
    if (KEY_ID_PATTERN.test(id) && Number.isSafeInteger(amount) && amount > 0 && amount <= MAX_TOKEN_BUDGET) budgets[id] = amount;
  }
  return budgets;
}

export function availableSlotIds(options: AssistantOptions | null): string[] {
  return (options?.providers ?? []).map(provider => provider.slot);
}

/** Stored values are untrusted: validate again and fall back to env defaults for anything unexpected. */
function normalizeSettings(row: Record<string, unknown>, base: AssistantSettings, options: AssistantOptions | null): AssistantSettings {
  const requested = jsonArray(row.provider_order);
  const order: ProviderId[] = [];
  for (const value of requested) if (isProviderId(value) && !order.includes(value)) order.push(value);
  const models = { ...base.models };
  for (const [id, value] of Object.entries(jsonObject(row.model_overrides))) {
    if (isProviderId(id) && typeof value === 'string' && isSafeModelPath(value)) models[id] = value;
  }
  const slots = new Set(availableSlotIds(options));
  const disabledSlots = [...new Set(jsonArray(row.disabled_slots))]
    .filter(slot => slot.length <= 64 && SLOT_PATTERN.test(slot) && slots.has(slot));
  const tokenBudgets: Record<string, number> = {};
  for (const [id, value] of Object.entries(jsonObject(row.token_budgets))) {
    const amount = Number(value);
    if (isProviderId(id) && Number.isSafeInteger(amount) && amount > 0 && amount <= MAX_TOKEN_BUDGET) tokenBudgets[id] = amount;
  }
  const keyBudgets = normalizeKeyBudgets(row.key_budgets);
  const version = Number(row.version);
  return {
    order: order.length ? order : base.order,
    models,
    disabledSlots,
    tokenBudgets,
    keyBudgets,
    version: Number.isSafeInteger(version) && version >= 1 ? version : 0,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
  };
}

export async function loadAssistantSettings(db: Executor, options: AssistantOptions | null): Promise<AssistantSettings> {
  const row = (await all(db, 'SELECT * FROM assistant_settings WHERE slot=1'))[0];
  const base = defaultAssistantSettings(options);
  return row ? normalizeSettings(row, base, options) : base;
}

export const cachedAssistantSettings = (cache: Cache, db: Executor, options: AssistantOptions | null): Promise<AssistantSettings> =>
  cache.cached(SETTINGS_KEY, SETTINGS_TTL_MS, () => loadAssistantSettings(db, options));

/** Applies the admin plan to live slots: order, per-provider model override and disabled keys. */
export function activeProviders(providers: readonly ChatProvider[], settings: AssistantSettings): ChatProvider[] {
  const disabled = new Set(settings.disabledSlots);
  const rank = new Map(settings.order.map((id, index) => [id, index]));
  return providers
    .map((provider, index) => ({ provider, index }))
    .filter(({ provider }) => !disabled.has(provider.slot))
    .sort((a, b) => (rank.get(a.provider.id) ?? DEFAULT_ORDER.length) - (rank.get(b.provider.id) ?? DEFAULT_ORDER.length) || a.index - b.index)
    .map(({ provider }) => {
      const model = settings.models[provider.id];
      return model && model !== provider.model ? provider.withModel(model) : provider;
    });
}

const settingsSchema = z.object({
  order: z.array(z.string()).min(1).max(DEFAULT_ORDER.length),
  models: z.record(z.string(), z.string().trim().refine(isSafeModelPath)),
  disabledSlots: z.array(z.string()).max(64).default([]),
  tokenBudgets: z.record(z.string(), z.number().int().positive().max(MAX_TOKEN_BUDGET)),
  // Optional so a cached admin bundle can still save without silently wiping per-key budgets.
  keyBudgets: z.record(z.string(), z.number().int().positive().max(MAX_TOKEN_BUDGET)).optional(),
  expectedVersion: z.number().int().nonnegative(),
}).strict();

const SETTINGS_PERMISSIONS = {
  order: 'assistant:models:reorder',
  models: 'assistant:models:update',
  slots: 'assistant:slots:update',
  budgets: 'assistant:budgets:update',
} as const;

const sortedKey = (values: readonly string[]) => [...values].sort().join('|');

function sameRecord(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const left = Object.keys(a).sort(), right = Object.keys(b).sort();
  if (sortedKey(left) !== sortedKey(right)) return false;
  return left.every(key => a[key] === b[key]);
}

/** Only the fields that actually differ need a permission, so a partial editor can still save its own tab. */
function changedPermissions(current: AssistantSettings, body: SettingsBody): string[] {
  const changed: string[] = [];
  if (current.order.join('|') !== body.order.join('|')) changed.push(SETTINGS_PERMISSIONS.order);
  if (!sameRecord(current.models, body.models)) changed.push(SETTINGS_PERMISSIONS.models);
  if (sortedKey(current.disabledSlots) !== sortedKey(body.disabledSlots)) changed.push(SETTINGS_PERMISSIONS.slots);
  if (!sameRecord(current.tokenBudgets, body.tokenBudgets)
    || (body.keyBudgets !== undefined && !sameRecord(current.keyBudgets, body.keyBudgets))) changed.push(SETTINGS_PERMISSIONS.budgets);
  return changed;
}

type SettingsBody = z.infer<typeof settingsSchema>;

const DB_SLOT_PREFIX = 'db:';

/**
 * A `db:<id>` slot is a credential stored by one specific admin. Flipping it in the settings
 * form reroutes live assistant traffic off (or back onto) that key, so an editor who only holds
 * `assistant:slots:update` must not be able to change the set of slots owned by someone else.
 * `assistant:keys:manage` is the right that reaches every key; without it the foreign set has to
 * be preserved exactly, which still allows free editing of order, models, budgets and own keys.
 */
async function foreignDisabledSlots(tx: Executor, actorId: string, stored: readonly string[], incoming: readonly string[]): Promise<boolean> {
  const ids = [...new Set([...stored, ...incoming]
    .filter(slot => slot.startsWith(DB_SLOT_PREFIX))
    .map(slot => slot.slice(DB_SLOT_PREFIX.length))
    .filter(id => KEY_ID_PATTERN.test(id)))];
  if (!ids.length) return false;
  const owners = new Map<string, string>(
    (await all(tx, `SELECT id,owner_id FROM assistant_credentials WHERE id IN (${ids.map(() => '?').join(',')})`, ids))
      .map(row => [String(row.id), String(row.owner_id)]));
  const foreign = (slot: string) => slot.startsWith(DB_SLOT_PREFIX) && owners.get(slot.slice(DB_SLOT_PREFIX.length)) !== actorId;
  return sortedKey(stored.filter(foreign)) !== sortedKey(incoming.filter(foreign));
}

const settingsView = (settings: AssistantSettings, options: AssistantOptions | null, permissions: readonly string[] = []) => {
  const holds = (permission: string) => permissions.includes(permission);
  return {
    settings,
    canReorder: holds(SETTINGS_PERMISSIONS.order),
    canEditModels: holds(SETTINGS_PERMISSIONS.models),
    canManageSlots: holds(SETTINGS_PERMISSIONS.slots),
    canEditBudgets: holds(SETTINGS_PERMISSIONS.budgets),
    canReadUsage: holds('assistant:usage:read'),
    canManage: Object.values(SETTINGS_PERMISSIONS).some(holds),
    providers: DEFAULT_ORDER.map(id => ({
      id,
      label: PROVIDER_LABELS[id],
      defaultModel: DEFAULT_MODELS[id],
      models: MODEL_CATALOG[id],
      slots: (options?.providers ?? []).filter(provider => provider.id === id).map(provider => ({
        slot: provider.slot,
        disabled: settings.disabledSlots.includes(provider.slot),
      })),
    })).filter(provider => provider.slots.length),
  };
};

export function assistantAdminRoutes(app: Api, db: Client, cache: Cache, options: AssistantOptions | null) {
  app.get('/api/v1/admin/assistant/settings', async c => {
    const actor = requireActor(c, true);
    const runtime = await assistantRuntimeOptions(cache, db, options);
    return c.json(await transaction(db, async tx => {
      const { access } = await authorizePermission(tx, actor, 'assistant:read');
      const settings = await loadAssistantSettings(tx, runtime);
      return settingsView(settings, runtime, access.permissions);
    }, 'read'));
  });

  app.put('/api/v1/admin/assistant/settings', async c => {
    const actor = requireActor(c, true);
    const body = settingsSchema.parse(await c.req.json());
    const runtime = await assistantRuntimeOptions(cache, db, options);
    const order = [...new Set(body.order)];
    if (order.length !== body.order.length || order.some(id => !isProviderId(id))) return fail(400, 'INVALID_SETTINGS');
    if (!order.some(id => (runtime?.providers ?? []).some(provider => provider.id === id))) return fail(400, 'NO_CONFIGURED_PROVIDER');
    if (Object.keys(body.models).some(id => !isProviderId(id))) return fail(400, 'INVALID_SETTINGS');
    if (Object.keys(body.tokenBudgets).some(id => !isProviderId(id))) return fail(400, 'INVALID_SETTINGS');
    if (Object.keys(body.keyBudgets ?? {}).some(id => !KEY_ID_PATTERN.test(id))) return fail(400, 'INVALID_SETTINGS');
    const available = new Set(availableSlotIds(runtime));
    const disabledSlots = [...new Set(body.disabledSlots)];
    if (disabledSlots.length !== body.disabledSlots.length || disabledSlots.some(slot => !available.has(slot))) return fail(400, 'UNKNOWN_SLOT');

    return c.json(await transaction(db, async tx => {
      const current = await authorize(tx, actor, true);
      const access = await accessView(tx, current);
      if (!access.permissions.includes('assistant:read')) return fail(403, 'PERMISSION_REQUIRED');
      const stored = await loadAssistantSettings(tx, runtime);
      const version = stored.version;
      if (version !== body.expectedVersion) return fail(409, 'VERSION_CONFLICT');
      const changed = changedPermissions(stored, { ...body, order, disabledSlots });
      const missing = changed.filter(permission => !access.permissions.includes(permission));
      if (missing.length) return fail(403, 'PERMISSION_REQUIRED');
      if (changed.includes(SETTINGS_PERMISSIONS.slots) && !access.permissions.includes('assistant:keys:manage')
        && await foreignDisabledSlots(tx, actor.id, stored.disabledSlots, disabledSlots)) return fail(403, 'PERMISSION_REQUIRED');
      if (!changed.length) return { ...settingsView(stored, runtime, access.permissions), changed: false };
      const timestamp = now();
      const providerOrder = JSON.stringify(order);
      const modelOverrides = JSON.stringify(body.models);
      const disabled = JSON.stringify(disabledSlots);
      const tokenBudgets = JSON.stringify(body.tokenBudgets);
      // Omitted by older clients: keep what is stored instead of wiping per-key budgets.
      const keyBudgets = body.keyBudgets ?? stored.keyBudgets;
      const keyBudgetsJson = JSON.stringify(keyBudgets);
      const row = (await all(tx, 'SELECT slot FROM assistant_settings WHERE slot=1'))[0];
      if (row) {
        await execute(tx, 'UPDATE assistant_settings SET provider_order=?,model_overrides=?,disabled_slots=?,token_budgets=?,key_budgets=?,version=version+1,updated_by=?,updated_at=? WHERE slot=1 AND version=?',
          [providerOrder, modelOverrides, disabled, tokenBudgets, keyBudgetsJson, actor.id, timestamp, version]);
      } else {
        await execute(tx, 'INSERT INTO assistant_settings(slot,provider_order,model_overrides,disabled_slots,token_budgets,key_budgets,version,updated_by,updated_at) VALUES (1,?,?,?,?,?,1,?,?)',
          [providerOrder, modelOverrides, disabled, tokenBudgets, keyBudgetsJson, actor.id, timestamp]);
      }
      await execute(tx, "INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,outcome,details_redacted) VALUES (?,?,'ASSISTANT_SETTINGS_UPDATED','ASSISTANT_SETTINGS','1','SUCCESS',?)",
        [uuid(), actor.id, `version=${version + 1};order=${order.join(',')};disabled=${disabledSlots.join(',')};budgets=${tokenBudgets};key_budgets=${keyBudgetsJson};changed=${changed.join(',')}`]);
      const settings: AssistantSettings = {
        order: order as ProviderId[], models: body.models, disabledSlots,
        tokenBudgets: body.tokenBudgets, keyBudgets, version: version + 1, updatedAt: timestamp,
      };
      return { ...settingsView(settings, runtime, access.permissions), changed: true };
    }));
  });

  app.get('/api/v1/admin/assistant/usage', async c => {
    const actor = requireActor(c, true);
    const days = z.coerce.number().int().min(1).max(90).default(7).parse(c.req.query('days'));
    return c.json(await transaction(db, async tx => {
      await authorizePermission(tx, actor, 'assistant:usage:read');
      return usageSummary(tx, days);
    }, 'read'));
  });
}
