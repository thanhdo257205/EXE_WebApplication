// Provider adapters and failover router for the public board-game assistant.
// Native fetch only: the backend does not depend on any AI SDK.

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
export interface ChatProvider {
  readonly id: ProviderId;
  readonly model: string;
  complete(request: CompletionRequest): Promise<string>;
}
export interface AssistantOptions {
  providers: ChatProvider[];
  timeoutMs: number;
  attemptTimeoutMs: number;
  maxOutputTokens: number;
  temperature: number;
}
export interface RoutedCompletion { text: string; provider: ProviderId; model: string; attempts: number; }

const failureForStatus = (status: number): ProviderFailure =>
  status === 402 || status === 429 ? 'QUOTA' : status === 401 || status === 403 ? 'AUTH' : status >= 500 ? 'UNAVAILABLE' : 'INVALID';

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const textOf = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const joined = (values: unknown[]): string => values.map(textOf).filter(Boolean).join('\n').trim();

async function postJson(provider: ProviderId, fetcher: FetchLike, url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal, redirect: 'error' });
  } catch {
    throw new ProviderError(provider, signal.aborted ? 'TIMEOUT' : 'UNAVAILABLE');
  }
  if (!response.ok) throw new ProviderError(provider, failureForStatus(response.status));
  try { return await response.json(); }
  catch { throw new ProviderError(provider, 'INVALID'); }
}

export interface WorkersAiOptions { accountId: string; token: string; model?: string; fetch?: FetchLike; }
export function workersAiProvider(options: WorkersAiOptions): ChatProvider {
  const model = options.model || '@cf/meta/llama-3.1-8b-instruct';
  const fetcher = options.fetch ?? fetch;
  return {
    id: 'workers-ai', model,
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
      return text;
    },
  };
}

export interface GeminiOptions { apiKey: string; model?: string; fetch?: FetchLike; }
export function geminiProvider(options: GeminiOptions): ChatProvider {
  const model = options.model || 'gemini-2.5-flash';
  const fetcher = options.fetch ?? fetch;
  return {
    id: 'gemini', model,
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
      return text;
    },
  };
}

const openAiCompatible = (provider: 'groq' | 'openrouter', url: string, options: { apiKey: string; model: string; headers?: Record<string, string>; fetch?: FetchLike }): ChatProvider => {
  const fetcher = options.fetch ?? fetch;
  return {
    id: provider, model: options.model,
    async complete(request) {
      const data = await postJson(provider, fetcher, url, { Authorization: `Bearer ${options.apiKey}`, ...options.headers },
        { model: options.model, messages: [{ role: 'system', content: request.system }, ...request.messages], max_tokens: request.maxTokens, temperature: request.temperature },
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
      return text;
    },
  };
};

export interface GroqOptions { apiKey: string; model?: string; fetch?: FetchLike; }
export function groqProvider(options: GroqOptions): ChatProvider {
  return openAiCompatible('groq', 'https://api.groq.com/openai/v1/chat/completions',
    { apiKey: options.apiKey, model: options.model || 'llama-3.3-70b-versatile', fetch: options.fetch });
}

export interface OpenRouterOptions { apiKey: string; model?: string; siteUrl?: string; fetch?: FetchLike; }
export function openRouterProvider(options: OpenRouterOptions): ChatProvider {
  // Header values must be Latin-1, so the fixed title stays ASCII.
  const headers: Record<string, string> = { 'X-Title': 'Nha Nay Hoi Bao - Board game assistant' };
  if (options.siteUrl) headers['HTTP-Referer'] = options.siteUrl;
  return openAiCompatible('openrouter', 'https://openrouter.ai/api/v1/chat/completions',
    { apiKey: options.apiKey, model: options.model || 'meta-llama/llama-3.3-70b-instruct:free', headers, fetch: options.fetch });
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
  private readonly blockedUntil = new Map<ProviderId, number>();

  constructor(options: RouterOptions) {
    this.providers = options.providers;
    this.timeoutMs = options.timeoutMs;
    this.attemptTimeoutMs = options.attemptTimeoutMs ?? 7_000;
    this.cooldownMs = { ...DEFAULT_COOLDOWNS, ...options.cooldownMs };
    this.now = options.now ?? Date.now;
  }

  async complete(input: Omit<CompletionRequest, 'signal'>): Promise<RoutedCompletion> {
    const deadline = this.now() + this.timeoutMs;
    const failures: ProviderFailure[] = [];
    let attempts = 0;
    for (const provider of this.providers) {
      if ((this.blockedUntil.get(provider.id) ?? 0) > this.now()) continue;
      const remaining = deadline - this.now();
      if (remaining < 500) break;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(remaining, this.attemptTimeoutMs));
      attempts++;
      try {
        const text = await provider.complete({ ...input, signal: controller.signal });
        if (!text.trim()) throw new ProviderError(provider.id, 'EMPTY');
        this.blockedUntil.delete(provider.id);
        return { text, provider: provider.id, model: provider.model, attempts };
      } catch (error) {
        const failure = error instanceof ProviderError ? error.failure : 'UNAVAILABLE';
        failures.push(failure);
        const cooldown = this.cooldownMs[failure];
        if (cooldown > 0) this.blockedUntil.set(provider.id, this.now() + cooldown);
      } finally {
        clearTimeout(timer);
      }
    }
    throw new NoProviderAvailable(failures);
  }
}

