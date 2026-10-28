import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assistantFromEnv, geminiProvider, groqProvider, NoProviderAvailable, openRouterProvider,
  ProviderError, ProviderRouter, workersAiProvider,
  type ChatProvider, type CompletionRequest, type CompletionResult, type FetchLike,
} from '../src/assistant-providers.ts';
import {
  chunkMarkdown, retrieve, tokenize, type KnowledgeDocument, type PublishedKnowledge,
} from '../src/assistant-knowledge.ts';
import { activeProviders } from '../src/assistant-settings.ts';

const request = (overrides: Partial<CompletionRequest> = {}): CompletionRequest => ({
  system: 'SYSTEM',
  messages: [{ role: 'user', content: 'Xin chào' }],
  maxTokens: 123,
  temperature: 0.4,
  signal: new AbortController().signal,
  ...overrides,
});
const asResult = (value: CompletionResult | string): CompletionResult =>
  typeof value === 'string' ? { text: value, tokensIn: 0, tokensOut: 0 } : value;
type ChatReply = (request: CompletionRequest) => Promise<CompletionResult | string>;
const chatProvider = (id: ChatProvider['id'], complete: ChatReply, model = 'test-model', slot = `${id}#1`): ChatProvider => ({
  id, model, slot,
  complete: async request => asResult(await complete(request)),
  withModel: next => chatProvider(id, complete, next, slot),
});
const jsonBody = (init?: RequestInit): any => JSON.parse(String(init?.body));
const header = (init: RequestInit | undefined, name: string): string | null => (init?.headers as Record<string, string>)[name] ?? null;
const isFailure = (failure: string) => (error: unknown) => error instanceof ProviderError && error.failure === failure;

test('Workers AI adapter maps the REST contract and extracts result.response', async () => {
  let seen: { url: string; init: RequestInit } | undefined;
  const adapter = workersAiProvider({
    accountId: 'acc/1', token: 'cf-token', model: '@cf/meta/test',
    fetch: async (url, init) => { seen = { url, init }; return Response.json({ success: true, result: { response: 'Xin chào từ Workers AI' }, usage: { prompt_tokens: 12, completion_tokens: 5 } }); },
  });
  assert.deepEqual(await adapter.complete(request()), { text: 'Xin chào từ Workers AI', tokensIn: 12, tokensOut: 5 });
  assert.equal(seen!.url, 'https://api.cloudflare.com/client/v4/accounts/acc%2F1/ai/run/@cf/meta/test');
  assert.equal(header(seen!.init, 'Authorization'), 'Bearer cf-token');
  const body = jsonBody(seen!.init);
  assert.deepEqual(body.messages[0], { role: 'system', content: 'SYSTEM' });
  assert.equal(body.messages[1].content, 'Xin chào');
  assert.equal(body.max_tokens, 123);
  assert.equal(body.temperature, 0.4);
});

test('Gemini adapter sends systemInstruction, maps assistant to model and joins parts', async () => {
  let seen: { url: string; init: RequestInit } | undefined;
  const adapter = geminiProvider({
    apiKey: 'gemini-key', model: 'gemini-test',
    fetch: async (url, init) => { seen = { url, init }; return Response.json({ candidates: [{ content: { parts: [{ text: 'Dòng 1' }, { text: 'Dòng 2' }] } }], usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 9 } }); },
  });
  const gemini = await adapter.complete(request({ messages: [{ role: 'user', content: 'A' }, { role: 'assistant', content: 'B' }, { role: 'user', content: 'C' }] }));
  assert.deepEqual(gemini, { text: 'Dòng 1\nDòng 2', tokensIn: 40, tokensOut: 9 });
  assert.equal(seen!.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
  assert.equal(header(seen!.init, 'x-goog-api-key'), 'gemini-key');
  const body = jsonBody(seen!.init);
  assert.deepEqual(body.systemInstruction, { parts: [{ text: 'SYSTEM' }] });
  assert.deepEqual(body.contents.map((entry: any) => entry.role), ['user', 'model', 'user']);
  assert.equal(body.generationConfig.maxOutputTokens, 123);
  const blocked = geminiProvider({ apiKey: 'k', fetch: async () => Response.json({ promptFeedback: { blockReason: 'SAFETY' } }) });
  await assert.rejects(blocked.complete(request()), isFailure('EMPTY'));
});

