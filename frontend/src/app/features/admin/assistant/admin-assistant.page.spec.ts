import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminAssistantPage } from './admin-assistant.page';
import {
  AdminAssistantService,
  AssistantKey,
  AssistantKeysResponse,
  AssistantPromptRequest,
  AssistantPromptResponse,
  AssistantPromptState,
  AssistantSettingsResponse,
  AssistantUsage,
  AssistantKeyTestResult,
} from '../../../core/admin/admin-assistant.service';

const geminiModels = [
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', recommended: true, note: 'Miễn phí, nhanh' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', note: 'Miễn phí, mạnh hơn' },
];
const groqModels = [
  { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', recommended: true, note: 'Miễn phí, 131K ngữ cảnh' },
  { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B', note: 'Miễn phí, nhẹ' },
];

const settingsResponse = (canManage = true, version = 3): AssistantSettingsResponse => ({
  settings: {
    order: ['gemini', 'groq'],
    models: { gemini: 'gemini-3.5-flash-lite', groq: 'openai/gpt-oss-120b' },
    disabledSlots: ['groq#2'],
    tokenBudgets: { gemini: 100_000, groq: 3_000 },
    keyBudgets: {},
    version,
    updatedAt: '2026-10-28T10:00:00.000Z',
  },
  keyBudgetDefault: 200_000,
  providers: [
    { id: 'gemini', label: 'Google Gemini', defaultModel: 'gemini-3.5-flash-lite', models: geminiModels, slots: [{ slot: 'gemini#1', disabled: false }, { slot: 'gemini#2', disabled: false }] },
    { id: 'groq', label: 'Groq', defaultModel: 'openai/gpt-oss-120b', models: groqModels, slots: [{ slot: 'groq#1', disabled: false }, { slot: 'groq#2', disabled: true }] },
  ],
  canManage,
  canReorder: canManage,
  canEditModels: canManage,
  canManageSlots: canManage,
  canEditBudgets: canManage,
  canReadUsage: canManage,
});

/** One right at a time, so a test can prove the page gates each control on its own permission. */
const settingsWithRights = (rights: Partial<Pick<AssistantSettingsResponse, 'canReorder' | 'canEditModels' | 'canManageSlots' | 'canEditBudgets' | 'canReadUsage'>>): AssistantSettingsResponse => {
  const response = settingsResponse(false);
  Object.assign(response, rights);
  response.canManage = Object.values(rights).some(Boolean);
  return response;
};

const dbSlot = 'db:11111111-1111-4111-8111-111111111111';

// A stored admin key reaches the router as a db:<credential id> slot, which is what the per-key cards read.
const settingsWithStoredKey = (canManage = true): AssistantSettingsResponse => {
  const response = settingsResponse(canManage);
  response.settings.disabledSlots = [];
  response.settings.tokenBudgets = { gemini: 100_000, groq: 20_000 };
  response.settings.keyBudgets = { [activeKey.id]: 1_000 };
  response.providers[1].slots = [{ slot: 'groq#1', disabled: false }, { slot: dbSlot, disabled: false }];
  return response;
};

const usage: AssistantUsage = {
  days: 7,
  since: '2026-10-22',
  totals: { requests: 10, cacheHits: 4, failures: 1, answered: 6, avgLatencyMs: 820, tokensIn: 8_000, tokensOut: 2_000 },
  providers: [{ provider: 'groq', requests: 6, failures: 1, avgLatencyMs: 900, tokensIn: 2_000, tokensOut: 500 }],
  slots: [{ slot: 'groq#1', provider: 'groq', model: 'openai/gpt-oss-120b', requests: 6, failures: 1, avgLatencyMs: 900, tokensIn: 2_000, tokensOut: 500 }],
  keys: [{ slot: 'groq#1', provider: 'groq', requests: 6, failures: 1, avgLatencyMs: 900, tokensIn: 2_000, tokensOut: 500 }],
  daily: [{ day: '2026-10-28', requests: 10, cacheHits: 4, failures: 1, tokensIn: 8_000, tokensOut: 2_000 }],
  today: {
    day: '2026-10-28',
    providers: [
      { provider: 'gemini', tokensIn: 6_000, tokensOut: 1_500 },
      { provider: 'groq', tokensIn: 2_000, tokensOut: 500 },
    ],
    slots: [{ slot: 'groq#1', provider: 'groq', requests: 6, failures: 1, tokensIn: 2_000, tokensOut: 500 }],
  },
};

const usageWithStoredKey: AssistantUsage = {
  ...usage,
  keys: [
    ...usage.keys,
    { slot: dbSlot, provider: 'groq', requests: 3, failures: 1, avgLatencyMs: 640, tokensIn: 700, tokensOut: 200 },
  ],
  today: {
    ...usage.today,
    slots: [
      ...usage.today.slots,
      { slot: dbSlot, provider: 'groq', requests: 3, failures: 1, tokensIn: 700, tokensOut: 200 },
    ],
  },
};

const activeKey: AssistantKey = {
  id: '11111111-1111-4111-8111-111111111111',
  provider: 'groq',
  providerLabel: 'Groq',
  label: 'Groq chính',
  hint: '••••1234',
  accountHint: null,
  status: 'ACTIVE',
  ownerId: 'owner-1',
  ownerEmail: 'owner@example.test',
  ownerDisplayName: 'Chủ sở hữu',
  isMine: true,
  canReveal: true,
  canTest: true,
  canRevoke: true,
  canManageStatus: true,
  createdAt: '2026-10-28T09:00:00.000Z',
  updatedAt: '2026-10-28T09:00:00.000Z',
  approvedAt: '2026-10-28T09:00:00.000Z',
  lastTest: null,
};

const geminiKey: AssistantKey = {
  ...activeKey,
  id: '22222222-2222-4222-8222-222222222222',
  provider: 'gemini',
  providerLabel: 'Google Gemini',
  label: 'Gemini chính',
  hint: '••••5678',
};

const keysResponse = (
  canManage = true,
  storageAvailable = true,
  items: AssistantKey[] = [activeKey],
  canCreate = true,
): AssistantKeysResponse => ({
  items,
  canManage,
  canCreate,
  storageAvailable,
  limits: { perOwner: 10, active: 32 },
});

const keyTestResult = (overrides: Partial<AssistantKeyTestResult> = {}): AssistantKeyTestResult => ({
  status: 'OK',
  code: null,
  provider: 'groq',
  model: 'openai/gpt-oss-120b',
  latencyMs: 412,
  testedAt: '2026-10-28T10:05:00.000Z',
  ...overrides,
});

const promptState = (overrides: Partial<AssistantPromptState> = {}): AssistantPromptState => ({
  template: 'Bạn là trợ lý EXE. Chỉ trả lời theo tài liệu đã phát hành.\n{TAI_LIEU}',
  source: 'CUSTOM',
  version: 2,
  updatedAt: '2026-10-28T10:00:00.000Z',
  ...overrides,
});

const promptResponse = (overrides: Partial<AssistantPromptResponse> = {}): AssistantPromptResponse => ({
  prompt: promptState(),
  defaultTemplate: 'Mẫu mặc định ship trong code, bắt buộc chèn khối tài liệu.\n{TAI_LIEU}',
  tokens: [
    { token: '{TAI_LIEU}', required: true, label: 'Khối tài liệu retrieved từ bản phát hành đang công khai' },
    { token: '{PHIEN_BAN}', required: false, label: 'Nhãn phiên bản bản phát hành, ví dụ 1.0' },
  ],
  maxChars: 6_000,
  canUpdate: true,
  canRequest: true,
  pending: [],
  myRequests: [],
  ...overrides,
});

const promptRequest = (overrides: Partial<AssistantPromptRequest> = {}): AssistantPromptRequest => ({
  id: '33333333-3333-4333-8333-333333333333',
  template: 'Bản đề xuất của đồng quản trị, vẫn giữ khối tài liệu.\n{TAI_LIEU}',
  note: 'Muốn trợ lý xưng hô thân mật hơn',
  status: 'PENDING',
  requestedBy: 'co-admin-1',
  requesterEmail: 'coadmin@example.test',
  requesterName: 'Đồng quản trị',
  reviewedBy: null,
  reviewNote: '',
  baseVersion: 2,
  createdAt: '2026-10-28T10:10:00.000Z',
  reviewedAt: null,
  ...overrides,
});

describe('AdminAssistantPage', () => {
  let api: {
    getSettings: ReturnType<typeof vi.fn>;
    saveSettings: ReturnType<typeof vi.fn>;
    getUsage: ReturnType<typeof vi.fn>;
    getKeys: ReturnType<typeof vi.fn>;
    createKey: ReturnType<typeof vi.fn>;
    revealKey: ReturnType<typeof vi.fn>;
    setKeyStatus: ReturnType<typeof vi.fn>;
    revokeKey: ReturnType<typeof vi.fn>;
    testKey: ReturnType<typeof vi.fn>;
    testKeys: ReturnType<typeof vi.fn>;
    getPrompt: ReturnType<typeof vi.fn>;
    savePrompt: ReturnType<typeof vi.fn>;
    requestPrompt: ReturnType<typeof vi.fn>;
    approvePromptRequest: ReturnType<typeof vi.fn>;
    rejectPromptRequest: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = {
      getSettings: vi.fn(() => of(settingsResponse())),
      saveSettings: vi.fn(() => of(settingsResponse(true, 4))),
      getUsage: vi.fn(() => of(usage)),
      getKeys: vi.fn(() => of(keysResponse())),
      createKey: vi.fn(() => of({ item: { ...activeKey, id: 'new-key', label: 'Key mới' } })),
      revealKey: vi.fn(() => of({ apiKey: 'db-key-1234', accountId: null })),
      setKeyStatus: vi.fn(() => of({ item: { ...activeKey, status: 'DISABLED' }, changed: true })),
      revokeKey: vi.fn(() => of({ removed: true })),
      testKey: vi.fn(() => of(keyTestResult())),
      testKeys: vi.fn(() => of({ id: activeKey.id, result: keyTestResult(), error: null })),
      getPrompt: vi.fn(() => of(promptResponse())),
      savePrompt: vi.fn(() => of({ ...promptResponse(), prompt: promptState({ version: 3 }), changed: true })),
      requestPrompt: vi.fn(() => of({ ...promptResponse(), changed: true, item: promptRequest() })),
      approvePromptRequest: vi.fn(() => of({
        ...promptResponse(),
        prompt: promptState({ version: 3, template: promptRequest().template }),
        changed: true,
        request: promptRequest({ status: 'APPROVED', reviewedBy: 'owner-1', reviewedAt: '2026-10-28T10:20:00.000Z' }),
      })),
      rejectPromptRequest: vi.fn(() => of({
        ...promptResponse(),
        changed: false,
        request: promptRequest({ status: 'REJECTED', reviewedBy: 'owner-1', reviewNote: 'Câu chữ quá suồng sã', reviewedAt: '2026-10-28T10:20:00.000Z' }),
      })),
    };
    TestBed.configureTestingModule({
      imports: [AdminAssistantPage],
      providers: [provideRouter([]), { provide: AdminAssistantService, useValue: api }],
    });
  });

  const setup = () => {
    const fixture = TestBed.createComponent(AdminAssistantPage);
    fixture.detectChanges();
    return { fixture, page: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  };

  const event = (value: string) => ({ target: { value } }) as unknown as Event;

  it('shows provider order, models, key state and usage totals', () => {
    const { el } = setup();
    expect(api.getSettings).toHaveBeenCalledTimes(1);
    expect(api.getUsage).toHaveBeenCalledWith(7);
    expect(api.getKeys).toHaveBeenCalledTimes(1);
    expect(el.querySelectorAll('.provider')).toHaveLength(2);
    expect(el.textContent).toContain('Google Gemini');
    expect([...el.querySelectorAll<HTMLSelectElement>('.model-field select')].map(select => select.value))
      .toEqual(['gemini-3.5-flash-lite', 'openai/gpt-oss-120b']);
    expect([...el.querySelectorAll<HTMLInputElement>('.budget-field input')].map(input => input.value))
      .toEqual(['100000', '3000']);
    expect(el.querySelectorAll('.budget')).toHaveLength(2);
    expect(el.textContent).toContain('8.000');
    expect(el.textContent).toContain('2.000');
    expect(el.querySelectorAll('.slot')).toHaveLength(4);
    expect(el.textContent).toContain('40%');
    expect(el.textContent).toContain('820');
    expect(el.textContent).toContain('groq#1');
  });

  it('replaces the model textbox with a catalog dropdown and marks the recommendation', () => {
    const { el } = setup();
    expect(el.querySelector('.model-field input')).toBeNull();
    const selects = [...el.querySelectorAll<HTMLSelectElement>('.model-field select')];
    expect(selects).toHaveLength(2);
    const geminiOptions = [...selects[0].options];
    expect(geminiOptions.map(option => option.value)).toEqual(['gemini-3.5-flash-lite', 'gemini-3.8-flash']);
    expect(geminiOptions[0].textContent).toContain('Khuyến nghị');
    expect(geminiOptions[1].textContent).not.toContain('Khuyến nghị');
    expect(el.querySelector('.model-field .field-note')?.textContent).toContain('Miễn phí, nhanh');
  });

  it('keeps a legacy override outside the catalog selectable', () => {
    const response = settingsResponse();
    response.settings.models['groq'] = 'legacy/custom-model';
    api.getSettings.mockReturnValue(of(response));
    const { el } = setup();
    const select = el.querySelectorAll<HTMLSelectElement>('.model-field select')[1];
    expect(select.value).toBe('legacy/custom-model');
    expect([...select.options].find(option => option.value === 'legacy/custom-model')?.textContent)
      .toContain('ngoài danh mục');
  });

  it('switches between the provider, key, usage and prompt tabs', () => {
    const { fixture, page, el } = setup();
    const hidden = () => [...el.querySelectorAll<HTMLElement>('.tab-panel')].map(panel => panel.hidden);
    expect(page.view()).toBe('providers');
    expect(hidden()).toEqual([false, true, true, true]);
    expect(el.querySelector('#tab-providers')?.getAttribute('aria-selected')).toBe('true');

    page.setView('keys');
    fixture.detectChanges();
    expect(hidden()).toEqual([true, false, true, true]);
    expect(el.querySelector('#tab-keys')?.getAttribute('aria-selected')).toBe('true');
    expect(el.querySelector('#tab-providers')?.getAttribute('aria-selected')).toBe('false');

    page.setView('usage');
    fixture.detectChanges();
    expect(hidden()).toEqual([true, true, false, true]);

    page.setView('prompt');
    fixture.detectChanges();
    expect(hidden()).toEqual([true, true, true, false]);
    expect(el.querySelector('#tab-prompt')?.getAttribute('aria-selected')).toBe('true');
  });

  it('lists masked admin keys and never renders plaintext before reveal', () => {
    const { el } = setup();
    expect(el.textContent).toContain('Groq chính');
    expect(el.textContent).toContain('••••1234');
    expect(el.textContent).not.toContain('db-key-1234');
    expect(el.querySelectorAll('.key-form label')).toHaveLength(3);
    expect(el.querySelector('.status.active')?.textContent).toContain('Đang dùng');
    expect([...el.querySelectorAll('.actions button')].map(button => button.textContent?.trim()))
      .toEqual(['Kiểm tra', 'Tạm tắt', 'Thu hồi']);
  });

  it('sends order, model overrides, disabled slots, token budgets and the expected version', () => {
    const { page } = setup();
    page.move(0, 1);
    page.toggleSlot('gemini#1');
    page.setModel('groq', event('openai/gpt-oss-20b'));
    page.setBudget('groq', event('2000'));
    page.setBudget('gemini', event(''));
    page.save();

    expect(api.saveSettings).toHaveBeenCalledExactlyOnceWith({
      order: ['groq', 'gemini'],
      models: { gemini: 'gemini-3.5-flash-lite', groq: 'openai/gpt-oss-20b' },
      disabledSlots: ['groq#2', 'gemini#1'],
      tokenBudgets: { groq: 2000 },
      keyBudgets: {},
      expectedVersion: 3,
    });
    expect(page.notice()).toContain('Đã lưu cấu hình');
    expect(page.settings()?.settings.version).toBe(4);
  });

  it('renders today token progress bars and turns them warm near the budget', () => {
    const { el } = setup();
    const bars = [...el.querySelectorAll<HTMLElement>('.budget')];
    expect(bars).toHaveLength(2);
    expect(bars[0].textContent).toContain('7.500 / 100.000 token');
    expect(bars[0].querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('8');
    expect(bars[1].classList.contains('warn')).toBe(true);
    expect(bars[1].textContent).toContain('Còn 500 token');
  });

  it('marks an over-budget provider and refuses invalid budget input', () => {
    const { fixture, page, el } = setup();
    page.setBudget('groq', event('2000'));
    fixture.detectChanges();
    expect(el.querySelectorAll('.budget.over')).toHaveLength(1);
    expect(el.textContent).toContain('Đã vượt 500 token');

    page.setBudget('groq', event('1.5'));
    page.save();
    expect(api.saveSettings).not.toHaveBeenCalled();
    expect(page.error()).toContain('Ngân sách token của Groq');
  });

  it('shows an empty track instead of a full bar when no budget is set', () => {
    const { fixture, page, el } = setup();
    page.setBudget('gemini', event(''));
    fixture.detectChanges();
    const gemini = el.querySelector<HTMLElement>('.provider .budget');
    expect(gemini?.querySelector('.bar.unset')).not.toBeNull();
    expect(gemini?.querySelector('.bar.unset span')).toBeNull();
    expect(gemini?.querySelector('[role="progressbar"]')).toBeNull();
    expect(gemini?.textContent).toContain('Chưa đặt ngân sách');
    expect(el.querySelectorAll('.key-card .bar.unset')).toHaveLength(2);
    expect(el.textContent).toContain('Chưa có ngân sách nhà cung cấp');
  });

  it('gives a stored key its own quota card instead of borrowing the provider pool', () => {
    api.getSettings.mockReturnValue(of(settingsWithStoredKey()));
    api.getUsage.mockReturnValue(of(usageWithStoredKey));
    const { fixture, page, el } = setup();
    const cards = [...el.querySelectorAll<HTMLElement>('.key-card')];
    expect(cards).toHaveLength(4);
    expect(el.querySelectorAll('.key-budget-field')).toHaveLength(1);
    expect(el.querySelector<HTMLInputElement>('.key-budget-field input')?.value).toBe('1000');
    expect([...el.querySelectorAll('.key-card .status.system')].map(badge => badge.textContent?.trim()))
      .toEqual(['Key hệ thống', 'Key hệ thống', 'Key hệ thống']);

    const keyCard = cards.find(card => card.querySelector('.key-card-title')?.textContent === 'Groq chính')!;
    expect(keyCard.classList.contains('warn')).toBe(true);
    // The warn flag has to reach the .quota wrapper, which is what colours the bar fill.
    expect(keyCard.querySelector('.quota')?.classList.contains('warn')).toBe(true);
    expect(keyCard.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('90');
    expect(keyCard.textContent).toContain('900 / 1.000 token');
    expect(keyCard.textContent).toContain('Còn 100 token');
    expect(keyCard.textContent).toContain('3 câu hỏi');
    expect(keyCard.querySelector('.key-card-title')?.getAttribute('title')).toBe(dbSlot);

    // The provider row keeps its own, much larger budget, so a drained key cannot look like a drained provider.
    const groqRow = [...el.querySelectorAll<HTMLElement>('.provider')][1];
    expect(groqRow.classList.contains('warn')).toBe(false);
    expect(groqRow.querySelector('.budget')?.textContent).toContain('2.500 / 20.000 token');
    expect(page.keyBudgets()[activeKey.id]).toBe('1000');

    // A turned-off key stops being tried, so the row must not claim it is still in the pool.
    const label = () => groqRow.querySelector('.provider-title small')?.textContent?.replace(/\s+/g, ' ').trim();
    expect(label()).toContain('2/2 key đang thử');
    page.toggleSlot(dbSlot);
    fixture.detectChanges();
    expect(label()).toContain('1/2 key đang thử');
  });

  it('shows the default daily ceiling on a stored key until an admin saves its own budget', () => {
    const response = settingsWithStoredKey();
    response.settings.keyBudgets = {};
    api.getSettings.mockReturnValue(of(response));
    api.getUsage.mockReturnValue(of(usageWithStoredKey));
    const { el } = setup();
    const keyCard = [...el.querySelectorAll<HTMLElement>('.key-card')]
      .find(card => card.querySelector('.key-card-title')?.textContent === 'Groq chính')!;
    expect(keyCard.textContent).toContain('900 / 200.000 token');
    expect(keyCard.textContent).toContain('Mức mặc định 200.000 token/ngày');
    const input = keyCard.querySelector<HTMLInputElement>('.key-budget-field input');
    expect(input?.value).toBe('');
    expect(input?.getAttribute('placeholder')).toBe('Mặc định 200.000');
    expect(keyCard.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('0');
  });

  it('sends a per-key budget together with the provider budgets', () => {
    api.getSettings.mockReturnValue(of(settingsWithStoredKey()));
    api.getUsage.mockReturnValue(of(usageWithStoredKey));
    const { page } = setup();
    page.setKeyBudget(activeKey.id, event('2500'));
    page.save();

    expect(api.saveSettings).toHaveBeenCalledExactlyOnceWith({
      order: ['gemini', 'groq'],
      models: { gemini: 'gemini-3.5-flash-lite', groq: 'openai/gpt-oss-120b' },
      disabledSlots: [],
      tokenBudgets: { gemini: 100_000, groq: 20_000 },
      keyBudgets: { [activeKey.id]: 2500 },
      expectedVersion: 3,
    });
  });

  it('refuses a fractional per-key budget before saving', () => {
    api.getSettings.mockReturnValue(of(settingsWithStoredKey()));
    api.getUsage.mockReturnValue(of(usageWithStoredKey));
    const { page } = setup();
    page.setKeyBudget(activeKey.id, event('1.5'));
    page.save();
    expect(api.saveSettings).not.toHaveBeenCalled();
    expect(page.error()).toContain('key “Groq chính”');
  });

  it('hides the per-key budget field from delegated admins', () => {
    api.getSettings.mockReturnValue(of(settingsWithStoredKey(false)));
    api.getUsage.mockReturnValue(of(usageWithStoredKey));
    const { el } = setup();
    expect(el.querySelectorAll('.key-budget-field')).toHaveLength(0);
    // Probing a key stays allowed because the server grants it per key, not through the settings editor.
    expect([...el.querySelectorAll('.key-card .card-actions button')].map(button => button.textContent?.trim()))
      .toEqual(['Kiểm tra']);
    expect([...el.querySelectorAll<HTMLInputElement>('.key-card .slot input')].every(input => input.disabled)).toBe(true);
  });

  it('keeps an out-of-quota probe visible after the page reloads', () => {
    const exhausted: AssistantKey = {
      ...activeKey,
      lastTest: { status: 'FAILED', code: 'QUOTA', model: 'openai/gpt-oss-120b', latencyMs: 310, testedAt: '2026-10-28T10:00:00.000Z' },
    };
    api.getSettings.mockReturnValue(of(settingsWithStoredKey()));
    api.getUsage.mockReturnValue(of(usageWithStoredKey));
    api.getKeys.mockReturnValue(of(keysResponse(true, true, [exhausted])));
    const { page, el } = setup();
    const card = [...el.querySelectorAll<HTMLElement>('.key-card')]
      .find(node => node.querySelector('.key-card-title')?.textContent === 'Groq chính')!;
    const chip = card.querySelector('.test-result.failed')?.textContent;
    expect(chip).toContain('Lần kiểm tra trước');
    expect(chip).toContain('hết hạn mức');
    expect(chip).toContain('openai/gpt-oss-120b');
    expect(card.querySelector('.status.active')?.textContent).toContain('Đang dùng');
    expect(el.querySelector('.key-row .test-result.failed')?.textContent).toContain('hết hạn mức');
    expect(page.testChip(exhausted)?.live).toBe(false);
    expect(api.testKey).not.toHaveBeenCalled();
  });

  it('prefers a probe from this session over the stored outcome', () => {
    api.getSettings.mockReturnValue(of(settingsWithStoredKey()));
    api.getUsage.mockReturnValue(of(usageWithStoredKey));
    api.getKeys.mockReturnValue(of(keysResponse(true, true, [{
      ...activeKey,
      lastTest: { status: 'FAILED', code: 'QUOTA', model: null, latencyMs: 310, testedAt: '2026-10-28T10:00:00.000Z' },
    }])));
    const { fixture, page, el } = setup();
    page.testKey(page.keys()[0]);
    fixture.detectChanges();
    const chip = el.querySelector('.key-card .test-result')?.textContent;
    expect(chip).toContain('Vừa kiểm tra');
    expect(chip).toContain('OK');
    expect(chip).not.toContain('hết hạn mức');
    expect(el.querySelectorAll('.key-card .test-result')).toHaveLength(1);
  });

  it('reloads the latest settings after a version conflict and keeps the edit unsaved', () => {
    api.saveSettings.mockReturnValue(throwError(() => ({ status: 409 })));
    const { page } = setup();
    page.setDays(30);
    expect(api.getUsage).toHaveBeenLastCalledWith(30);
    page.save();
    expect(api.getSettings).toHaveBeenCalledTimes(2);
    expect(page.error()).toContain('vừa được người khác thay đổi');
    expect(page.notice()).toBe('');
  });

  it('keeps delegated admins read-only even through page methods', () => {
    api.getSettings.mockReturnValue(of(settingsResponse(false)));
    // Status changes need assistant:keys:manage; revoking one's own key only needs the revoke right.
    api.getKeys.mockReturnValue(of(keysResponse(false, true, [{ ...activeKey, canManageStatus: false }])));
    const { page, el } = setup();
    expect(el.querySelectorAll('.order-actions button')).toHaveLength(0);
    expect(el.querySelector('#panel-providers button.primary')).toBeNull();
    expect([...el.querySelectorAll('.actions button')].map(button => button.textContent?.trim()))
      .toEqual(['Kiểm tra', 'Thu hồi']);
    expect([...el.querySelectorAll<HTMLInputElement>('.slot input')].every(input => input.disabled)).toBe(true);
    expect([...el.querySelectorAll<HTMLInputElement>('.budget-field input')].every(input => input.disabled)).toBe(true);
    expect([...el.querySelectorAll<HTMLSelectElement>('.model-field select')].every(select => select.disabled)).toBe(true);
    page.move(0, 1);
    page.toggleSlot('gemini#1');
    page.save();
    expect(page.order()).toEqual(['gemini', 'groq']);
    expect(page.disabled()).toEqual(['groq#2']);
    expect(api.saveSettings).not.toHaveBeenCalled();
  });

  it('gates each provider control on its own right', () => {
    api.getSettings.mockReturnValue(of(settingsWithRights({ canEditModels: true })));
    const { page, el } = setup();
    expect(el.querySelectorAll('.order-actions button')).toHaveLength(0);
    expect(el.querySelector('#panel-providers button.primary')?.textContent).toContain('Lưu cấu hình');
    expect([...el.querySelectorAll<HTMLSelectElement>('.model-field select')].every(select => !select.disabled)).toBe(true);
    expect([...el.querySelectorAll<HTMLInputElement>('.budget-field input')].every(input => input.disabled)).toBe(true);
    expect([...el.querySelectorAll<HTMLInputElement>('.slot input')].every(input => input.disabled)).toBe(true);
    page.move(0, 1);
    page.toggleSlot('gemini#1');
    page.setBudget('gemini', event('9999'));
    page.setModel('groq', event('openai/gpt-oss-20b'));
    expect(page.order()).toEqual(['gemini', 'groq']);
    expect(page.disabled()).toEqual(['groq#2']);
    expect(page.budgets()['gemini']).toBe('100000');
    expect(page.models()['groq']).toBe('openai/gpt-oss-20b');

    page.save();
    expect(api.saveSettings).toHaveBeenCalledExactlyOnceWith({
      order: ['gemini', 'groq'],
      models: { gemini: 'gemini-3.5-flash-lite', groq: 'openai/gpt-oss-20b' },
      disabledSlots: ['groq#2'],
      tokenBudgets: { gemini: 100_000, groq: 3_000 },
      keyBudgets: {},
      expectedVersion: 3,
    });
  });

  it('sends the stored order untouched when the viewer cannot reorder', () => {
    const response = settingsWithRights({ canEditModels: true, canReorder: false });
    response.settings.order = ['groq'];
    api.getSettings.mockReturnValue(of(response));
    const { page, el } = setup();
    // The page still lists every provider, so the extra one must not leak into the save payload.
    expect(el.querySelectorAll('.provider')).toHaveLength(2);
    page.setModel('groq', event('openai/gpt-oss-20b'));
    page.save();
    expect(api.saveSettings.mock.calls[0][0].order).toEqual(['groq']);
  });

  it('keeps budgets of keys the viewer cannot list in the save payload', () => {
    const response = settingsWithStoredKey();
    response.settings.keyBudgets = { [activeKey.id]: 1_000, '99999999-9999-4999-8999-999999999999': 500 };
    api.getSettings.mockReturnValue(of(response));
    api.getUsage.mockReturnValue(of(usageWithStoredKey));
    const { page } = setup();
    page.setKeyBudget(activeKey.id, event('2500'));
    page.save();
    expect(api.saveSettings.mock.calls[0][0].keyBudgets).toEqual({ [activeKey.id]: 2500, '99999999-9999-4999-8999-999999999999': 500 });
  });

  it('loads usage totals and keeps the usage tab with assistant:usage:read', () => {
    api.getSettings.mockReturnValue(of(settingsWithRights({ canReadUsage: true, canEditBudgets: true })));
    const { page, el } = setup();
    expect(api.getUsage).toHaveBeenCalledTimes(1);
    expect(el.querySelector('#tab-usage')).not.toBeNull();
    expect(page.providerRows()[1].quota.used).toBe(2_500);
  });

  it('renders no usage tab and leaves the quota bars at zero without the usage right', () => {
    api.getSettings.mockReturnValue(of(settingsWithRights({ canEditModels: true })));
    const { page, el } = setup();
    expect(api.getUsage).not.toHaveBeenCalled();
    expect(el.querySelector('#tab-usage')).toBeNull();
    expect(el.querySelector<HTMLElement>('#panel-usage')?.hidden).toBe(true);
    expect(el.querySelector<HTMLElement>('.provider .budget')?.textContent).toContain('0 / 100.000 token');
    expect(el.textContent).toContain('Không có quyền xem số liệu sử dụng');
    page.setDays(30);
    expect(api.getUsage).not.toHaveBeenCalled();
  });

  it('hides the key form and blocks create without assistant:keys:create', () => {
    api.getKeys.mockReturnValue(of(keysResponse(false, true, [activeKey], false)));
    const { page, el } = setup();
    expect(el.querySelector('.key-form')).toBeNull();
    expect(el.textContent).toContain('chưa được cấp quyền thêm API key');
    page.setKeyLabel(event('Key lén'));
    page.setKeyValue(event('secret-12345'));
    expect(page.canAddKey()).toBe(false);
    page.createKey();
    expect(api.createKey).not.toHaveBeenCalled();
  });

  it('drops revoke and status actions per key when the server withholds them', () => {
    api.getKeys.mockReturnValue(of(keysResponse(true, true, [{ ...activeKey, canRevoke: false, canManageStatus: false }])));
    const { page, el } = setup();
    expect([...el.querySelectorAll('.actions button')].map(button => button.textContent?.trim())).toEqual(['Kiểm tra']);
    page.askRevoke(page.keys()[0]);
    expect(page.revokeConfirm()).toBeNull();
  });

  it('creates a key with account id, clears the secret and reloads the panel', () => {
    const { page } = setup();
    page.setKeyProvider(event('workers-ai'));
    page.setKeyLabel(event('CF dự phòng'));
    page.setKeyAccount(event('account-123'));
    page.setKeyValue(event('cf-secret-1234'));
    expect(page.canAddKey()).toBe(true);

    page.createKey();

    expect(api.createKey).toHaveBeenCalledExactlyOnceWith({
      provider: 'workers-ai', label: 'CF dự phòng', apiKey: 'cf-secret-1234', accountId: 'account-123',
    });
    expect(page.keyValue()).toBe('');
    expect(page.keyLabel()).toBe('');
    expect(page.keyAccount()).toBe('');
    expect(page.keyNotice()).toContain('kích hoạt ngay');
    expect(api.getKeys).toHaveBeenCalledTimes(2);
  });

  it('offers MộtAPI in the key form and creates it without a Cloudflare account', () => {
    const { page, el } = setup();
    const select = el.querySelector<HTMLSelectElement>('.key-form select');
    expect(Array.from(select!.options).map(option => option.value)).toContain('motapis');

    page.setKeyProvider(event('motapis'));
    page.setKeyLabel(event('MộtAPI dự phòng'));
    page.setKeyValue(event('sk-motapis-1234'));
    // The account field belongs to workers-ai only, so a paid aggregator key stays a plain API key.
    expect(page.needsAccount()).toBe(false);
    expect(page.canAddKey()).toBe(true);

    page.createKey();
    expect(api.createKey).toHaveBeenCalledExactlyOnceWith({ provider: 'motapis', label: 'MộtAPI dự phòng', apiKey: 'sk-motapis-1234' });
  });

  it('reveals a key only on demand, then hides and forgets it', () => {
    const { page } = setup();
    const key = page.keys()[0];
    page.revealKey(key);
    expect(api.revealKey).toHaveBeenCalledWith(key.id);
    expect(page.revealed()[key.id]).toEqual({ apiKey: 'db-key-1234', accountId: null });
    expect(page.keyNotice()).toContain('audit');
    page.hideKey(key.id);
    expect(page.revealed()[key.id]).toBeUndefined();
  });

  it('tests a stored key on demand and shows the normalized result inline', () => {
    const { fixture, page, el } = setup();
    page.testKey(page.keys()[0]);
    expect(api.testKey).toHaveBeenCalledExactlyOnceWith(activeKey.id);
    expect(page.keyNotice()).toContain('hoạt động bình thường');
    expect(page.keyNotice()).toContain('412');
    fixture.detectChanges();
    expect(el.querySelector('.test-result.ok')?.textContent).toContain('openai/gpt-oss-120b');
    expect(el.querySelector('.test-result.ok')?.textContent).toContain('412');
    expect(page.keyTesting()).toBe('');
  });

  it('surfaces a failed key test without changing the key status', () => {
    api.testKey.mockReturnValue(of(keyTestResult({ status: 'FAILED', code: 'QUOTA' })));
    const { fixture, page, el } = setup();
    page.testKey(page.keys()[0]);
    expect(page.keyError()).toContain('hết hạn mức');
    expect(page.keyError()).toContain('Trạng thái key không thay đổi');
    expect(api.setKeyStatus).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect(el.querySelector('.test-result.failed')?.textContent).toContain('hết hạn mức');
    expect(el.querySelector('.status.active')?.textContent).toContain('Đang dùng');
  });

  it('explains the test cooldown and clears the pending test state', () => {
    api.testKey.mockReturnValue(throwError(() => ({ status: 429, error: { code: 'KEY_TEST_COOLDOWN' } })));
    const { page } = setup();
    page.testKey(page.keys()[0]);
    expect(page.keyError()).toContain('30 giây');
    expect(page.keyTesting()).toBe('');
    expect(page.testResults()[activeKey.id]).toBeUndefined();
  });

  it('opens a bulk panel with all testable keys selected and each provider model', () => {
    api.getKeys.mockReturnValue(of(keysResponse(true, true, [activeKey, geminiKey])));
    const { fixture, page, el } = setup();
    page.toggleBulkPanel();
    fixture.detectChanges();
    expect(page.bulkOpen()).toBe(true);
    expect(page.bulkGroups().map(group => group.provider.id)).toEqual(['gemini', 'groq']);
    expect(page.bulkSelectedCount()).toBe(2);
    expect(page.bulkModelFor(page.bulkGroups()[0].provider)).toBe('gemini-3.5-flash-lite');
    expect(el.querySelectorAll('.bulk-key')).toHaveLength(2);
    expect(el.querySelector('.bulk-test')).not.toBeNull();
  });

  it('selects every key, clears and toggles a whole provider group', () => {
    api.getKeys.mockReturnValue(of(keysResponse(true, true, [activeKey, geminiKey])));
    const { page } = setup();
    page.toggleBulkPanel();
    const groq = page.bulkGroups().find(group => group.provider.id === 'groq')!;
    page.setBulkGroup(groq, { target: { checked: false } } as unknown as Event);
    expect(page.bulkSelectedCount()).toBe(1);
    expect(page.isBulkSelected(activeKey.id)).toBe(false);
    page.toggleBulkKey(activeKey.id);
    expect(page.isBulkSelected(activeKey.id)).toBe(true);
    page.clearBulk();
    expect(page.bulkSelectedCount()).toBe(0);
    expect(page.bulkCanRun()).toBe(false);
    page.selectAllBulk();
    expect(page.bulkSelectedCount()).toBe(2);
  });

  it('runs selected keys with the chosen provider model and reports every outcome', () => {
    api.getKeys.mockReturnValue(of(keysResponse(true, true, [activeKey, geminiKey])));
    api.testKeys.mockReturnValue(of(
      { id: geminiKey.id, result: keyTestResult({ provider: 'gemini', model: 'gemini-3.8-flash' }), error: null },
      { id: activeKey.id, result: null, error: { status: 429, error: { code: 'KEY_TEST_COOLDOWN' } } },
    ));
    const { fixture, page, el } = setup();
    page.toggleBulkPanel();
    page.setBulkModel('gemini', event('gemini-3.8-flash'));
    page.runBulkTests();

    expect(api.testKeys).toHaveBeenCalledExactlyOnceWith([
      { id: geminiKey.id, model: 'gemini-3.8-flash' },
      { id: activeKey.id, model: 'openai/gpt-oss-120b' },
    ]);
    expect(page.bulkRunning()).toBe(false);
    expect(page.bulkProgress()).toEqual({ done: 2, total: 2 });
    expect(page.bulkSummary()).toBe('Đã kiểm tra 2 key: 1 OK, 1 lỗi.');
    expect(page.testResults()[geminiKey.id]?.model).toBe('gemini-3.8-flash');
    fixture.detectChanges();
    expect(el.querySelectorAll('.bulk-results tbody tr')).toHaveLength(2);
    expect(el.querySelector('.bulk-result.ok')?.textContent).toContain('OK');
    expect(el.querySelector('.bulk-result.error')?.textContent).toContain('30 giây');
  });

  it('shows the bulk toggle to delegated admins for their own testable keys', () => {
    api.getSettings.mockReturnValue(of(settingsResponse(false)));
    api.getKeys.mockReturnValue(of(keysResponse(false, true, [activeKey])));
    const { fixture, page, el } = setup();
    expect(el.querySelector('.keys-head-actions button')?.textContent).toContain('Kiểm tra hàng loạt');
    page.toggleBulkPanel();
    fixture.detectChanges();
    expect(page.bulkSelectedCount()).toBe(1);
    expect(page.bulkGroups()[0]?.provider.id).toBe('groq');
    expect(el.querySelectorAll('.bulk-model select')).toHaveLength(1);
  });

  it('hides and blocks testing when the server does not allow it', () => {
    api.getKeys.mockReturnValue(of(keysResponse(true, true, [{ ...activeKey, canTest: false }])));
    const { page, el } = setup();
    expect([...el.querySelectorAll('.actions button')].map(button => button.textContent?.trim()))
      .toEqual(['Tạm tắt', 'Thu hồi']);
    page.testKey(page.keys()[0]);
    expect(api.testKey).not.toHaveBeenCalled();
  });

  it('requires a second click before revoking and removes the row afterwards', () => {
    const { fixture, page, el } = setup();
    const key = page.keys()[0];
    page.askRevoke(key);
    fixture.detectChanges();
    expect(api.revokeKey).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Xác nhận thu hồi');
    page.revokeKey(key);
    expect(api.revokeKey).toHaveBeenCalledWith(key.id);
    expect(page.keys()).toHaveLength(0);
    expect(page.keyNotice()).toContain('Đã thu hồi');
  });

  it('shows pending keys to the owner with an approve action', () => {
    api.getKeys.mockReturnValue(of(keysResponse(true, true, [{ ...activeKey, status: 'PENDING' }])));
    const { page, el } = setup();
    expect(page.pendingKeyCount()).toBe(1);
    expect(el.textContent).toContain('1 chờ duyệt');
    page.setKeyStatus(page.keys()[0], 'ACTIVE');
    expect(api.setKeyStatus).toHaveBeenCalledWith(activeKey.id, 'ACTIVE');
    expect(page.keyNotice()).toContain('Đã duyệt key');
  });

  it('disables key entry when the server has no master secret', () => {
    api.getKeys.mockReturnValue(of(keysResponse(true, false, [])));
    const { el } = setup();
    expect(el.querySelector('.key-form')).toBeNull();
    expect(el.textContent).toContain('ASSISTANT_KEY_SECRET');
  });

  const promptSetup = (overrides: Partial<AssistantPromptResponse> = {}) => {
    api.getPrompt.mockReturnValue(of(promptResponse(overrides)));
    const { fixture, page, el } = setup();
    page.setView('prompt');
    fixture.detectChanges();
    return { fixture, page, el };
  };

  it('renders the live prompt with its tokens and version for an update right', () => {
    const { page, el } = promptSetup();
    expect(el.querySelector<HTMLTextAreaElement>('.prompt-editor textarea')!.value).toContain('{TAI_LIEU}');
    expect(el.textContent).toContain('Đang dùng bản tùy chỉnh · phiên bản 2');
    expect(el.querySelectorAll('.prompt-tokens li')).toHaveLength(2);
    expect(el.textContent).toContain('bắt buộc');
    expect([...el.querySelectorAll('.prompt-actions button')].map(button => button.textContent?.trim()))
      .toEqual(['Lưu trực tiếp', 'Gửi yêu cầu sửa', 'Điền mẫu mặc định']);
    expect(el.querySelector('.prompt-note')).not.toBeNull();
    expect(page.canSavePrompt()).toBe(false);
  });

  it('hides the prompt tab and stays quiet when the endpoint answers 403', () => {
    api.getPrompt.mockReturnValue(throwError(() => ({ status: 403 })));
    const { page, el } = setup();
    expect(el.querySelector('#tab-prompt')).toBeNull();
    expect(page.showPromptTab()).toBe(false);
    expect(page.promptError()).toBe('');
    expect(el.querySelector('#tab-providers')).not.toBeNull();
  });

  it('shows a read-only prompt to an admin without either prompt right', () => {
    const { page, el } = promptSetup({ canUpdate: false, canRequest: false });
    expect(el.querySelector<HTMLTextAreaElement>('.prompt-editor textarea')!.hasAttribute('readonly')).toBe(true);
    expect(el.querySelectorAll('.prompt-actions button')).toHaveLength(0);
    expect(el.querySelector('.prompt-sub')).toBeNull();
    expect(el.textContent).toContain('assistant:prompt:update');
    expect(page.canSavePrompt()).toBe(false);
    expect(page.canFilePromptRequest()).toBe(false);
  });

  it('saves an edited draft with the version it was loaded at and refreshes the panel', () => {
    const draft = 'Bản mới vẫn giữ {TAI_LIEU} và thêm ràng buộc trả lời ngắn gọn.';
    // The re-read after the write answers with the stored version, which is what the next save must carry.
    api.getPrompt.mockReturnValueOnce(of(promptResponse())).mockReturnValue(of(promptResponse({ prompt: promptState({ version: 3, template: draft }) })));
    const { fixture, page, el } = setup();
    page.setView('prompt');
    fixture.detectChanges();
    const textarea = el.querySelector<HTMLTextAreaElement>('.prompt-editor textarea')!;
    textarea.value = draft;
    textarea.dispatchEvent(new Event('input'));
    expect(page.canSavePrompt()).toBe(true);
    page.savePrompt();
    expect(api.savePrompt).toHaveBeenCalledExactlyOnceWith({ template: draft, expectedVersion: 2 });
    expect(api.getPrompt).toHaveBeenCalledTimes(2);
    expect(page.promptState()?.version).toBe(3);
    expect(page.promptNotice()).toContain('phiên bản 3');
    expect(page.canSavePrompt()).toBe(false);
  });

  it('refuses to send a template that lost the required token or broke its case', () => {
    const { page } = promptSetup();
    page.setPromptDraft(event('Bản này không còn khối tài liệu nào cả, nên bị chặn lưu.'));
    expect(page.promptTokenProblem()).toContain('Thiếu {TAI_LIEU}');
    expect(page.canSavePrompt()).toBe(false);
    page.setPromptDraft(event('Chèn sai case: {Tai Lieu} thì server cũng từ chối bản này.'));
    expect(page.promptTokenProblem()).toContain('đúng nguyên văn');
    expect(page.canFilePromptRequest()).toBe(false);
    page.setPromptDraft(event('Đúng dấu gạch dưới nhưng sai hoa: {tai_lieu} vẫn bị chặn.'));
    expect(page.promptTokenProblem()).toContain('đúng nguyên văn');
    page.setPromptDraft(event('A'.repeat(6_001) + ' {TAI_LIEU}'));
    expect(page.promptOverLimit()).toBe(true);
    expect(page.canSavePrompt()).toBe(false);
    expect(api.savePrompt).not.toHaveBeenCalled();
    expect(api.requestPrompt).not.toHaveBeenCalled();
  });

  it('files a request instead of a write for the default request-only admin', () => {
    const { page, el } = promptSetup({ canUpdate: false, canRequest: true, pending: [] });
    expect(el.querySelector('.prompt-actions .primary')?.textContent).toContain('Gửi yêu cầu sửa');
    expect([...el.querySelectorAll('.prompt-actions button')].map(button => button.textContent?.trim()))
      .not.toContain('Lưu trực tiếp');
    const note = el.querySelector<HTMLInputElement>('.prompt-note input')!;
    note.value = 'Đề xuất thêm ràng buộc không bịa luật chơi';
    note.dispatchEvent(new Event('input'));
    page.setPromptDraft(event('Bản đề xuất giữ nguyên {TAI_LIEU} cho hàng chờ duyệt.'));
    expect(page.canFilePromptRequest()).toBe(true);
    page.filePromptRequest();
    expect(api.savePrompt).not.toHaveBeenCalled();
    expect(api.requestPrompt).toHaveBeenCalledExactlyOnceWith({
      template: 'Bản đề xuất giữ nguyên {TAI_LIEU} cho hàng chờ duyệt.',
      expectedVersion: 2,
      note: 'Đề xuất thêm ràng buộc không bịa luật chơi',
    });
    expect(page.promptNotice()).toContain('Đã gửi yêu cầu sửa system prompt');
    expect(page.promptState()?.version).toBe(2);
  });

  it('lists pending requests only for a reviewer and approves through the queue', () => {
    // The approved draft becomes the live prompt, so the refreshed view no longer carries it in the queue.
    api.getPrompt.mockReturnValueOnce(of(promptResponse({ pending: [promptRequest()] })))
      .mockReturnValue(of(promptResponse({ prompt: promptState({ version: 3, template: promptRequest().template }) })));
    const { fixture, page, el } = setup();
    page.setView('prompt');
    fixture.detectChanges();
    expect(el.querySelector('#tab-prompt .tab-count')?.textContent).toContain('1 chờ duyệt');
    expect(el.textContent).toContain('Đồng quản trị');
    expect(el.querySelectorAll('.prompt-request')).toHaveLength(1);
    page.approvePromptRequest(page.pendingPromptRequests()[0]);
    expect(api.approvePromptRequest).toHaveBeenCalledExactlyOnceWith(promptRequest().id, 2);
    expect(page.pendingPromptRequests()).toHaveLength(0);
    expect(page.promptState()?.version).toBe(3);
    expect(page.promptNotice()).toContain('Đã duyệt yêu cầu');
    // Regression: the editor used to keep the reviewer's stale draft, one "Lưu trực tiếp" away from
    // overwriting the approval that just landed.
    expect(page.promptDraft()).toBe(promptRequest().template);
    expect(page.promptDirty()).toBe(false);
    fixture.detectChanges();
    expect(el.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe(promptRequest().template);
  });

  it('requires a second step with a reason before rejecting a request', () => {
    const { fixture, page, el } = promptSetup({ pending: [promptRequest()] });
    page.askReject(page.pendingPromptRequests()[0]);
    fixture.detectChanges();
    expect(api.rejectPromptRequest).not.toHaveBeenCalled();
    const input = el.querySelector<HTMLInputElement>('.prompt-reject input')!;
    input.value = 'Câu chữ quá suồng sã';
    input.dispatchEvent(new Event('input'));
    page.confirmReject();
    expect(api.rejectPromptRequest).toHaveBeenCalledExactlyOnceWith(promptRequest().id, 'Câu chữ quá suồng sã');
    expect(page.rejectTarget()).toBe('');
    expect(page.promptNotice()).toContain('System prompt đang dùng không thay đổi');
  });

  it('re-reads the live version after a conflict and keeps the draft typed', () => {
    api.savePrompt.mockReturnValue(throwError(() => ({ status: 409, error: { code: 'VERSION_CONFLICT' } })));
    const { page } = promptSetup();
    const draft = 'Bản soạn dở vẫn còn sau xung đột phiên bản {TAI_LIEU}.';
    page.setPromptDraft(event(draft));
    page.savePrompt();
    expect(page.promptError()).toContain('khác với bản bạn đang sửa');
    expect(page.promptNotice()).toContain('Đã đọc lại bản mới nhất');
    expect(api.getPrompt).toHaveBeenCalledTimes(2);
    expect(page.promptDraft()).toBe(draft);
    expect(page.promptSaving()).toBe(false);
  });

  it('fills the shipped template on reset because there is no delete path', () => {
    const { page, el } = promptSetup();
    page.setPromptDraft(event('Một bản tùy chỉnh khác hẳn nội dung gốc đang dùng.'));
    (el.querySelector('.prompt-actions button:nth-child(3)') as HTMLButtonElement).click();
    expect(page.promptDraft()).toContain('Mẫu mặc định ship trong code');
    expect(api.savePrompt).not.toHaveBeenCalled();
    expect(page.canSavePrompt()).toBe(true);
    const labels = [...el.querySelectorAll('.tab-panel button')].map(button => button.textContent?.trim().toLowerCase() ?? '');
    expect(labels.some(label => label.includes('xóa') || label.includes('xoá') || label.includes('delete'))).toBe(false);
  });

  it('shows the requester their own queue with the reviewer answer', () => {
    const { page, el } = promptSetup({
      canUpdate: false,
      myRequests: [promptRequest({ status: 'REJECTED', reviewNote: 'Cần giữ đúng giọng điệu thương hiệu' })],
    });
    expect(el.querySelectorAll('.prompt-sub')).toHaveLength(1);
    expect(el.textContent).toContain('Đã từ chối');
    expect(el.textContent).toContain('Cần giữ đúng giọng điệu thương hiệu');
    expect(el.querySelector('.prompt-request-head .prompt-chip')?.textContent).toContain('Đã từ chối');
    expect(page.promptRequestStatusLabel(page.myPromptRequests()[0])).toBe('Đã từ chối');
  });
});
