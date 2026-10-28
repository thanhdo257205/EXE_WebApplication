import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  AdminAssistantService,
  AssistantKey,
  AssistantKeyCreate,
  AssistantKeySecret,
  AssistantKeyStatus,
  AssistantKeyTestOutcome,
  AssistantKeyTestResult,
  AssistantModelOption,
  AssistantProviderConfig,
  AssistantSettingsResponse,
  AssistantUsage,
} from '../../../core/admin/admin-assistant.service';

const KEY_STATUS_LABELS: Record<AssistantKeyStatus, string> = {
  PENDING: 'Chờ duyệt',
  ACTIVE: 'Đang dùng',
  DISABLED: 'Tạm tắt',
  REVOKED: 'Đã thu hồi',
};

const TEST_FAILURE_LABELS: Record<string, string> = {
  QUOTA: 'hết hạn mức',
  AUTH: 'key sai hoặc đã hết hiệu lực',
  TIMEOUT: 'quá thời gian chờ',
  UNAVAILABLE: 'nhà cung cấp không sẵn sàng',
  INVALID: 'cấu hình không hợp lệ',
  EMPTY: 'không có câu trả lời',
};

const MAX_TOKEN_BUDGET = 2_000_000_000;
const DB_SLOT_PREFIX = 'db:';

interface BudgetBar {
  id: string;
  label: string;
  used: number;
  budget: number;
  remaining: number;
  percent: number;
  over: boolean;
  warn: boolean;
  hasBudget: boolean;
  // Tells the card whose budget a bar represents: a stored key, or the provider shared pool.
  source: 'key' | 'provider' | null;
}

interface KeyCard {
  slot: string;
  key: AssistantKey | null;
  title: string;
  enabled: boolean;
  quota: BudgetBar;
  requests: number;
  failures: number;
  avgLatencyMs: number;
  tokens: number;
}

interface ProviderRow {
  provider: AssistantProviderConfig;
  quota: BudgetBar;
  cards: KeyCard[];
  requests: number;
  failures: number;
  avgLatencyMs: number;
  triedKeys: number;
}

interface KeyTestChip {
  status: 'OK' | 'FAILED';
  code: string | null;
  model: string | null;
  latencyMs: number;
  testedAt: string;
  live: boolean;
}

interface KeyGroup {
  id: string;
  label: string;
  keys: AssistantKey[];
  active: number;
}

interface BulkGroup {
  provider: AssistantProviderConfig;
  keys: AssistantKey[];
  selected: number;
}

interface BulkOutcomeRow {
  id: string;
  label: string;
  providerLabel: string;
  status: 'OK' | 'FAILED' | 'ERROR';
  text: string;
  model: string;
  latencyMs: number | null;
}

@Component({
  selector: 'app-admin-assistant',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './admin-assistant.page.html',
  styleUrl: './admin-assistant.page.css',
})
export class AdminAssistantPage implements OnInit {
  private readonly api = inject(AdminAssistantService);

  readonly dayOptions = [1, 7, 30, 90];
  readonly providerOptions = [
    { id: 'gemini', label: 'Google Gemini' },
    { id: 'groq', label: 'Groq' },
    { id: 'openrouter', label: 'OpenRouter' },
    { id: 'workers-ai', label: 'Cloudflare Workers AI' },
  ] as const;

  readonly settings = signal<AssistantSettingsResponse | null>(null);
  readonly order = signal<string[]>([]);
  readonly models = signal<Record<string, string>>({});
  readonly disabled = signal<string[]>([]);
  readonly budgets = signal<Record<string, string>>({});
  readonly keyBudgets = signal<Record<string, string>>({});
  readonly usage = signal<AssistantUsage | null>(null);
  readonly days = signal(7);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly usageLoading = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly view = signal<'providers' | 'keys' | 'usage'>('providers');

