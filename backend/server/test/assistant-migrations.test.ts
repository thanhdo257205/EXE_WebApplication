import { test } from 'node:test';
import assert from 'node:assert/strict';
import { all, database, execute, one, scalar } from '../src/db.ts';
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
  // The credential table is rebuilt at boot (see the motapis CHECK widening below), and the copy keeps
  // its foreign keys, so this fixture needs the parent table a real database always has.
  await execute(db, 'CREATE TABLE app_users (id TEXT PRIMARY KEY, email TEXT NOT NULL, display_name TEXT NOT NULL)');
  await execute(db, "INSERT INTO app_users(id,email,display_name) VALUES ('owner','owner@example.test','Owner')");
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

test('every usage grouping divides latency by answered requests, not by cache-hit-inflated requests', async t => {
  const db = database('file::memory:');
  t.after(() => db.close());
  await initializeAssistantUsage(db);

  const recorder = createUsageRecorder(db, { flushSize: 1 });
  recorder.record({ provider: 'groq', slot: 'groq#1', model: 'm', latencyMs: 300 });
  recorder.record({ provider: 'groq', slot: 'groq#1', model: 'm', latencyMs: 100 });
  recorder.record({ provider: 'groq', slot: 'groq#1', model: 'm', cacheHit: true });
  await recorder.flush();

  const summary = await usageSummary(db, 7);
  // 400 ms spread over the 2 requests that reached a provider: 200 ms everywhere, not 133 ms on one card.
  assert.deepEqual([summary.slots[0].requests, summary.slots[0].avgLatencyMs], [3, 200]);
  assert.equal(summary.totals.avgLatencyMs, 200);
  assert.equal(summary.providers[0].avgLatencyMs, 200);
  assert.equal(summary.keys[0].avgLatencyMs, 200);
});

const oldCredentialsDdl = `CREATE TABLE assistant_credentials (
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
)`;

