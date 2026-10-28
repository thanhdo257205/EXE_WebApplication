// Provider adapters and failover router for the public board-game assistant.
// Native fetch only: the backend does not depend on any AI SDK.

import { decodeMasterKey } from './assistant-crypto.ts';

export const PROVIDER_LABELS: Readonly<Record<'workers-ai' | 'gemini' | 'groq' | 'openrouter', string>> = {
  'workers-ai': 'Cloudflare Workers AI',
  gemini: 'Google Gemini',
  groq: 'Groq',
  openrouter: 'OpenRouter',
};

export type ChatRole = 'user' | 'assistant';
export interface ChatMessage { role: ChatRole; content: string; }
export type ProviderId = 'workers-ai' | 'gemini' | 'groq' | 'openrouter';
export type ProviderFailure = 'QUOTA' | 'AUTH' | 'TIMEOUT' | 'UNAVAILABLE' | 'INVALID' | 'EMPTY';
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export class ProviderError extends Error {
  readonly provider: ProviderId;
  readonly failure: ProviderFailure;
  constructor(provider: ProviderId, failure: ProviderFailure) {
    super(failure);
    this.name = 'ProviderError';
    this.provider = provider;
    this.failure = failure;
  }
}

export class NoProviderAvailable extends Error {
  readonly failures: ProviderFailure[];
  constructor(failures: ProviderFailure[]) {
    super('No AI provider available');
    this.name = 'NoProviderAvailable';
    this.failures = failures;
  }
}

export interface CompletionRequest {
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  signal: AbortSignal;
}
export interface CompletionResult {
  text: string;
  /** Provider-reported token usage; stays 0 when the provider omits it. */
  tokensIn: number;
  tokensOut: number;
}
export interface ChatProvider {
  readonly id: ProviderId;
  /** One credential slot of a provider (`gemini#1`, `gemini#2`). Cooldowns are tracked per slot. */
  readonly slot: string;
  readonly model: string;
  complete(request: CompletionRequest): Promise<CompletionResult>;
  withModel(model: string): ChatProvider;
}
export interface AssistantOptions {
  providers: ChatProvider[];
  timeoutMs: number;
  attemptTimeoutMs: number;
  maxOutputTokens: number;
  temperature: number;
  /** Master key for admin-managed credentials; null/absent disables key storage. */
  credentialKey?: Buffer | null;
  /** Env-selected default model per provider, used for credentials stored in the database. */
  models?: Partial<Record<ProviderId, string>>;
  siteUrl?: string;
  fetch?: FetchLike;
}
export interface RoutedCompletion { text: string; provider: ProviderId; slot: string; model: string; attempts: number; tokensIn: number; tokensOut: number; }

const failureForStatus = (status: number): ProviderFailure =>
  status === 402 || status === 429 ? 'QUOTA' : status === 401 || status === 403 ? 'AUTH' : status >= 500 ? 'UNAVAILABLE' : 'INVALID';

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const textOf = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const joined = (values: unknown[]): string => values.map(textOf).filter(Boolean).join('\n').trim();
const tokenCount = (value: unknown): number => {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.min(10_000_000, Math.round(count)) : 0;
};
/** OpenAI-compatible `usage`, Gemini `usageMetadata` and Workers AI usage all expose similar counters. */
const tokensOf = (value: unknown): { tokensIn: number; tokensOut: number } => {
  const usage = record(value);
  return {
    tokensIn: tokenCount(usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokenCount),
    tokensOut: tokenCount(usage.completion_tokens ?? usage.output_tokens ?? usage.candidatesTokenCount),
  };
};

/** Gemini reports a bad API key as HTTP 400, which status-only mapping would call INVALID. */
async function geminiKeyRejected(response: Response): Promise<boolean> {
  try {
    const error = record(record(await response.clone().json()).error);
    const reasons = list(error.details).map(entry => textOf(record(entry).reason));
    return reasons.includes('API_KEY_INVALID') || /api key not valid/i.test(textOf(error.message));
  } catch { return false; }
}

async function postJson(provider: ProviderId, fetcher: FetchLike, url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal, redirect: 'error' });
  } catch {
    throw new ProviderError(provider, signal.aborted ? 'TIMEOUT' : 'UNAVAILABLE');
  }
  if (!response.ok) {
    const failure = provider === 'gemini' && response.status === 400 && await geminiKeyRejected(response) ? 'AUTH' : failureForStatus(response.status);
    throw new ProviderError(provider, failure);
  }
  try { return await response.json(); }
  catch { throw new ProviderError(provider, 'INVALID'); }
}