  readonly keys = signal<AssistantKey[]>([]);
  readonly keyStorage = signal(true);
  readonly keyLimits = signal({ perOwner: 10, active: 32 });
  readonly canManageKeys = signal(false);
  readonly canCreateKey = signal(false);
  readonly keysLoading = signal(false);
  readonly keySaving = signal(false);
  readonly keyBusy = signal('');
  readonly keyTesting = signal('');
  readonly keyError = signal('');
  readonly keyNotice = signal('');
  readonly revealed = signal<Record<string, AssistantKeySecret>>({});
  readonly testResults = signal<Record<string, AssistantKeyTestResult>>({});
  readonly revokeConfirm = signal<string | null>(null);
  readonly keyProvider = signal('gemini');
  readonly keyLabel = signal('');
  readonly keyValue = signal('');
  readonly keyAccount = signal('');

  readonly bulkOpen = signal(false);
  readonly bulkSelection = signal<Record<string, boolean>>({});
  readonly bulkModels = signal<Record<string, string>>({});
  readonly bulkRunning = signal(false);
  readonly bulkProgress = signal({ done: 0, total: 0 });
  readonly bulkOutcomes = signal<Record<string, BulkOutcomeRow>>({});
  readonly bulkSummary = signal('');

  readonly canManage = computed(() => this.settings()?.canManage ?? false);
  readonly canReorder = computed(() => this.settings()?.canReorder ?? false);
  readonly canEditModels = computed(() => this.settings()?.canEditModels ?? false);
  readonly canManageSlots = computed(() => this.settings()?.canManageSlots ?? false);
  readonly canEditBudgets = computed(() => this.settings()?.canEditBudgets ?? false);
  readonly canReadUsage = computed(() => this.settings()?.canReadUsage ?? false);
  readonly needsAccount = computed(() => this.keyProvider() === 'workers-ai');
  readonly canAddKey = computed(() => this.canCreateKey() && this.keyStorage() && !this.keySaving()
    && this.keyLabel().trim().length > 0
    && this.keyValue().trim().length >= 8
    && (!this.needsAccount() || this.keyAccount().trim().length > 0));
  readonly pendingKeyCount = computed(() => this.keys().filter(key => key.status === 'PENDING').length);
  readonly testableKeys = computed(() => this.keys().filter(key => key.canTest));
  readonly orderedProviders = computed(() => {
    const providers = new Map((this.settings()?.providers ?? []).map(provider => [provider.id, provider]));
    return this.order().map(id => providers.get(id)).filter((provider): provider is AssistantProviderConfig => Boolean(provider));
  });
  readonly bulkGroups = computed<BulkGroup[]>(() => {
    const selection = this.bulkSelection();
    const testable = this.testableKeys();
    const groups: BulkGroup[] = [];
    for (const provider of this.orderedProviders()) {
      const keys = testable.filter(key => key.provider === provider.id);
      if (!keys.length) continue;
      groups.push({ provider, keys, selected: keys.filter(key => selection[key.id]).length });
    }
    return groups;
  });
  readonly bulkSelectedCount = computed(() => this.bulkGroups().reduce((total, group) => total + group.selected, 0));
  readonly bulkCanRun = computed(() => this.bulkSelectedCount() > 0 && !this.bulkRunning() && !this.keyBusy());
  readonly bulkPercent = computed(() => {
    const { done, total } = this.bulkProgress();
    return total ? Math.round(done / total * 100) : 0;
  });
  readonly bulkOutcomeRows = computed(() => Object.values(this.bulkOutcomes()));
  readonly cacheRate = computed(() => {
    const totals = this.usage()?.totals;
    return totals && totals.requests ? Math.round(totals.cacheHits / totals.requests * 100) : 0;
  });
  // Providers report token usage per request, so "used today" is a measured total, not a quota probe.
  private bar(id: string, label: string, used: number, budget: number, source: BudgetBar['source']): BudgetBar {
    const hasBudget = budget > 0;
    return {
      id, label, used, budget, source, hasBudget,
      remaining: Math.max(0, budget - used),
      percent: hasBudget ? Math.min(100, Math.round(used / budget * 100)) : 0,
      over: hasBudget && used > budget,
      warn: hasBudget && used <= budget && used >= budget * 0.8,
    };
  }

  private parseBudget(raw: string | undefined): number {
    const amount = Number((raw ?? '').trim());
    return Number.isSafeInteger(amount) && amount > 0 && amount <= MAX_TOKEN_BUDGET ? amount : 0;
  }

