import { test } from 'node:test';
import assert from 'node:assert/strict';
import { all, database, execute, one } from '../src/db.ts';
import { createUsageRecorder, initializeAssistantUsage, usageSummary } from '../src/assistant-usage.ts';
import { initializeAssistantCredentials } from '../src/assistant-credentials.ts';
import { initializeAssistantSettings, loadAssistantSettings } from '../src/assistant-settings.ts';
import { DEFAULT_MODELS } from '../src/assistant-providers.ts';

test('assistant tables created before token accounting are upgraded in place', async t => {
  const db = database('file::memory:');
  t.after(() => db.close());
  await execute(db, `CREATE TABLE assistant_usage_daily (
    day TEXT NOT NULL, provider TEXT NOT NULL, slot TEXT NOT NULL, model TEXT NOT NULL,
    requests INTEGER NOT NULL DEFAULT 0 CHECK (requests >= 0),
    cache_hits INTEGER NOT NULL DEFAULT 0 CHECK (cache_hits >= 0),
    failures INTEGER NOT NULL DEFAULT 0 CHECK (failures >= 0),
    latency_ms_sum INTEGER NOT NULL DEFAULT 0 CHECK (latency_ms_sum >= 0),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now')),
    PRIMARY KEY (day, provider, slot, model)
  )`);
  await execute(db, `CREATE TABLE assistant_settings (
    slot INTEGER PRIMARY KEY CHECK (slot=1),
    provider_order TEXT NOT NULL,
    model_overrides TEXT NOT NULL,
    disabled_slots TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    updated_by TEXT,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now'))
  )`);
  const today = new Date().toISOString().slice(0, 10);
  await execute(db, "INSERT INTO assistant_usage_daily(day,provider,slot,model,requests) VALUES (?,'groq','groq#1','m',5)", [today]);
  await execute(db, `INSERT INTO assistant_settings(slot,provider_order,model_overrides,disabled_slots) VALUES (1,?,?, '[]')`, [
    JSON.stringify(['gemini', 'groq', 'openrouter']),
    JSON.stringify({ gemini: 'gemini-2.5-flash', groq: 'llama-3.3-70b-versatile', openrouter: 'vendor/custom-model' }),
  ]);

  await initializeAssistantUsage(db);
  await initializeAssistantSettings(db);

  const usageColumns = (await all(db, 'PRAGMA table_info(assistant_usage_daily)')).map(row => String(row.name));
  assert.ok(usageColumns.includes('tokens_in'));
  assert.ok(usageColumns.includes('tokens_out'));
  const settingsColumns = (await all(db, 'PRAGMA table_info(assistant_settings)')).map(row => String(row.name));
  assert.ok(settingsColumns.includes('token_budgets'));

  const recorder = createUsageRecorder(db, { flushSize: 1 });
  recorder.record({ provider: 'groq', slot: 'groq#1', model: 'm', tokensIn: 12, tokensOut: 3 });
  await recorder.flush();
  const summary = await usageSummary(db, 7);
  // The historical row keeps its counters and starts token accounting at zero.
  assert.equal(summary.totals.requests, 6);
  assert.equal(summary.totals.tokensIn, 12);
  assert.equal(summary.totals.tokensOut, 3);
  assert.deepEqual(summary.today.providers, [{ provider: 'groq', tokensIn: 12, tokensOut: 3 }]);
  const settings = await loadAssistantSettings(db, null);
  // Retired product defaults are rewritten once, while a custom admin model survives untouched.
  assert.equal(settings.models.gemini, DEFAULT_MODELS.gemini);
  assert.equal(settings.models.groq, DEFAULT_MODELS.groq);
  assert.equal(settings.models.openrouter, 'vendor/custom-model');
  assert.equal(settings.version, 2);
  assert.deepEqual(settings.tokenBudgets, {});
  // Repeat startup must be a no-op: the rewritten ids no longer match, so the version stays put.
  await initializeAssistantSettings(db);
  assert.equal((await loadAssistantSettings(db, null)).version, 2);
});

