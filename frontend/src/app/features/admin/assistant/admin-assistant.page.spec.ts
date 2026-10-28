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

const settingsResponse = (canManage = true, version = 3): AssistantSettingsResponse => ({
  settings: {
    order: ['gemini', 'groq'],
    models: { gemini: 'gemini-2.5-flash-lite', groq: 'llama-3.1-8b-instant' },
    disabledSlots: ['groq#2'],
    tokenBudgets: { gemini: 100_000, groq: 3_000 },
    version,
    updatedAt: '2026-10-28T10:00:00.000Z',
  },
  providers: [
    { id: 'gemini', label: 'Google Gemini', defaultModel: 'gemini-2.0-flash-lite', slots: [{ slot: 'gemini#1', disabled: false }, { slot: 'gemini#2', disabled: false }] },
    { id: 'groq', label: 'Groq', defaultModel: 'llama-3.1-8b-instant', slots: [{ slot: 'groq#1', disabled: false }, { slot: 'groq#2', disabled: true }] },
  ],
  canManage,
});

const usage: AssistantUsage = {
  days: 7,
  since: '2026-10-22',
  totals: { requests: 10, cacheHits: 4, failures: 1, answered: 6, avgLatencyMs: 820, tokensIn: 8_000, tokensOut: 2_000 },
  providers: [{ provider: 'groq', requests: 6, failures: 1, avgLatencyMs: 900, tokensIn: 2_000, tokensOut: 500 }],
  slots: [{ slot: 'groq#1', provider: 'groq', model: 'llama-3.1-8b-instant', requests: 6, failures: 1, avgLatencyMs: 900, tokensIn: 2_000, tokensOut: 500 }],
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
  model: 'llama-3.1-8b-instant',
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
    expect([...el.querySelectorAll<HTMLInputElement>('.model-field input')].map(input => input.value))
      .toEqual(['gemini-2.5-flash-lite', 'llama-3.1-8b-instant']);
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
    page.setModel('groq', event('llama-3.3-70b-versatile'));
    page.setBudget('groq', event('2000'));
    page.setBudget('gemini', event(''));
    page.save();

    expect(api.saveSettings).toHaveBeenCalledExactlyOnceWith({
      order: ['groq', 'gemini'],
      models: { gemini: 'gemini-2.5-flash-lite', groq: 'llama-3.3-70b-versatile' },
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
    expect(el.querySelector('.test-result.ok')?.textContent).toContain('llama-3.1-8b-instant');
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