  readonly providerRows = computed<ProviderRow[]>(() => {
    const usage = this.usage();
    const todayProvider = new Map((usage?.today.providers ?? []).map(row => [row.provider, row.tokensIn + row.tokensOut]));
    const todaySlot = new Map((usage?.today.slots ?? []).map(row => [row.slot, row.tokensIn + row.tokensOut]));
    const slotStats = new Map((usage?.keys ?? []).map(row => [row.slot, row]));
    const providerStats = new Map((usage?.providers ?? []).map(row => [row.provider, row]));
    const visible = new Map(this.keys().map(key => [key.id, key]));
    const keyBudgets = this.keyBudgets();
    const disabled = this.disabled();
    return this.orderedProviders().map(provider => {
      const budget = this.parseBudget(this.budgets()[provider.id]);
      const cards: KeyCard[] = provider.slots.map(slot => {
        // A db: slot carries the credential id, which is what per-key budgets and usage rows are keyed by.
        const isDatabaseSlot = slot.slot.startsWith(DB_SLOT_PREFIX);
        const key = isDatabaseSlot ? visible.get(slot.slot.slice(DB_SLOT_PREFIX.length)) ?? null : null;
        const title = key?.label ?? this.slotLabel(slot.slot);
        const used = todaySlot.get(slot.slot) ?? 0;
        const stats = slotStats.get(slot.slot);
        // A stored key only compares against its own budget; env keys share the provider pool.
        const quota = isDatabaseSlot
          ? this.bar(slot.slot, title, used, this.parseBudget(key ? keyBudgets[key.id] : undefined), 'key')
          : this.bar(slot.slot, title, used, budget, 'provider');
        return {
          slot: slot.slot,
          key,
          title,
          enabled: !disabled.includes(slot.slot),
          quota,
          requests: stats?.requests ?? 0,
          failures: stats?.failures ?? 0,
          avgLatencyMs: stats?.avgLatencyMs ?? 0,
          tokens: (stats?.tokensIn ?? 0) + (stats?.tokensOut ?? 0),
        };
      });
      const row = providerStats.get(provider.id);
      return {
        provider,
        quota: this.bar(provider.id, provider.label, todayProvider.get(provider.id) ?? 0, budget, 'provider'),
        cards,
        requests: row?.requests ?? 0,
        failures: row?.failures ?? 0,
        avgLatencyMs: row?.avgLatencyMs ?? 0,
        triedKeys: cards.filter(card => card.enabled).length,
      };
    });
  });
  readonly hasBudgets = computed(() => this.providerRows()
    .some(row => row.quota.hasBudget || row.cards.some(card => card.quota.hasBudget)));
  readonly keyGroups = computed<KeyGroup[]>(() => {
    const byProvider = new Map<string, AssistantKey[]>();
    for (const key of this.keys()) {
      const list = byProvider.get(key.provider);
      if (list) list.push(key);
      else byProvider.set(key.provider, [key]);
    }
    const groups: KeyGroup[] = [];
    for (const provider of this.orderedProviders()) {
      const keys = byProvider.get(provider.id);
      if (!keys?.length) continue;
      groups.push({ id: provider.id, label: provider.label, keys, active: keys.filter(key => key.status === 'ACTIVE').length });
      byProvider.delete(provider.id);
    }
    for (const [id, keys] of byProvider) {
      groups.push({ id, label: keys[0].providerLabel, keys, active: keys.filter(key => key.status === 'ACTIVE').length });
    }
    return groups;
  });
  readonly updatedLabel = computed(() => {
    const settings = this.settings()?.settings;
    if (!settings?.updatedAt) return 'Đang dùng mặc định từ biến môi trường';
    return `Cập nhật ${new Date(settings.updatedAt).toLocaleString('vi-VN')} · phiên bản ${settings.version}`;
  });

  ngOnInit(): void {
    this.load();
    this.loadKeys();
  }

  load(keepError = false): void {
    this.loading.set(true);
    if (!keepError) this.error.set('');
    this.api.getSettings().subscribe({
      next: response => {
        this.apply(response);
        this.loading.set(false);
        this.loadUsage();
      },
      error: error => {
        this.loading.set(false);
        this.error.set(this.messageFor(error, 'Không tải được cấu hình trợ lý.'));
      },
    });
  }