test('stored key telemetry and per-key budgets are added to databases that predate them', async t => {
  const db = database('file::memory:');
  t.after(() => db.close());
  await execute(db, `CREATE TABLE assistant_credentials (
    id TEXT PRIMARY KEY, provider TEXT NOT NULL, owner_id TEXT NOT NULL, label TEXT NOT NULL,
    secret_enc TEXT NOT NULL, key_hint TEXT NOT NULL, account_hint TEXT, fingerprint TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    approved_by TEXT, approved_at TEXT, revoked_at TEXT
  )`);
  await execute(db, `CREATE TABLE assistant_settings (
    slot INTEGER PRIMARY KEY CHECK (slot=1),
    provider_order TEXT NOT NULL, model_overrides TEXT NOT NULL, disabled_slots TEXT NOT NULL,
    token_budgets TEXT NOT NULL DEFAULT '{}',
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1), updated_by TEXT,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now'))
  )`);
  const keyId = '7a4e5c92-1d3b-4f60-9a11-2c5d8e9f0a1b';
  await execute(db, "INSERT INTO assistant_credentials(id,provider,owner_id,label,secret_enc,key_hint,fingerprint,status,created_at,updated_at) VALUES (?,'groq','owner','Key','v1.x','••••1234','fp','ACTIVE','2026-10-01','2026-10-01')", [keyId]);
  await execute(db, `INSERT INTO assistant_settings(slot,provider_order,model_overrides,disabled_slots,token_budgets) VALUES (1,'["groq"]','{}','[]','{"groq":9000}')`);

  await initializeAssistantCredentials(db);
  await initializeAssistantSettings(db);
  await initializeAssistantUsage(db);

  const keyColumns = (await all(db, 'PRAGMA table_info(assistant_credentials)')).map(row => String(row.name));
  for (const column of ['last_test_status', 'last_test_code', 'last_test_model', 'last_test_latency_ms', 'last_tested_at']) {
    assert.ok(keyColumns.includes(column), column);
  }
  const settings = await loadAssistantSettings(db, null);
  assert.deepEqual(settings.keyBudgets, {});
  assert.deepEqual(settings.tokenBudgets, { groq: 9000 });

  // Usage rows are keyed by the router slot, so one stored key aggregates its own totals.
  const recorder = createUsageRecorder(db, { flushSize: 1 });
  recorder.record({ provider: 'groq', slot: `db:${keyId}`, model: 'm', tokensIn: 40, tokensOut: 8, latencyMs: 200 });
  await recorder.flush();
  const summary = await usageSummary(db, 7);
  assert.deepEqual(summary.keys, [{ slot: `db:${keyId}`, provider: 'groq', requests: 1, failures: 0, tokensIn: 40, tokensOut: 8, avgLatencyMs: 200 }]);
  assert.deepEqual(summary.today.slots, [{ slot: `db:${keyId}`, provider: 'groq', requests: 1, failures: 0, tokensIn: 40, tokensOut: 8 }]);
  assert.deepEqual(summary.slots, [{ slot: `db:${keyId}`, provider: 'groq', model: 'm', requests: 1, failures: 0, tokensIn: 40, tokensOut: 8, avgLatencyMs: 200 }]);

  await execute(db, "UPDATE assistant_credentials SET last_test_status='FAILED',last_test_code='QUOTA',last_test_model='m',last_test_latency_ms=120,last_tested_at='2026-10-28T10:00:00.000Z' WHERE id=?", [keyId]);
  const row = await one(db, 'SELECT last_test_status,last_test_code,last_test_model,last_test_latency_ms,last_tested_at FROM assistant_credentials WHERE id=?', [keyId]);
  assert.deepEqual(
    [row.last_test_status, row.last_test_code, row.last_test_model, Number(row.last_test_latency_ms), row.last_tested_at],
    ['FAILED', 'QUOTA', 'm', 120, '2026-10-28T10:00:00.000Z'],
  );
});