test('Groq and OpenRouter adapters use OpenAI-compatible bodies and normalize failures', async () => {
  let seen: { url: string; init: RequestInit } | undefined;
  const groq = groqProvider({ apiKey: 'groq-key', model: 'groq-test', fetch: async (url, init) => { seen = { url, init }; return Response.json({ choices: [{ message: { content: 'Groq trả lời' } }], usage: { prompt_tokens: 7, completion_tokens: 3 } }); } });
  assert.deepEqual(await groq.complete(request()), { text: 'Groq trả lời', tokensIn: 7, tokensOut: 3 });
  assert.equal(seen!.url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(header(seen!.init, 'Authorization'), 'Bearer groq-key');
  assert.deepEqual(jsonBody(seen!.init).messages[0], { role: 'system', content: 'SYSTEM' });
  const limited = groqProvider({ apiKey: 'k', fetch: async () => new Response(null, { status: 429 }) });
  await assert.rejects(limited.complete(request()), isFailure('QUOTA'));
  const unauthorized = groqProvider({ apiKey: 'k', fetch: async () => new Response(null, { status: 401 }) });
  await assert.rejects(unauthorized.complete(request()), isFailure('AUTH'));

  const openrouter = openRouterProvider({
    apiKey: 'or-key', model: 'or-test', siteUrl: 'https://game.example.test',
    fetch: async (url, init) => { seen = { url, init }; return Response.json({ choices: [{ message: { content: 'OpenRouter trả lời' } }] }); },
  });
  // Providers that omit usage report zero tokens instead of a guess.
  assert.deepEqual(await openrouter.complete(request()), { text: 'OpenRouter trả lời', tokensIn: 0, tokensOut: 0 });
  assert.equal(seen!.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(header(seen!.init, 'HTTP-Referer'), 'https://game.example.test');
  assert.match(header(seen!.init, 'X-Title') ?? '', /Nha Nay Hoi Bao/);
  const quota = openRouterProvider({ apiKey: 'k', fetch: async () => Response.json({ error: { code: 402 } }) });
  await assert.rejects(quota.complete(request()), isFailure('QUOTA'));
});

test('router fails over and skips a cooling provider until its cooldown expires', async () => {
  let clock = 1_000, primary = 0, backup = 0;
  const router = new ProviderRouter({
    providers: [
      chatProvider('workers-ai', async () => { primary++; throw new ProviderError('workers-ai', 'QUOTA'); }),
      chatProvider('groq', async () => { backup++; return { text: 'backup', tokensIn: 21, tokensOut: 8 }; }),
    ],
    timeoutMs: 1_000, attemptTimeoutMs: 100, cooldownMs: { QUOTA: 500 }, now: () => clock,
  });
  const input = { system: 's', messages: [], maxTokens: 10, temperature: 0 };
  assert.deepEqual(await router.complete(input), { text: 'backup', provider: 'groq', slot: 'groq#1', model: 'test-model', attempts: 2, tokensIn: 21, tokensOut: 8 });
  assert.equal(primary, 1); assert.equal(backup, 1);
  clock += 100;
  assert.equal((await router.complete(input)).provider, 'groq');
  assert.equal(primary, 1); assert.equal(backup, 2);
  clock += 500;
  assert.equal((await router.complete(input)).provider, 'groq');
  assert.equal(primary, 2);
});

test('router reports normalized failures and aborts a hanging provider', async () => {
  const failed = new ProviderRouter({
    providers: [
      chatProvider('workers-ai', async () => { throw new ProviderError('workers-ai', 'AUTH'); }),
      chatProvider('openrouter', async () => { throw new ProviderError('openrouter', 'EMPTY'); }),
    ], timeoutMs: 1_000, attemptTimeoutMs: 100, cooldownMs: { AUTH: 0, EMPTY: 0 },
  });
  const input = { system: 's', messages: [], maxTokens: 10, temperature: 0 };
  await assert.rejects(failed.complete(input), (error: unknown) => error instanceof NoProviderAvailable && error.failures.join(',') === 'AUTH,EMPTY');

  const hanging = chatProvider('gemini', request => new Promise<string>((_, reject) => {
    request.signal.addEventListener('abort', () => reject(new ProviderError('gemini', 'TIMEOUT')));
  }));
  const router = new ProviderRouter({ providers: [hanging], timeoutMs: 1_000, attemptTimeoutMs: 20 });
  await assert.rejects(router.complete(input), (error: unknown) => error instanceof NoProviderAvailable && error.failures[0] === 'TIMEOUT');
});

test('router cools down only the failing key slot and keeps sibling keys usable', async () => {
  let clock = 1_000;
  const calls: string[] = [];
  const primary = chatProvider('gemini', async () => { calls.push('gemini#1'); throw new ProviderError('gemini', 'QUOTA'); }, 'gemini-test', 'gemini#1');
  const sibling = chatProvider('gemini', async () => { calls.push('gemini#2'); return 'sibling'; }, 'gemini-test', 'gemini#2');
  const router = new ProviderRouter({ providers: [primary, sibling], timeoutMs: 1_000, attemptTimeoutMs: 100, cooldownMs: { QUOTA: 500 }, now: () => clock });
  const input = { system: 's', messages: [], maxTokens: 10, temperature: 0 };
  const first = await router.complete(input);
  assert.equal(first.slot, 'gemini#2');
  assert.equal(first.attempts, 2);
  clock += 100;
  const second = await router.complete(input);
  assert.equal(second.slot, 'gemini#2');
  assert.equal(second.attempts, 1);
  assert.deepEqual(calls, ['gemini#1', 'gemini#2', 'gemini#2']);
  clock += 500;
  assert.equal((await router.complete(input)).attempts, 2);
  assert.deepEqual(calls, ['gemini#1', 'gemini#2', 'gemini#2', 'gemini#1', 'gemini#2']);
});

test('admin plan applies provider order, model override and disabled slots', () => {
  const providers = [
    chatProvider('gemini', async () => 'g1', 'gemini-test', 'gemini#1'),
    chatProvider('gemini', async () => 'g2', 'gemini-test', 'gemini#2'),
    chatProvider('groq', async () => 'q', 'groq-test', 'groq#1'),
  ];
  const active = activeProviders(providers, {
    order: ['groq', 'gemini'], models: { gemini: 'gemini-custom' }, disabledSlots: ['gemini#2'], tokenBudgets: {}, version: 1, updatedAt: null,
  });
  assert.deepEqual(active.map(provider => provider.slot), ['groq#1', 'gemini#1']);
  assert.equal(active[1].model, 'gemini-custom');
  assert.equal(active[0].model, 'groq-test');
});

test('assistantFromEnv keeps configured order, skips missing credentials and clamps settings', () => {
  const fetchStub: FetchLike = async () => Response.json({});
  const options = assistantFromEnv({
    AI_PROVIDER_ORDER: 'groq,gemini,groq,unknown', GEMINI_API_KEY: 'gemini', GROQ_API_KEY: 'groq',
    AI_TIMEOUT_MS: '1', AI_ATTEMPT_TIMEOUT_MS: '999999', AI_MAX_OUTPUT_TOKENS: '99999', AI_TEMPERATURE: '2',
  }, fetchStub);
  assert.deepEqual(options.providers.map(provider => provider.id), ['groq', 'gemini']);
  assert.deepEqual(options.providers.map(provider => provider.slot), ['groq#1', 'gemini#1']);
  assert.equal(options.timeoutMs, 5_000);
  assert.equal(options.attemptTimeoutMs, 5_000);
  assert.equal(options.maxOutputTokens, 2_048);
  assert.equal(options.temperature, 1);
  assert.deepEqual(assistantFromEnv({}, fetchStub).providers, []);
});

test('assistantFromEnv numbers every credential slot without duplicating keys', () => {
  const fetchStub: FetchLike = async () => Response.json({});
  const options = assistantFromEnv({
    AI_PROVIDER_ORDER: 'workers-ai,gemini,groq,openrouter',
    CLOUDFLARE_AI_ACCOUNTS: 'acc1:token1\nacc2:token2',
    CLOUDFLARE_AI_ACCOUNT_ID: 'acc1', CLOUDFLARE_AI_API_TOKEN: 'token1',
    GEMINI_API_KEYS: 'g1, g1\n g2', GEMINI_API_KEY: 'g2',
    GROQ_API_KEYS: 'q1;q2',
    OPENROUTER_API_KEY: 'or1',
  }, fetchStub);
  assert.deepEqual(options.providers.map(provider => provider.slot), [
    'workers-ai#1', 'workers-ai#2', 'gemini#1', 'gemini#2', 'groq#1', 'groq#2', 'openrouter#1',
  ]);
  assert.deepEqual(options.providers.map(provider => provider.id), [
    'workers-ai', 'workers-ai', 'gemini', 'gemini', 'groq', 'groq', 'openrouter',
  ]);
});

test('Vietnamese tokens keep card words while dropping filler, and long wiki pages chunk', () => {
  assert.deepEqual(tokenize('Như thế nào là thẻ?'), ['the']);
  assert.deepEqual(tokenize('Cách chơi boardgame'), ['cach', 'choi', 'board', 'game']);
  const paragraph = 'Nội dung luật chơi. '.repeat(80).trim();
  const chunks = chunkMarkdown([paragraph, paragraph, paragraph].join('\n\n'), 500);
  assert.ok(chunks.length >= 9);
  assert.ok(chunks.every(chunk => chunk.length <= 500));
  assert.match(chunks.join('\n'), /Nội dung luật chơi/);
});

const knowledgeEntry = (id: string, kind: KnowledgeDocument['kind'], title: string, text: string, url: string): KnowledgeDocument => ({
  id, kind, title, text, url,
  normalized: `${title} ${text}`.toLowerCase(),
  tokens: new Map(tokenize(`${title} ${text}`).map(token => [token, 1])),
  titleTokens: new Set(tokenize(title)),
});

test('citations keep [n] aligned with sources when a page is split into several chunks', () => {
  const documents = [
    knowledgeEntry('luat#0', 'wiki', 'Quỹ nhà chung (phần 1)', 'Quỹ chung thu tiền góp mỗi tháng.', '/wiki/luat'),
    knowledgeEntry('luat#1', 'wiki', 'Quỹ nhà chung (phần 2)', 'Quỹ chung trả hóa đơn và mất Tim khi thiếu.', '/wiki/luat'),
    knowledgeEntry('C01', 'card', 'Thẻ Chia hóa đơn', 'Hiệu ứng quỹ chung.', '/thu-vien/chia-hoa-don'),
  ];
  const frequency = new Map<string, number>();
  for (const doc of documents) for (const token of doc.tokens.keys()) frequency.set(token, (frequency.get(token) ?? 0) + 1);
  const knowledge: PublishedKnowledge = { releaseId: 'r1', versionLabel: '1.0', releaseTitle: 'Bản 1.0', documents, frequency };
  const result = retrieve(knowledge, 'quỹ chung trả hóa đơn thế nào');
  assert.equal(result.sources.length, result.documents.length);
  const blocks = result.context.split('\n\n');
  result.documents.forEach((doc, index) => {
    assert.equal(result.sources[index].url, doc.url);
    assert.ok(blocks[index].startsWith(`[${index + 1}] ${doc.title}`));
  });
});