  loadUsage(): void {
    // The usage API answers 403 without assistant:usage:read; the quota bars simply stay at zero.
    if (!this.canReadUsage()) return;
    this.usageLoading.set(true);
    this.api.getUsage(this.days()).subscribe({
      next: usage => { this.usage.set(usage); this.usageLoading.set(false); },
      error: error => { this.usageLoading.set(false); this.error.set(this.messageFor(error, 'Không tải được số liệu sử dụng.')); },
    });
  }

  setDays(days: number): void {
    if (this.days() === days) return;
    this.days.set(days);
    this.loadUsage();
  }

  setView(view: 'providers' | 'keys' | 'usage'): void {
    this.view.set(view);
  }

  loadKeys(): void {
    this.keysLoading.set(true);
    this.keyError.set('');
    this.api.getKeys().subscribe({
      next: response => {
        this.keys.set(response.items);
        this.canManageKeys.set(response.canManage);
        this.canCreateKey.set(response.canCreate);
        this.keyStorage.set(response.storageAvailable);
        this.keyLimits.set(response.limits);
        this.keysLoading.set(false);
      },
      error: error => {
        this.keysLoading.set(false);
        this.keyError.set(this.messageFor(error, 'Không tải được danh sách API key.'));
      },
    });
  }

  setKeyProvider(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.keyProvider.set(value);
    if (value !== 'workers-ai') this.keyAccount.set('');
    this.keyError.set('');
    this.keyNotice.set('');
  }

  setKeyLabel(event: Event): void {
    this.keyLabel.set((event.target as HTMLInputElement).value);
    this.keyError.set('');
  }

  setKeyValue(event: Event): void {
    this.keyValue.set((event.target as HTMLInputElement).value);
    this.keyError.set('');
  }

  setKeyAccount(event: Event): void {
    this.keyAccount.set((event.target as HTMLInputElement).value);
    this.keyError.set('');
  }

  createKey(): void {
    if (!this.canAddKey()) return;
    this.keySaving.set(true);
    this.keyError.set('');
    this.keyNotice.set('');
    const body: AssistantKeyCreate = {
      provider: this.keyProvider(),
      label: this.keyLabel().trim(),
      apiKey: this.keyValue().trim(),
    };
    if (this.needsAccount()) body.accountId = this.keyAccount().trim();
    this.api.createKey(body).subscribe({
      next: response => {
        this.keySaving.set(false);
        this.keyValue.set('');
        this.keyLabel.set('');
        this.keyAccount.set('');
        this.keyNotice.set(response.item.status === 'PENDING'
          ? 'Đã gửi key. Key đang chờ admin chính duyệt trước khi được dùng.'
          : 'Đã thêm key và kích hoạt ngay.');
        this.loadKeys();
        this.load();
      },
      error: error => {
        this.keySaving.set(false);
        this.keyError.set(this.keyMessage(error, 'Không thêm được key.'));
      },
    });
  }

  revealKey(key: AssistantKey): void {
    if (!key.canReveal || this.keyBusy()) return;
    this.keyBusy.set(key.id);
    this.keyError.set('');
    this.keyNotice.set('');
    this.api.revealKey(key.id).subscribe({
      next: secret => {
        this.revealed.update(map => ({ ...map, [key.id]: secret }));
        this.keyBusy.set('');
        this.keyNotice.set(`Đã hiện nội dung key "${key.label}". Lần xem này được ghi vào audit log.`);
      },
      error: error => {
        this.keyBusy.set('');
        this.keyError.set(this.keyMessage(error, 'Không xem được key.'));
      },
    });
  }

  hideKey(id: string): void {
    this.revealed.update(map => {
      const next = { ...map };
      delete next[id];
      return next;
    });
  }

  /** A probe from this session wins; otherwise the card falls back to the outcome stored on the key. */
  testChip(key: AssistantKey): KeyTestChip | null {
    const live = this.testResults()[key.id];
    if (live) return { status: live.status, code: live.code, model: live.model, latencyMs: live.latencyMs, testedAt: live.testedAt, live: true };
    const stored = key.lastTest;
    return stored ? { ...stored, live: false } : null;
  }