const DEFAULT_MODELS: Readonly<Record<ProviderId, string>> = {
  'workers-ai': '@cf/meta/llama-3.1-8b-instruct',
  gemini: 'gemini-2.5-flash',
  groq: 'llama-3.3-70b-versatile',
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
};
const DEFAULT_ORDER: readonly ProviderId[] = ['workers-ai', 'gemini', 'groq', 'openrouter'];
const isProviderId = (value: string): value is ProviderId => (DEFAULT_ORDER as readonly string[]).includes(value);

const bounded = (value: string | undefined, fallback: number, min: number, max: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};
const clean = (value: string | undefined): string => (value ?? '').trim();

/** Builds the provider order from env; missing credentials simply remove that provider. */
export function assistantFromEnv(env: Record<string, string | undefined>, fetchImpl: FetchLike = fetch): AssistantOptions {
  const requested = (clean(env.AI_PROVIDER_ORDER) || DEFAULT_ORDER.join(',')).split(',');
  const order: ProviderId[] = [];
  for (const entry of requested) {
    const id = entry.trim().toLowerCase();
    if (isProviderId(id) && !order.includes(id)) order.push(id);
  }
  const siteUrl = clean(env.OPENROUTER_SITE_URL) || clean(env.PUBLIC_ORIGIN) || 'https://exe-webapp.pages.dev';
  const build: Record<ProviderId, () => ChatProvider | null> = {
    'workers-ai': () => {
      const accountId = clean(env.CLOUDFLARE_AI_ACCOUNT_ID), token = clean(env.CLOUDFLARE_AI_API_TOKEN);
      return accountId && token ? workersAiProvider({ accountId, token, model: clean(env.CLOUDFLARE_AI_MODEL) || DEFAULT_MODELS['workers-ai'], fetch: fetchImpl }) : null;
    },
    gemini: () => {
      const apiKey = clean(env.GEMINI_API_KEY);
      return apiKey ? geminiProvider({ apiKey, model: clean(env.GEMINI_MODEL) || DEFAULT_MODELS.gemini, fetch: fetchImpl }) : null;
    },
    groq: () => {
      const apiKey = clean(env.GROQ_API_KEY);
      return apiKey ? groqProvider({ apiKey, model: clean(env.GROQ_MODEL) || DEFAULT_MODELS.groq, fetch: fetchImpl }) : null;
    },
    openrouter: () => {
      const apiKey = clean(env.OPENROUTER_API_KEY);
      return apiKey ? openRouterProvider({ apiKey, model: clean(env.OPENROUTER_MODEL) || DEFAULT_MODELS.openrouter, siteUrl, fetch: fetchImpl }) : null;
    },
  };
  const providers: ChatProvider[] = [];
  for (const id of order) {
    const provider = build[id]();
    if (provider) providers.push(provider);
  }
  const timeoutMs = Math.round(bounded(env.AI_TIMEOUT_MS, 30_000, 5_000, 55_000));
  const attemptTimeoutMs = Math.round(bounded(env.AI_ATTEMPT_TIMEOUT_MS, 7_000, 2_000, timeoutMs));
  return {
    providers,
    timeoutMs,
    attemptTimeoutMs,
    maxOutputTokens: Math.round(bounded(env.AI_MAX_OUTPUT_TOKENS, 700, 128, 2_048)),
    temperature: bounded(env.AI_TEMPERATURE, 0.3, 0, 1),
  };
}
