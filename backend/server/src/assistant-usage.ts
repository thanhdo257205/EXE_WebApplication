import type { Client } from '@libsql/client';
import { all, execute, type Executor } from './db.ts';

// Provider telemetry only: no user id, question or answer text is stored. Events are aggregated
// in memory and flushed as daily upserts so cache hits do not cost a Turso write each time.
export interface UsageRecord {
  provider: string;
  slot: string;
  model: string;
  cacheHit?: boolean;
  failure?: boolean;
  latencyMs?: number;
}
export interface UsageRecorder {
  record(event: UsageRecord): void;
  flush(): Promise<void>;
  pending(): number;
}
interface Pending {
  day: string; provider: string; slot: string; model: string;
  requests: number; cacheHits: number; failures: number; latency: number;
}

export async function initializeAssistantUsage(db: Client): Promise<void> {
  await execute(db, `CREATE TABLE IF NOT EXISTS assistant_usage_daily (
    day TEXT NOT NULL,
    provider TEXT NOT NULL,
    slot TEXT NOT NULL,
    model TEXT NOT NULL,
    requests INTEGER NOT NULL DEFAULT 0 CHECK (requests >= 0),
    cache_hits INTEGER NOT NULL DEFAULT 0 CHECK (cache_hits >= 0),
    failures INTEGER NOT NULL DEFAULT 0 CHECK (failures >= 0),
    latency_ms_sum INTEGER NOT NULL DEFAULT 0 CHECK (latency_ms_sum >= 0),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now')),
    PRIMARY KEY (day, provider, slot, model)
  )`);
}

export function createUsageRecorder(db: Client, options: { flushSize?: number; clock?: () => number } = {}): UsageRecorder {
  const flushSize = options.flushSize ?? 25;
  const clock = options.clock ?? Date.now;
  const pending = new Map<string, Pending>();
  let events = 0;
  let tail: Promise<void> = Promise.resolve();

  const drain = async (): Promise<void> => {
    if (!pending.size) return;
    const rows = [...pending.values()];
    pending.clear();
    events = 0;
    try {
      await db.batch(rows.map(row => ({
        sql: `INSERT INTO assistant_usage_daily(day,provider,slot,model,requests,cache_hits,failures,latency_ms_sum,updated_at)
          VALUES (?,?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%f000Z','now'))
          ON CONFLICT(day,provider,slot,model) DO UPDATE SET
            requests=requests+excluded.requests,cache_hits=cache_hits+excluded.cache_hits,
            failures=failures+excluded.failures,latency_ms_sum=latency_ms_sum+excluded.latency_ms_sum,
            updated_at=excluded.updated_at`,
        args: [row.day, row.provider, row.slot, row.model, row.requests, row.cacheHits, row.failures, row.latency],
      })), 'write');
    } catch {
      // Metrics are best-effort and must never fail a user request or retain unbounded data.
      console.warn('Assistant usage flush failed', { rows: rows.length });
    }
  };
  const flush = (): Promise<void> => {
    const run = tail.then(drain);
    tail = run.catch(() => undefined);
    return run;
  };

  return {
    record(event) {
      const day = new Date(clock()).toISOString().slice(0, 10);
      const key = `${day}\n${event.provider}\n${event.slot}\n${event.model}`;
      const row = pending.get(key) ?? { day, provider: event.provider, slot: event.slot, model: event.model, requests: 0, cacheHits: 0, failures: 0, latency: 0 };
      row.requests += 1;
      if (event.cacheHit) row.cacheHits += 1;
      if (event.failure) row.failures += 1;
      row.latency += Math.max(0, Math.min(600_000, Math.round(event.latencyMs ?? 0)));
      pending.set(key, row);
      events += 1;
      if (events >= flushSize) void flush();
    },
    flush,
    pending: () => events,
  };
}

export async function usageSummary(db: Executor, days: number) {
  const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const rows = await all(db, `SELECT provider,slot,model,SUM(requests) requests,SUM(cache_hits) cache_hits,
    SUM(failures) failures,SUM(latency_ms_sum) latency
    FROM assistant_usage_daily WHERE day>=? GROUP BY provider,slot,model ORDER BY requests DESC`, [since]);
  const daily = await all(db, `SELECT day,SUM(requests) requests,SUM(cache_hits) cache_hits,SUM(failures) failures
    FROM assistant_usage_daily WHERE day>=? GROUP BY day ORDER BY day`, [since]);

  const number = (value: unknown): number => Number(value) || 0;
  const totals = { requests: 0, cacheHits: 0, failures: 0, answered: 0, avgLatencyMs: 0 };
  let latency = 0;
  const byProvider = new Map<string, { provider: string; requests: number; failures: number; latency: number; answered: number }>();
  const slots = rows.map(row => ({
    slot: String(row.slot), provider: String(row.provider), model: String(row.model),
    requests: number(row.requests), failures: number(row.failures),
    avgLatencyMs: row.provider === 'cache' || !number(row.requests) ? 0 : Math.round(number(row.latency) / number(row.requests)),
  }));
  for (const row of rows) {
    const requests = number(row.requests);
    totals.requests += requests;
    totals.cacheHits += number(row.cache_hits);
    totals.failures += number(row.failures);
    if (row.provider !== 'cache' && row.provider !== 'none') {
      // Cache hits carry no latency, so they must not dilute the provider response average.
      const answered = Math.max(0, requests - number(row.cache_hits));
      totals.answered += answered;
      latency += number(row.latency);
      const item = byProvider.get(String(row.provider)) ?? { provider: String(row.provider), requests: 0, failures: 0, latency: 0, answered: 0 };
      item.requests += requests; item.failures += number(row.failures); item.latency += number(row.latency); item.answered += answered;
      byProvider.set(item.provider, item);
    }
  }
  totals.avgLatencyMs = totals.answered ? Math.round(latency / totals.answered) : 0;
  return {
    days,
    since,
    totals,
    providers: [...byProvider.values()]
      .map(item => ({ provider: item.provider, requests: item.requests, failures: item.failures, avgLatencyMs: item.answered ? Math.round(item.latency / item.answered) : 0 }))
      .sort((a, b) => b.requests - a.requests),
    slots,
    daily: daily.map(row => ({
      day: String(row.day), requests: number(row.requests),
      cacheHits: number(row.cache_hits), failures: number(row.failures),
    })),
  };
}