  testFailureLabel(code: string | null): string {
    return code ? TEST_FAILURE_LABELS[code] ?? 'lỗi không xác định' : 'lỗi không xác định';
  }

  keyTestLabel(chip: KeyTestChip): string {
    const when = new Date(chip.testedAt).toLocaleTimeString('vi-VN');
    const model = chip.model ? ` · ${chip.model}` : '';
    return chip.status === 'OK'
      ? `${chip.live ? 'Vừa kiểm tra' : 'Lần kiểm tra trước'} ${when}: OK${model} · ${chip.latencyMs} ms`
      : `${chip.live ? 'Vừa kiểm tra' : 'Lần kiểm tra trước'} ${when}: ${this.testFailureLabel(chip.code)}${model}`;
  }

  testKey(key: AssistantKey): void {
    if (!key.canTest || this.keyBusy() || this.bulkRunning()) return;
    this.keyBusy.set(key.id);
    this.keyTesting.set(key.id);
    this.keyError.set('');
    this.keyNotice.set('');
    this.api.testKey(key.id).subscribe({
      next: result => {
        this.keyBusy.set('');
        this.keyTesting.set('');
        this.testResults.update(map => ({ ...map, [key.id]: result }));
        if (result.status === 'OK') {
          this.keyNotice.set(`Key "${key.label}" hoạt động bình thường: ${result.model} trả lời trong ${result.latencyMs} ms.`);
        } else {
          this.keyError.set(`Key "${key.label}" không dùng được: ${this.testFailureLabel(result.code)}. Trạng thái key không thay đổi.`);
        }
      },
      error: error => {
        this.keyBusy.set('');
        this.keyTesting.set('');
        this.keyError.set(this.keyMessage(error, 'Không kiểm tra được key.'));
      },
    });
  }

  toggleBulkPanel(): void {
    if (this.bulkRunning()) return;
    const open = !this.bulkOpen();
    this.bulkOpen.set(open);
    if (!open) return;
    const selection: Record<string, boolean> = {};
    for (const key of this.testableKeys()) selection[key.id] = true;
    this.bulkSelection.set(selection);
    this.bulkSummary.set('');
  }

  selectAllBulk(): void {
    if (this.bulkRunning()) return;
    const selection: Record<string, boolean> = {};
    for (const key of this.testableKeys()) selection[key.id] = true;
    this.bulkSelection.set(selection);
  }

  clearBulk(): void {
    if (this.bulkRunning()) return;
    this.bulkSelection.set({});
  }

  toggleBulkKey(id: string): void {
    if (this.bulkRunning()) return;
    this.bulkSelection.update(selection => ({ ...selection, [id]: !selection[id] }));
  }

  setBulkGroup(group: BulkGroup, event: Event): void {
    if (this.bulkRunning()) return;
    const checked = (event.target as HTMLInputElement).checked;
    this.bulkSelection.update(selection => {
      const next = { ...selection };
      for (const key of group.keys) next[key.id] = checked;
      return next;
    });
  }

  setBulkModel(providerId: string, event: Event): void {
    const model = (event.target as HTMLSelectElement).value;
    this.bulkModels.update(models => ({ ...models, [providerId]: model }));
  }

  bulkModelFor(provider: AssistantProviderConfig): string {
    const chosen = this.bulkModels()[provider.id];
    return chosen && this.modelOptions(provider).some(option => option.id === chosen) ? chosen : this.slotModel(provider);
  }

  isBulkSelected(id: string): boolean {
    return this.bulkSelection()[id] ?? false;
  }