/** SQLite cannot widen a CHECK in place, so accepting the paid provider means a copy-and-swap rebuild. */
test('the credentials provider CHECK is widened without losing rows, telemetry or index rules', async t => {
  const db = database('file::memory:');
  t.after(() => db.close());
  await execute(db, 'CREATE TABLE app_users (id TEXT PRIMARY KEY, email TEXT NOT NULL, display_name TEXT NOT NULL)');
  await execute(db, "INSERT INTO app_users(id,email,display_name) VALUES ('owner','owner@example.test','Owner')");
  await execute(db, oldCredentialsDdl);
  await execute(db, `CREATE UNIQUE INDEX ux_assistant_credentials_fingerprint ON assistant_credentials(provider,fingerprint) WHERE status <> 'REVOKED'`);
  await execute(db, 'CREATE INDEX ix_assistant_credentials_owner ON assistant_credentials(owner_id,created_at)');
  await execute(db, 'CREATE INDEX ix_assistant_credentials_active ON assistant_credentials(status,created_at)');
  // A database that already carries the advisory telemetry columns must keep their values through the swap.
  await execute(db, "ALTER TABLE assistant_credentials ADD COLUMN last_test_status TEXT");
  await execute(db, "ALTER TABLE assistant_credentials ADD COLUMN last_test_latency_ms INTEGER");
  await execute(db, "INSERT INTO assistant_credentials(id,provider,owner_id,label,secret_enc,key_hint,fingerprint,status,last_test_status,last_test_latency_ms) VALUES ('k1','groq','owner','Groq chính','v1.ciphertext','••••1234','fp-groq','ACTIVE','OK',120)");

  await initializeAssistantCredentials(db);

  const ddl = String((await one(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name='assistant_credentials'")).sql);
  assert.match(ddl, /'motapis'/);
  assert.equal(await scalar(db, "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='assistant_credentials_next'"), 0);
  const kept = await one(db, 'SELECT provider,secret_enc,status,last_test_status,last_test_latency_ms FROM assistant_credentials WHERE id=?', ['k1']);
  assert.deepEqual([kept.provider, kept.secret_enc, kept.status, kept.last_test_status, Number(kept.last_test_latency_ms)],
    ['groq', 'v1.ciphertext', 'ACTIVE', 'OK', 120]);

  const insert = (id: string, provider: string, fingerprint: string, status: string) =>
    execute(db, `INSERT INTO assistant_credentials(id,provider,owner_id,label,secret_enc,key_hint,fingerprint,status) VALUES (?,?,?,?,?,?,?,?)`,
      [id, provider, 'owner', 'Key', 'v1.x', '••••5678', fingerprint, status]);
  // The whole point of the migration: a paid key can now be stored.
  await insert('k2', 'motapis', 'fp-motapis', 'ACTIVE');
  assert.equal(await scalar(db, "SELECT COUNT(*) FROM assistant_credentials WHERE provider='motapis'"), 1);
  // Anything outside the list stays rejected, and both CHECK guards of the original table survive.
  await assert.rejects(insert('k3', 'openai', 'fp-openai', 'ACTIVE'), /CHECK constraint failed/);
  // The other CHECK of the original table survived the copy too.
  await assert.rejects(insert('k4', 'groq', 'fp-k4', 'DELETED'), /CHECK constraint failed/);
  // The partial unique index survived the swap: a live key cannot repeat, a revoked one can.
  await assert.rejects(insert('k5', 'groq', 'fp-groq', 'ACTIVE'), /UNIQUE constraint failed/);
  await execute(db, "UPDATE assistant_credentials SET status='REVOKED' WHERE id='k1'");
  await insert('k6', 'groq', 'fp-groq', 'ACTIVE');
  const indexes = (await all(db, "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='assistant_credentials' AND name NOT LIKE 'sqlite_%'"))
    .map(row => String(row.name)).sort();
  assert.deepEqual(indexes, ['ix_assistant_credentials_active', 'ix_assistant_credentials_owner', 'ux_assistant_credentials_fingerprint']);

  // A second boot must be a no-op: the CHECK already lists every provider, so nothing is copied again.
  await initializeAssistantCredentials(db);
  assert.equal(await scalar(db, 'SELECT COUNT(*) FROM assistant_credentials'), 3);
});

/**
 * The copy runs before the drop, so a process killed in between leaves the surviving rows under the
 * staging name. Booting must restore them instead of creating an empty table over the orphan.
 */
test('a rebuild interrupted between the copy and the rename restores the staged rows', async t => {
  const db = database('file::memory:');
  t.after(() => db.close());
  await execute(db, 'CREATE TABLE app_users (id TEXT PRIMARY KEY, email TEXT NOT NULL, display_name TEXT NOT NULL)');
  await execute(db, "INSERT INTO app_users(id,email,display_name) VALUES ('owner','owner@example.test','Owner')");
  // The staging table is what the interrupted rebuild had already written: the widened CHECK, rows copied.
  await execute(db, oldCredentialsDdl
    .replace('assistant_credentials (', 'assistant_credentials_next (')
    .replace("'openrouter')", "'openrouter','motapis')"));
  await execute(db, "INSERT INTO assistant_credentials_next(id,provider,owner_id,label,secret_enc,key_hint,fingerprint,status) VALUES ('k1','groq','owner','Groq chính','v1.ciphertext','••••1234','fp-groq','ACTIVE')");

  await initializeAssistantCredentials(db);

  assert.equal(await scalar(db, "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='assistant_credentials_next'"), 0);
  const restored = await one(db, 'SELECT provider,label,secret_enc,status FROM assistant_credentials WHERE id=?', ['k1']);
  assert.deepEqual([restored.provider, restored.label, restored.secret_enc, restored.status], ['groq', 'Groq chính', 'v1.ciphertext', 'ACTIVE']);
  await execute(db, "INSERT INTO assistant_credentials(id,provider,owner_id,label,secret_enc,key_hint,fingerprint,status) VALUES ('k2','motapis','owner','MộtAPI','v1.y','••••5678','fp-motapis','ACTIVE')");
  assert.equal(await scalar(db, 'SELECT COUNT(*) FROM assistant_credentials'), 2);
});
