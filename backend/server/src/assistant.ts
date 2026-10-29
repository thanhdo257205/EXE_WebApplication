import type { Client } from '@libsql/client';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { fail } from './db.ts';
import type { Cache } from './cache.ts';
import { requireActor, type Api } from './auth.ts';
import { loadKnowledge, normalizeVietnamese, retrieve } from './assistant-knowledge.ts';
import { NoProviderAvailable, ProviderRouter, type AssistantOptions, type ChatMessage } from './assistant-providers.ts';
import { activeProviders, cachedAssistantSettings } from './assistant-settings.ts';
import { cachedAssistantPrompt, renderPrompt } from './assistant-prompt.ts';
import { assistantRuntimeOptions } from './assistant-credentials.ts';
import type { UsageRecorder } from './assistant-usage.ts';

export const ASSISTANT_PATH = '/api/v1/assistant/chat';
const ANSWER_KEY_SCHEMA = 'v1';
// Admin writes clear this instance's cache; the TTLs bound memory and staleness on other instances.
const KNOWLEDGE_TTL_MS = 5 * 60_000;
const ANSWER_TTL_MS = 30 * 60_000;
const MAX_HISTORY_MESSAGES = 4;
const MAX_HISTORY_CHARS = 500;

const canonical = (value: string): string => normalizeVietnamese(value).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
// Same question in the same conversation gets the same answer until the release or the stored prompt changes.
// The prompt version has to be part of the key because this instance keeps the previous prompt (and its
// answers, for ANSWER_TTL_MS) in memory; without it a retired prompt would keep answering after an approval.
export const answerKey = (releaseId: string, promptVersion: number, message: string, history: readonly ChatMessage[]): string => {
  const turns = history.map(turn => `${turn.role}:${canonical(turn.content)}`).join('\n');
  return `assistant:answer:${ANSWER_KEY_SCHEMA}:${releaseId}:p${promptVersion}:${createHash('sha256').update(`${turns}\n#\n${canonical(message)}`).digest('hex')}`;
};

const historyItem = z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(600) });
const chatSchema = z.object({
  message: z.string().trim().min(1).max(1_000),
  history: z.array(historyItem).max(8).optional().default([]),
});

const NO_RELEASE_ANSWER = 'Hiện website chưa có bản nội dung nào được phát hành, nên mình chưa có dữ liệu chính thức để tư vấn. Bạn có thể xem Hướng dẫn cách chơi để nắm các bước cơ bản, hoặc quay lại Wiki khi bản luật được phát hành nhé.';

export function assistantRoutes(app: Api, db: Client, cache: Cache, options: AssistantOptions | null, usage: UsageRecorder | null) {
  // The router keeps per-slot cooldowns across requests; database credentials join the slot list later.
  const router = options
    ? new ProviderRouter({ providers: options.providers, timeoutMs: options.timeoutMs, attemptTimeoutMs: options.attemptTimeoutMs })
    : null;
  app.post(ASSISTANT_PATH, async c => {
    // Login-only: the assistant spends a shared free quota, so anonymous callers are rejected before parsing.
    requireActor(c);
    const body = chatSchema.parse(await c.req.json());
    const runtime = await assistantRuntimeOptions(cache, db, options);
    const settings = await cachedAssistantSettings(cache, db, runtime);
    const active = runtime ? activeProviders(runtime.providers, settings) : [];
    if (!router || !runtime || !active.length) {
      usage?.record({ provider: 'none', slot: 'none', model: 'none', failure: true });
      return fail(503, 'AI_UNAVAILABLE');
    }
    const knowledge = await cache.cached('assistant:knowledge:v1', KNOWLEDGE_TTL_MS, () => loadKnowledge(db));
    if (!knowledge) {
      usage?.record({ provider: 'none', slot: 'none', model: 'none' });
      return c.json({
        answer: NO_RELEASE_ANSWER,
        sources: [{ title: 'Hướng dẫn cách chơi', url: '/cach-choi' }, { title: 'Wiki luật', url: '/wiki' }],
        release: null,
      });
    }
    const history: ChatMessage[] = body.history.slice(-MAX_HISTORY_MESSAGES)
      .map(item => ({ role: item.role, content: item.content.slice(0, MAX_HISTORY_CHARS) }));
    const prompt = await cachedAssistantPrompt(cache, db);
    const key = answerKey(knowledge.releaseId, prompt.version, body.message, history);
    const started = Date.now();
    const compute = async () => {
      // Retrieval runs only on a cache miss; a hit returns the sources stored with the answer.
      const retrieved = retrieve(knowledge, body.message);
      const result = await router.complete({
        system: renderPrompt(prompt, knowledge.versionLabel, retrieved.context),
        messages: [...history, { role: 'user', content: body.message }],
        maxTokens: runtime.maxOutputTokens,
        temperature: runtime.temperature,
      }, active);
      return {
        payload: {
          answer: result.text,
          sources: retrieved.sources,
          release: { versionLabel: knowledge.versionLabel, title: knowledge.releaseTitle },
        },
        meta: {
          provider: result.provider, slot: result.slot, model: result.model,
          tokensIn: result.tokensIn, tokensOut: result.tokensOut,
          considered: retrieved.considered, selected: retrieved.documents.length,
        },
      };
    };
    try {
      // A fresh entry (or an in-flight identical request) is served without provider work.
      const cacheHit = cache.has(key);
      const answer = await cache.cached(key, ANSWER_TTL_MS, compute);
      const latencyMs = cacheHit ? 0 : Date.now() - started;
      usage?.record({
        ...answer.meta,
        // A cache hit spends no provider tokens, so it must not inflate the daily budget bars.
        tokensIn: cacheHit ? 0 : answer.meta.tokensIn,
        tokensOut: cacheHit ? 0 : answer.meta.tokensOut,
        cacheHit,
        latencyMs,
      });
      // The trace lets the chat UI explain how an answer was produced without exposing prompts or keys.
      return c.json({
        ...answer.payload,
        meta: {
          provider: answer.meta.provider,
          model: answer.meta.model,
          cached: cacheHit,
          latencyMs,
          tokensIn: cacheHit ? 0 : answer.meta.tokensIn,
          tokensOut: cacheHit ? 0 : answer.meta.tokensOut,
          considered: answer.meta.considered,
          selected: answer.meta.selected,
        },
      });
    } catch (error) {
      if (error instanceof NoProviderAvailable) {
        console.warn('Assistant providers unavailable', { failures: error.failures });
        usage?.record({ provider: 'none', slot: 'none', model: 'none', failure: true, latencyMs: Date.now() - started });
        return fail(503, 'AI_UNAVAILABLE');
      }
      throw error;
    }
  });
}