  runBulkTests(): void {
    if (!this.bulkCanRun()) return;
    const targets = this.bulkGroups().flatMap(group => group.keys
      .filter(key => this.isBulkSelected(key.id))
      .map(key => ({ key, model: this.bulkModelFor(group.provider) })));
    if (!targets.length) return;
    this.bulkRunning.set(true);
    this.bulkProgress.set({ done: 0, total: targets.length });
    this.bulkOutcomes.set({});
    this.bulkSummary.set('');
    this.keyError.set('');
    this.keyNotice.set('');
    this.api.testKeys(targets.map(target => ({ id: target.key.id, model: target.model }))).subscribe({
      next: outcome => {
        const target = targets.find(item => item.key.id === outcome.id);
        if (!target) return;
        const row = this.bulkRow(target.key, target.model, outcome);
        this.bulkOutcomes.update(rows => ({ ...rows, [row.id]: row }));
        const result = outcome.result;
        if (result) this.testResults.update(results => ({ ...results, [row.id]: result }));
        this.bulkProgress.update(progress => ({ ...progress, done: progress.done + 1 }));
      },
      error: error => {
        this.bulkRunning.set(false);
        this.keyError.set(this.keyMessage(error, 'Không chạy được kiểm tra hàng loạt.'));
      },
      complete: () => {
        this.bulkRunning.set(false);
        const rows = Object.values(this.bulkOutcomes());
        const ok = rows.filter(row => row.status === 'OK').length;
        this.bulkSummary.set(`Đã kiểm tra ${rows.length} key: ${ok} OK, ${rows.length - ok} lỗi.`);
      },
    });
  }

  private bulkRow(key: AssistantKey, model: string, outcome: AssistantKeyTestOutcome): BulkOutcomeRow {
    const base = { id: key.id, label: key.label, providerLabel: key.providerLabel };
    if (!outcome.result) {
      return { ...base, status: 'ERROR', text: this.keyMessage(outcome.error, 'Không kiểm tra được key.'), model, latencyMs: null };
    }
    return {
      ...base,
      status: outcome.result.status,
      text: outcome.result.status === 'OK' ? 'OK' : `Lỗi: ${this.testFailureLabel(outcome.result.code)}`,
      model: outcome.result.model,
      latencyMs: outcome.result.latencyMs,
    };
  }

  setKeyStatus(key: AssistantKey, status: 'ACTIVE' | 'DISABLED'): void {
    if (!key.canManageStatus || this.keyBusy() || this.bulkRunning()) return;
    this.keyBusy.set(key.id);
    this.keyError.set('');
    this.keyNotice.set('');
    this.api.setKeyStatus(key.id, status).subscribe({
      next: response => {
        this.keyBusy.set('');
        this.keys.update(list => list.map(item => item.id === key.id ? response.item : item));
        this.keyNotice.set(status === 'ACTIVE' ? `Đã duyệt key "${key.label}".` : `Đã tạm tắt key "${key.label}".`);
        this.load();
      },
      error: error => {
        this.keyBusy.set('');
        this.keyError.set(this.keyMessage(error, 'Không đổi được trạng thái key.'));
      },
    });
  }

  askRevoke(key: AssistantKey): void {
    if (!key.canRevoke || this.keyBusy() || this.bulkRunning()) return;
    this.revokeConfirm.set(key.id);
  }

  cancelRevoke(): void {
    this.revokeConfirm.set(null);
  }

  revokeKey(key: AssistantKey): void {
    if (!key.canRevoke || this.revokeConfirm() !== key.id || this.keyBusy() || this.bulkRunning()) return;
    this.keyBusy.set(key.id);
    this.keyError.set('');
    this.keyNotice.set('');
    this.api.revokeKey(key.id).subscribe({
      next: () => {
        this.keyBusy.set('');
        this.revokeConfirm.set(null);
        this.hideKey(key.id);
        this.testResults.update(map => {
          const next = { ...map };
          delete next[key.id];
          return next;
        });
        this.keys.update(list => list.filter(item => item.id !== key.id));
        this.keyNotice.set(`Đã thu hồi key "${key.label}". Nội dung key đã bị xoá khỏi máy chủ.`);
        this.load();
      },
      error: error => {
        this.keyBusy.set('');
        this.keyError.set(this.keyMessage(error, 'Không thu hồi được key.'));
      },
    });
  }

  keyStatusLabel(status: AssistantKeyStatus): string {
    return KEY_STATUS_LABELS[status];
  }