export interface WorkersAiOptions { accountId: string; token: string; model?: string; slot?: string; fetch?: FetchLike; }
export function workersAiProvider(options: WorkersAiOptions): ChatProvider {
  const fetcher = options.fetch ?? fetch;
  const build = (model: string, slot: string): ChatProvider => ({
    id: 'workers-ai', slot, model,
    withModel: next => build(next, slot),
    async complete(request) {
      const data = await postJson('workers-ai', fetcher,
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(options.accountId)}/ai/run/${model}`,
        { Authorization: `Bearer ${options.token}` },
        { messages: [{ role: 'system', content: request.system }, ...request.messages], max_tokens: request.maxTokens, temperature: request.temperature },
        request.signal);
      const root = record(data);
      if (root.success === false) throw new ProviderError('workers-ai', 'UNAVAILABLE');
      const result = root.result;
      const direct = textOf(result);
      const fromObject = textOf(record(result).response);
      const choices = list(record(result).choices);
      const fromChoices = textOf(record(record(choices[0]).message).content);
      const text = direct || fromObject || fromChoices;
      if (!text) throw new ProviderError('workers-ai', 'EMPTY');
      return { text, ...tokensOf(root.usage ?? record(result).usage) };
    },
  });
  return build(options.model || '@cf/meta/llama-3.1-8b-instruct', options.slot || 'workers-ai#1');
}

export interface GeminiOptions { apiKey: string; model?: string; slot?: string; fetch?: FetchLike; }
export function geminiProvider(options: GeminiOptions): ChatProvider {
  const fetcher = options.fetch ?? fetch;
  const build = (model: string, slot: string): ChatProvider => ({
    id: 'gemini', slot, model,
    withModel: next => build(next, slot),
    async complete(request) {
      const data = await postJson('gemini', fetcher,
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        { 'x-goog-api-key': options.apiKey },
        {
          systemInstruction: { parts: [{ text: request.system }] },
          contents: request.messages.map(message => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] })),
          generationConfig: { maxOutputTokens: request.maxTokens, temperature: request.temperature },
        },
        request.signal);
      const root = record(data);
      if (record(root.promptFeedback).blockReason) throw new ProviderError('gemini', 'EMPTY');
      const candidates = list(root.candidates);
      const parts = list(record(record(candidates[0]).content).parts);
      const text = joined(parts.map(part => record(part).text));
      if (!text) throw new ProviderError('gemini', 'EMPTY');
      return { text, ...tokensOf(root.usageMetadata) };
    },
  });
  return build(options.model || DEFAULT_MODELS.gemini, options.slot || 'gemini#1');
}

const openAiCompatible = (provider: 'groq' | 'openrouter', url: string, options: { apiKey: string; model: string; slot: string; headers?: Record<string, string>; fetch?: FetchLike }): ChatProvider => {
  const fetcher = options.fetch ?? fetch;
  const build = (model: string, slot: string): ChatProvider => ({
    id: provider, slot, model,
    withModel: next => build(next, slot),
    async complete(request) {
      // GPT-OSS spends the completion budget on hidden reasoning first; low effort keeps short answers from coming back empty.
      const reasoning = provider === 'groq' && /^openai\/gpt-oss/i.test(model) ? { reasoning_effort: 'low' } : {};
      const data = await postJson(provider, fetcher, url, { Authorization: `Bearer ${options.apiKey}`, ...options.headers },
        { model, messages: [{ role: 'system', content: request.system }, ...request.messages], max_tokens: request.maxTokens, temperature: request.temperature, ...reasoning },
        request.signal);
      const root = record(data);
      if (root.error) {
        const code = Number(record(root.error).code);
        throw new ProviderError(provider, code === 402 || code === 429 ? 'QUOTA' : 'INVALID');
      }
      const choices = list(root.choices);
      const content = record(record(choices[0]).message).content;
      const text = textOf(content) || joined(list(content).map(part => typeof part === 'string' ? part : record(part).text));
      if (!text) throw new ProviderError(provider, 'EMPTY');
      return { text, ...tokensOf(root.usage) };
    },
  });
  return build(options.model, options.slot);
};

export interface GroqOptions { apiKey: string; model?: string; slot?: string; fetch?: FetchLike; }
export function groqProvider(options: GroqOptions): ChatProvider {
  return openAiCompatible('groq', 'https://api.groq.com/openai/v1/chat/completions',
    { apiKey: options.apiKey, model: options.model || DEFAULT_MODELS.groq, slot: options.slot || 'groq#1', fetch: options.fetch });
}

export interface OpenRouterOptions { apiKey: string; model?: string; slot?: string; siteUrl?: string; fetch?: FetchLike; }
export function openRouterProvider(options: OpenRouterOptions): ChatProvider {
  // Header values must be Latin-1, so the fixed title stays ASCII.
  const headers: Record<string, string> = { 'X-Title': 'Nha Nay Hoi Bao - Board game assistant' };
  if (options.siteUrl) headers['HTTP-Referer'] = options.siteUrl;
  return openAiCompatible('openrouter', 'https://openrouter.ai/api/v1/chat/completions',
    { apiKey: options.apiKey, model: options.model || DEFAULT_MODELS.openrouter, slot: options.slot || 'openrouter#1', headers, fetch: options.fetch });
}

const DEFAULT_COOLDOWNS: Readonly<Record<ProviderFailure, number>> = {
  QUOTA: 300_000,
  AUTH: 1_800_000,
  TIMEOUT: 60_000,
  UNAVAILABLE: 60_000,
  INVALID: 0,
  EMPTY: 0,
};
export interface RouterOptions {
  providers: ChatProvider[];
  timeoutMs: number;
  attemptTimeoutMs?: number;
  cooldownMs?: Partial<Record<ProviderFailure, number>>;
  now?: () => number;
}

/**
 * Tries configured providers in order within one total deadline. A provider that fails is
 * skipped for a cooldown window, so an exhausted daily quota does not cost a request each time.
 */
export class ProviderRouter {
  readonly providers: ChatProvider[];
  private readonly timeoutMs: number;
  private readonly attemptTimeoutMs: number;
  private readonly cooldownMs: Record<ProviderFailure, number>;
  private readonly now: () => number;
  // Keyed by slot, so one exhausted key skips only itself while sibling keys stay usable.
  private readonly blockedUntil = new Map<string, number>();

  constructor(options: RouterOptions) {
    this.providers = options.providers;
    this.timeoutMs = options.timeoutMs;
    this.attemptTimeoutMs = options.attemptTimeoutMs ?? 7_000;
    this.cooldownMs = { ...DEFAULT_COOLDOWNS, ...options.cooldownMs };
    this.now = options.now ?? Date.now;
  }

  async complete(input: Omit<CompletionRequest, 'signal'>, providers: readonly ChatProvider[] = this.providers): Promise<RoutedCompletion> {
    const deadline = this.now() + this.timeoutMs;
    const failures: ProviderFailure[] = [];
    let attempts = 0;
    for (const provider of providers) {
      if ((this.blockedUntil.get(provider.slot) ?? 0) > this.now()) continue;
      const remaining = deadline - this.now();
      if (remaining < 500) break;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(remaining, this.attemptTimeoutMs));
      attempts++;
      try {
        const result = await provider.complete({ ...input, signal: controller.signal });
        if (!result.text.trim()) throw new ProviderError(provider.id, 'EMPTY');
        this.blockedUntil.delete(provider.slot);
        return {
          text: result.text, provider: provider.id, slot: provider.slot, model: provider.model, attempts,
          tokensIn: result.tokensIn ?? 0, tokensOut: result.tokensOut ?? 0,
        };
      } catch (error) {
        const failure = error instanceof ProviderError ? error.failure : 'UNAVAILABLE';
        failures.push(failure);
        const cooldown = this.cooldownMs[failure];
        if (cooldown > 0) this.blockedUntil.set(provider.slot, this.now() + cooldown);
      } finally {
        clearTimeout(timer);
      }
    }
    throw new NoProviderAvailable(failures);
  }
}

// Retired model ids are rejected by providers (Groq shut down Llama 3.3 70B on 2026-08-16 and Gemini
// no longer serves 2.5 Flash to new keys), so the fallbacks must track the current free-tier lineup.
export const DEFAULT_MODELS: Readonly<Record<ProviderId, string>> = {
  'workers-ai': '@cf/meta/llama-3.1-8b-instruct',
  gemini: 'gemini-3.5-flash-lite',
  groq: 'openai/gpt-oss-120b',
  openrouter: 'google/gemma-4-26b-a4b-it:free',
};
export const DEFAULT_ORDER: readonly ProviderId[] = ['workers-ai', 'gemini', 'groq', 'openrouter'];
export const isProviderId = (value: string): value is ProviderId => (DEFAULT_ORDER as readonly string[]).includes(value);

const bounded = (value: string | undefined, fallback: number, min: number, max: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};
const clean = (value: string | undefined): string => (value ?? '').trim();
/** Comma/newline/semicolon separated credentials; order is preserved so slot numbers are stable. */
const credentialList = (value: string | undefined): string[] => {
  const seen = new Set<string>();
  for (const entry of (value ?? '').split(/[\s,;]+/)) {
    const item = entry.trim();
    if (item) seen.add(item);
  }
  return [...seen];
};

/** Builds every credential slot from env; missing credentials simply remove that slot. */
export function assistantFromEnv(env: Record<string, string | undefined>, fetchImpl: FetchLike = fetch): AssistantOptions {
  const requested = (clean(env.AI_PROVIDER_ORDER) || DEFAULT_ORDER.join(',')).split(',');
  const order: ProviderId[] = [];
  for (const entry of requested) {
    const id = entry.trim().toLowerCase();
    if (isProviderId(id) && !order.includes(id)) order.push(id);
  }
  const siteUrl = clean(env.OPENROUTER_SITE_URL) || clean(env.PUBLIC_ORIGIN) || 'https://exe-webapp.pages.dev';
  const build: Record<ProviderId, () => ChatProvider[]> = {
    'workers-ai': () => {
      const accounts = credentialList(env.CLOUDFLARE_AI_ACCOUNTS)
        .map(entry => {
          const separator = entry.indexOf(':');
          return separator > 0 ? { accountId: entry.slice(0, separator).trim(), token: entry.slice(separator + 1).trim() } : null;
        })
        .filter((pair): pair is { accountId: string; token: string } => Boolean(pair?.accountId && pair.token));
      const singular = { accountId: clean(env.CLOUDFLARE_AI_ACCOUNT_ID), token: clean(env.CLOUDFLARE_AI_API_TOKEN) };
      if (singular.accountId && singular.token) accounts.push(singular as { accountId: string; token: string });
      const unique = [...new Map(accounts.map(account => [`${account.accountId}:${account.token}`, account])).values()];
      return unique.map((account, index) => workersAiProvider({
        ...account, model: clean(env.CLOUDFLARE_AI_MODEL) || DEFAULT_MODELS['workers-ai'], slot: `workers-ai#${index + 1}`, fetch: fetchImpl,
      }));
    },
    gemini: () => {
      const keys = [...credentialList(env.GEMINI_API_KEYS), clean(env.GEMINI_API_KEY)].filter(Boolean);
      return [...new Set(keys)].map((apiKey, index) => geminiProvider({
        apiKey, model: clean(env.GEMINI_MODEL) || DEFAULT_MODELS.gemini, slot: `gemini#${index + 1}`, fetch: fetchImpl,
      }));
    },
    groq: () => {
      const keys = [...credentialList(env.GROQ_API_KEYS), clean(env.GROQ_API_KEY)].filter(Boolean);
      return [...new Set(keys)].map((apiKey, index) => groqProvider({
        apiKey, model: clean(env.GROQ_MODEL) || DEFAULT_MODELS.groq, slot: `groq#${index + 1}`, fetch: fetchImpl,
      }));
    },
    openrouter: () => {
      const keys = [...credentialList(env.OPENROUTER_API_KEYS), clean(env.OPENROUTER_API_KEY)].filter(Boolean);
      return [...new Set(keys)].map((apiKey, index) => openRouterProvider({
        apiKey, model: clean(env.OPENROUTER_MODEL) || DEFAULT_MODELS.openrouter, slot: `openrouter#${index + 1}`, siteUrl, fetch: fetchImpl,
      }));
    },
  };
  const providers: ChatProvider[] = [];
  for (const id of order) providers.push(...build[id]());
  const timeoutMs = Math.round(bounded(env.AI_TIMEOUT_MS, 30_000, 5_000, 55_000));
  const attemptTimeoutMs = Math.round(bounded(env.AI_ATTEMPT_TIMEOUT_MS, 7_000, 2_000, timeoutMs));
  const secret = clean(env.ASSISTANT_KEY_SECRET);
  const credentialKey = decodeMasterKey(secret);
  if (secret && !credentialKey) throw new Error('ASSISTANT_KEY_SECRET must be Base64 for exactly 32 bytes');
  const models: Partial<Record<ProviderId, string>> = {
    'workers-ai': clean(env.CLOUDFLARE_AI_MODEL) || DEFAULT_MODELS['workers-ai'],
    gemini: clean(env.GEMINI_MODEL) || DEFAULT_MODELS.gemini,
    groq: clean(env.GROQ_MODEL) || DEFAULT_MODELS.groq,
    openrouter: clean(env.OPENROUTER_MODEL) || DEFAULT_MODELS.openrouter,
  };
  return {
    providers,
    timeoutMs,
    attemptTimeoutMs,
    maxOutputTokens: Math.round(bounded(env.AI_MAX_OUTPUT_TOKENS, 700, 128, 2_048)),
    temperature: bounded(env.AI_TEMPERATURE, 0.3, 0, 1),
    credentialKey,
    models,
    siteUrl,
    fetch: fetchImpl,
  };
}
