import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminAssistantPage } from './admin-assistant.page';
import {
  AdminAssistantService,
  AssistantKey,
  AssistantKeysResponse,
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
    version,
    updatedAt: '2026-10-28T10:00:00.000Z',
  },
  providers: [
    { id: 'gemini', label: 'Google Gemini', defaultModel: 'gemini-3.5-flash-lite', models: geminiModels, slots: [{ slot: 'gemini#1', disabled: false }, { slot: 'gemini#2', disabled: false }] },
    { id: 'groq', label: 'Groq', defaultModel: 'openai/gpt-oss-120b', models: groqModels, slots: [{ slot: 'groq#1', disabled: false }, { slot: 'groq#2', disabled: true }] },
  ],
  canManage,
});

const usage: AssistantUsage = {
  days: 7,
  since: '2026-10-22',
  totals: { requests: 10, cacheHits: 4, failures: 1, answered: 6, avgLatencyMs: 820, tokensIn: 8_000, tokensOut: 2_000 },
  providers: [{ provider: 'groq', requests: 6, failures: 1, avgLatencyMs: 900, tokensIn: 2_000, tokensOut: 500 }],
  slots: [{ slot: 'groq#1', provider: 'groq', model: 'openai/gpt-oss-120b', requests: 6, failures: 1, avgLatencyMs: 900, tokensIn: 2_000, tokensOut: 500 }],
  daily: [{ day: '2026-10-28', requests: 10, cacheHits: 4, failures: 1, tokensIn: 8_000, tokensOut: 2_000 }],
  today: {
    day: '2026-10-28',
    providers: [
      { provider: 'gemini', tokensIn: 6_000, tokensOut: 1_500 },
      { provider: 'groq', tokensIn: 2_000, tokensOut: 500 },
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
  canManageStatus: true,
  createdAt: '2026-10-28T09:00:00.000Z',
  updatedAt: '2026-10-28T09:00:00.000Z',
  approvedAt: '2026-10-28T09:00:00.000Z',
};

const geminiKey: AssistantKey = {
  ...activeKey,
  id: '22222222-2222-4222-8222-222222222222',
  provider: 'gemini',
  providerLabel: 'Google Gemini',
  label: 'Gemini chính',
  hint: '••••5678',
};

const keysResponse = (canManage = true, storageAvailable = true, items: AssistantKey[] = [activeKey]): AssistantKeysResponse => ({
  items,
  canManage,
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
    api.getKeys.mockReturnValue(of(keysResponse(false)));
    const { page, el } = setup();
    expect(el.querySelectorAll('.order-actions button')).toHaveLength(0);
    expect(el.querySelector('.panel[aria-labelledby="config-title"] button.primary')).toBeNull();
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
});