  keyOwnerLabel(key: AssistantKey): string {
    return key.isMine ? 'Bạn' : `${key.ownerDisplayName} (${key.ownerEmail})`;
  }

  formatKeyDate(value: string): string {
    return new Date(value).toLocaleString('vi-VN');
  }

  slotLabel(slot: string): string {
    // Database slots are opaque UUIDs; a short prefix keeps the settings list readable.
    return slot.startsWith('db:') ? `Key quản trị · ${slot.slice(3, 11)}` : slot;
  }

  providerLabel(id: string): string {
    return this.settings()?.providers.find(provider => provider.id === id)?.label ?? id;
  }

  slotModel(provider: AssistantProviderConfig): string {
    return this.models()[provider.id] ?? provider.defaultModel;
  }

  modelOptions(provider: AssistantProviderConfig): AssistantModelOption[] {
    const current = this.slotModel(provider);
    const options = Array.isArray(provider.models) ? [...provider.models] : [];
    // Legacy env overrides may sit outside the catalog; keep them selectable instead of silently changing the model.
    if (current && !options.some(option => option.id === current)) {
      options.unshift({ id: current, label: `${current} (ngoài danh mục)`, note: 'Model đang cấu hình ngoài danh mục' });
    }
    if (!options.length && provider.defaultModel) {
      options.push({ id: provider.defaultModel, label: provider.defaultModel, note: 'Model mặc định của máy chủ' });
    }
    return options;
  }

  selectedModel(provider: AssistantProviderConfig): AssistantModelOption | null {
    return this.modelOptions(provider).find(option => option.id === this.slotModel(provider)) ?? null;
  }

  setModel(id: string, event: Event): void {
    if (!this.canEditModels()) return;
    const value = (event.target as HTMLSelectElement).value;
    this.models.update(models => ({ ...models, [id]: value }));
    this.notice.set('');
  }

  setBudget(id: string, event: Event): void {
    if (!this.canEditBudgets()) return;
    const value = (event.target as HTMLInputElement).value;
    this.budgets.update(budgets => ({ ...budgets, [id]: value }));
    this.notice.set('');
    this.error.set('');
  }

  setKeyBudget(id: string, event: Event): void {
    if (!this.canEditBudgets()) return;
    const value = (event.target as HTMLInputElement).value;
    this.keyBudgets.update(budgets => ({ ...budgets, [id]: value }));
    this.notice.set('');
    this.error.set('');
  }

  formatTokens(value: number): string {
    return Math.max(0, Math.round(value)).toLocaleString('vi-VN');
  }

  toggleSlot(slot: string): void {
    if (!this.canManageSlots()) return;
    this.disabled.update(list => list.includes(slot) ? list.filter(item => item !== slot) : [...list, slot]);
    this.notice.set('');
  }

  move(index: number, delta: number): void {
    if (!this.canReorder()) return;
    const target = index + delta;
    const list = [...this.order()];
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    this.order.set(list);
    this.notice.set('');
  }

