import { z } from 'zod';
import type { Client } from '@libsql/client';
import { all, execute, fail, now, transaction, uuid, type Executor } from './db.ts';
import { authorize, requireActor, type Api } from './auth.ts';
import { accessView } from './rbac-policy.ts';
import type { Cache } from './cache.ts';
import {
  DEFAULT_MODELS,
  DEFAULT_ORDER,
  PROVIDER_LABELS,
  isProviderId,
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
  version: number;
  updatedAt: string | null;
}

export const SETTINGS_KEY = 'assistant:settings:v1';
export const SETTINGS_TTL_MS = 30_000;
const MODEL_PATTERN = /^[A-Za-z0-9@._:/+-]+$/;
const SLOT_PATTERN = /^(?:[a-z0-9-]+#\d{1,3}|db:[0-9a-f-]{36})$/;
const MAX_TOKEN_BUDGET = 2_000_000_000;

export async function initializeAssistantSettings(db: Client): Promise<void> {
  await execute(db, `CREATE TABLE IF NOT EXISTS assistant_settings (
    slot INTEGER PRIMARY KEY CHECK (slot=1),
    provider_order TEXT NOT NULL,
    model_overrides TEXT NOT NULL,
    disabled_slots TEXT NOT NULL,
    token_budgets TEXT NOT NULL DEFAULT '{}',
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    updated_by TEXT REFERENCES app_users(id) ON DELETE SET NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now'))
  )`);
  await execute(db, "ALTER TABLE assistant_settings ADD COLUMN token_budgets TEXT NOT NULL DEFAULT '{}'").catch(() => undefined);
}

export function defaultAssistantSettings(options: AssistantOptions | null): AssistantSettings {
  const configured = options?.providers ?? [];
  const order: ProviderId[] = [];
  for (const provider of configured) if (!order.includes(provider.id)) order.push(provider.id);
  const models: Record<string, string> = { ...DEFAULT_MODELS };
  // The first slot of a provider carries the env-configured model, so it becomes the default override.
  for (const provider of configured) if (!(provider.id in models) || models[provider.id] === DEFAULT_MODELS[provider.id]) models[provider.id] = provider.model;
  return { order: order.length ? order : [...DEFAULT_ORDER], models, disabledSlots: [], tokenBudgets: {}, version: 0, updatedAt: null };
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
    if (isProviderId(id) && typeof value === 'string' && value.length <= 120 && MODEL_PATTERN.test(value)) models[id] = value;
  }
  const slots = new Set(availableSlotIds(options));
  const disabledSlots = [...new Set(jsonArray(row.disabled_slots))]
    .filter(slot => slot.length <= 64 && SLOT_PATTERN.test(slot) && slots.has(slot));
  const tokenBudgets: Record<string, number> = {};
  for (const [id, value] of Object.entries(jsonObject(row.token_budgets))) {
    const amount = Number(value);
    if (isProviderId(id) && Number.isSafeInteger(amount) && amount > 0 && amount <= MAX_TOKEN_BUDGET) tokenBudgets[id] = amount;
  }
  const version = Number(row.version);
  return {
    order: order.length ? order : base.order,
    models,
    disabledSlots,
    tokenBudgets,
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
  models: z.record(z.string(), z.string().trim().min(1).max(120).regex(MODEL_PATTERN)),
  disabledSlots: z.array(z.string()).max(64).default([]),
  tokenBudgets: z.record(z.string(), z.number().int().positive().max(MAX_TOKEN_BUDGET)),
  expectedVersion: z.number().int().nonnegative(),
}).strict();

const settingsView = (settings: AssistantSettings, options: AssistantOptions | null) => ({
  settings,
  providers: DEFAULT_ORDER.map(id => ({
    id,
    label: PROVIDER_LABELS[id],
    defaultModel: DEFAULT_MODELS[id],
    slots: (options?.providers ?? []).filter(provider => provider.id === id).map(provider => ({
      slot: provider.slot,
      disabled: settings.disabledSlots.includes(provider.slot),
    })),
  })).filter(provider => provider.slots.length),
});

export function assistantAdminRoutes(app: Api, db: Client, cache: Cache, options: AssistantOptions | null) {
  app.get('/api/v1/admin/assistant/settings', async c => {
    const actor = requireActor(c, true);
    const runtime = await assistantRuntimeOptions(cache, db, options);
    return c.json(await transaction(db, async tx => {
      const current = await authorize(tx, actor, true);
      const settings = await loadAssistantSettings(tx, runtime);
      const access = await accessView(tx, current);
      return { ...settingsView(settings, runtime), canManage: access.permissions.includes('admin:operate') };
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
    const available = new Set(availableSlotIds(runtime));
    const disabledSlots = [...new Set(body.disabledSlots)];
    if (disabledSlots.length !== body.disabledSlots.length || disabledSlots.some(slot => !available.has(slot))) return fail(400, 'UNKNOWN_SLOT');

    return c.json(await transaction(db, async tx => {
      const current = await authorize(tx, actor, true);
      if (!(await accessView(tx, current)).permissions.includes('admin:operate')) return fail(403, 'ADMIN_REQUIRED');
      const row = (await all(tx, 'SELECT version FROM assistant_settings WHERE slot=1'))[0];
      const version = row ? Number(row.version) : 0;
      if (version !== body.expectedVersion) return fail(409, 'VERSION_CONFLICT');
      const timestamp = now();
      const providerOrder = JSON.stringify(order);
      const modelOverrides = JSON.stringify(body.models);
      const disabled = JSON.stringify(disabledSlots);
      const tokenBudgets = JSON.stringify(body.tokenBudgets);
      if (row) {
        await execute(tx, 'UPDATE assistant_settings SET provider_order=?,model_overrides=?,disabled_slots=?,token_budgets=?,version=version+1,updated_by=?,updated_at=? WHERE slot=1 AND version=?',
          [providerOrder, modelOverrides, disabled, tokenBudgets, actor.id, timestamp, version]);
      } else {
        await execute(tx, 'INSERT INTO assistant_settings(slot,provider_order,model_overrides,disabled_slots,token_budgets,version,updated_by,updated_at) VALUES (1,?,?,?,?,1,?,?)',
          [providerOrder, modelOverrides, disabled, tokenBudgets, actor.id, timestamp]);
      }
      await execute(tx, "INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,outcome,details_redacted) VALUES (?,?,'ASSISTANT_SETTINGS_UPDATED','ASSISTANT_SETTINGS','1','SUCCESS',?)",
        [uuid(), actor.id, `version=${version + 1};order=${order.join(',')};disabled=${disabledSlots.join(',')};budgets=${tokenBudgets}`]);
      const settings: AssistantSettings = {
        order: order as ProviderId[], models: body.models, disabledSlots,
        tokenBudgets: body.tokenBudgets, version: version + 1, updatedAt: timestamp,
      };
      return { ...settingsView(settings, runtime), canManage: true };
    }));
  });

  app.get('/api/v1/admin/assistant/usage', async c => {
    const actor = requireActor(c, true);
    const days = z.coerce.number().int().min(1).max(90).default(7).parse(c.req.query('days'));
    return c.json(await transaction(db, async tx => {
      await authorize(tx, actor, true);
      return usageSummary(tx, days);
    }, 'read'));
  });
}
