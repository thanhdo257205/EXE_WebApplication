import { test } from 'node:test';
import assert from 'node:assert/strict';
import { all, database, execute } from '../src/db.ts';
import { createUsageRecorder, initializeAssistantUsage, usageSummary } from '../src/assistant-usage.ts';
import { initializeAssistantSettings, loadAssistantSettings } from '../src/assistant-settings.ts';

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
  assert.deepEqual((await loadAssistantSettings(db, null)).tokenBudgets, {});
});