  save(): void {
    if (!this.canManage() || this.saving()) return;
    const invalid = this.invalidBudget();
    if (invalid) {
      this.error.set(`Ngân sách token của ${invalid} phải là số nguyên từ 1 đến 2.000.000.000, hoặc để trống.`);
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.notice.set('');
    this.api.saveSettings({
      // A viewer without the reorder right must not send the row list, which also carries providers the
      // stored order never listed: that would read as an order change and the server would reject the save.
      order: this.canReorder() ? this.order() : (this.settings()?.settings.order ?? this.order()),
      models: this.models(),
      disabledSlots: this.disabled(),
      tokenBudgets: this.budgetPayload(),
      keyBudgets: this.keyBudgetPayload(),
      expectedVersion: this.settings()?.settings.version ?? 0,
    }).subscribe({
      next: response => {
        this.apply(response);
        this.saving.set(false);
        this.notice.set('Đã lưu cấu hình. Thay đổi áp dụng trong tối đa 30 giây trên mọi máy chủ.');
      },
      error: error => {
        this.saving.set(false);
        if (error?.status === 409) {
          this.load(true);
          this.error.set('Cấu hình vừa được người khác thay đổi. Đã tải lại bản mới nhất, bạn kiểm tra rồi lưu lại.');
          return;
        }
        this.error.set(this.messageFor(error, 'Không lưu được cấu hình.'));
      },
    });
  }

  private apply(response: AssistantSettingsResponse): void {
    this.settings.set(response);
    const available = new Set(response.providers.map(provider => provider.id));
    const ordered = response.settings.order.filter(id => available.has(id));
    for (const provider of response.providers) if (!ordered.includes(provider.id)) ordered.push(provider.id);
    this.order.set(ordered);
    this.models.set({ ...response.settings.models });
    this.disabled.set([...response.settings.disabledSlots]);
    const budgets: Record<string, string> = {};
    for (const provider of response.providers) {
      const amount = response.settings.tokenBudgets[provider.id];
      budgets[provider.id] = amount ? String(amount) : '';
    }
    this.budgets.set(budgets);
    const keyBudgets: Record<string, string> = {};
    for (const [id, amount] of Object.entries(response.settings.keyBudgets)) keyBudgets[id] = String(amount);
    this.keyBudgets.set(keyBudgets);
  }

  private invalidBudget(): string | null {
    for (const provider of this.orderedProviders()) {
      const raw = (this.budgets()[provider.id] ?? '').trim();
      if (!raw) continue;
      const amount = Number(raw);
      if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_TOKEN_BUDGET) return provider.label;
    }
    for (const [id, raw] of Object.entries(this.keyBudgets())) {
      const value = (raw ?? '').trim();
      if (!value) continue;
      const amount = Number(value);
      if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_TOKEN_BUDGET) {
        const key = this.keys().find(item => item.id === id);
        return key ? `key “${key.label}”` : 'một key quản trị';
      }
    }
    return null;
  }

  private budgetPayload(): Record<string, number> {
    const budgets: Record<string, number> = {};
    for (const provider of this.orderedProviders()) {
      const amount = this.parseBudget(this.budgets()[provider.id]);
      if (amount) budgets[provider.id] = amount;
    }
    return budgets;
  }

  private keyBudgetPayload(): Record<string, number> {
    // Read the whole loaded map, not just the keys this viewer can list: a partial save must not wipe
    // the budgets of keys owned by other admins.
    const budgets: Record<string, number> = {};
    for (const [id, raw] of Object.entries(this.keyBudgets())) {
      const amount = this.parseBudget(raw);
      if (amount) budgets[id] = amount;
    }
    return budgets;
  }

  private messageFor(error: any, fallback: string): string {
    if (error?.status === 401 || error?.status === 403) return 'Phiên quản trị đã hết hạn hoặc bạn không có quyền. Hãy đăng nhập lại.';
    if (error?.status === 0) return 'Không kết nối được tới máy chủ. Kiểm tra mạng rồi thử lại.';
    return fallback;
  }

  private keyMessage(error: any, fallback: string): string {
    const code = error?.error?.code;
    if (code === 'DUPLICATE_KEY') return 'Key này đã tồn tại cho nhà cung cấp đó. Không thể thêm trùng.';
    if (code === 'KEY_LIMIT_REACHED') return 'Đã đạt giới hạn key. Hãy thu hồi bớt key trước khi thêm hoặc duyệt thêm.';
    if (code === 'KEY_STORAGE_UNAVAILABLE') return 'Máy chủ chưa cấu hình ASSISTANT_KEY_SECRET nên không lưu được key mới.';
    if (code === 'INVALID_ACCOUNT_ID') return 'Cloudflare Workers AI cần Account ID hợp lệ (chỉ chữ, số, gạch ngang/gạch dưới).';
    if (code === 'KEY_REVOKED') return 'Key này đã bị thu hồi nên không thể xem hoặc đổi trạng thái.';
    if (code === 'KEY_TEST_COOLDOWN') return 'Vừa kiểm tra key này. Chờ khoảng 30 giây rồi thử lại để tránh tốn hạn mức.';
    if (code === 'KEY_UNREADABLE') return 'Không giải mã được key. ASSISTANT_KEY_SECRET có thể đã thay đổi; hãy thu hồi và thêm lại key.';
    return this.messageFor(error, fallback);
  }
}
