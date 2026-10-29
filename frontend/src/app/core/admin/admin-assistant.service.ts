import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { catchError, from, map, mergeMap, of, switchMap } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';

export interface AssistantProviderSlot {
  slot: string;
  disabled: boolean;
}

export interface AssistantModelOption {
  id: string;
  label: string;
  recommended?: boolean;
  note: string;
}

export interface AssistantProviderConfig {
  id: string;
  label: string;
  defaultModel: string;
  models: AssistantModelOption[];
  slots: AssistantProviderSlot[];
}

export interface AssistantSettings {
  order: string[];
  models: Record<string, string>;
  disabledSlots: string[];
  tokenBudgets: Record<string, number>;
  keyBudgets: Record<string, number>;
  version: number;
  updatedAt: string | null;
}

export interface AssistantSettingsResponse {
  settings: AssistantSettings;
  /** Daily token ceiling a stored key shows until it has a budget of its own. */
  keyBudgetDefault: number;
  providers: AssistantProviderConfig[];
  canManage: boolean;
  canReorder: boolean;
  canEditModels: boolean;
  canManageSlots: boolean;
  canEditBudgets: boolean;
  canReadUsage: boolean;
}

export interface AssistantUsageTotals {
  requests: number;
  cacheHits: number;
  failures: number;
  answered: number;
  avgLatencyMs: number;
  tokensIn: number;
  tokensOut: number;
}

export interface AssistantUsageProvider {
  provider: string;
  requests: number;
  failures: number;
  avgLatencyMs: number;
  tokensIn: number;
  tokensOut: number;
}

export interface AssistantUsageSlot {
  slot: string;
  provider: string;
  model: string;
  requests: number;
  failures: number;
  avgLatencyMs: number;
  tokensIn: number;
  tokensOut: number;
}

export interface AssistantUsageDay {
  day: string;
  requests: number;
  cacheHits: number;
  failures: number;
  tokensIn: number;
  tokensOut: number;
}

export interface AssistantUsageTodayProvider {
  provider: string;
  tokensIn: number;
  tokensOut: number;
}

/** One stored key or env slot aggregated across models, so a key card can show its own totals. */
export interface AssistantUsageKey {
  slot: string;
  provider: string;
  requests: number;
  failures: number;
  avgLatencyMs: number;
  tokensIn: number;
  tokensOut: number;
}

export interface AssistantUsageTodaySlot {
  slot: string;
  provider: string;
  requests: number;
  failures: number;
  tokensIn: number;
  tokensOut: number;
}

export interface AssistantUsage {
  days: number;
  since: string;
  totals: AssistantUsageTotals;
  providers: AssistantUsageProvider[];
  slots: AssistantUsageSlot[];
  keys: AssistantUsageKey[];
  daily: AssistantUsageDay[];
  today: { day: string; providers: AssistantUsageTodayProvider[]; slots: AssistantUsageTodaySlot[] };
}

export interface AssistantSettingsSave {
  order: string[];
  models: Record<string, string>;
  disabledSlots: string[];
  tokenBudgets: Record<string, number>;
  keyBudgets: Record<string, number>;
  expectedVersion: number;
}

export type AssistantKeyStatus = 'PENDING' | 'ACTIVE' | 'DISABLED' | 'REVOKED';

/** Last probe outcome persisted on the key, so a quota failure stays visible after a reload. */
export interface AssistantKeyLastTest {
  status: 'OK' | 'FAILED';
  code: string | null;
  model: string | null;
  latencyMs: number;
  testedAt: string;
}

export interface AssistantKey {
  id: string;
  provider: string;
  providerLabel: string;
  label: string;
  hint: string;
  accountHint: string | null;
  status: AssistantKeyStatus;
  ownerId: string;
  ownerEmail: string;
  ownerDisplayName: string;
  isMine: boolean;
  canReveal: boolean;
  canTest: boolean;
  canRevoke: boolean;
  canManageStatus: boolean;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  lastTest: AssistantKeyLastTest | null;
}

export interface AssistantKeysResponse {
  items: AssistantKey[];
  canManage: boolean;
  canCreate: boolean;
  storageAvailable: boolean;
  limits: { perOwner: number; active: number };
}

export interface AssistantKeyCreate {
  provider: string;
  label: string;
  apiKey: string;
  accountId?: string;
}

export interface AssistantKeySecret {
  apiKey: string;
  accountId: string | null;
}

export interface AssistantKeyTestResult {
  status: 'OK' | 'FAILED';
  code: string | null;
  provider: string;
  model: string;
  latencyMs: number;
  testedAt: string;
}

export interface AssistantKeyTestRequest {
  id: string;
  model?: string;
}

export interface AssistantKeyTestOutcome {
  id: string;
  result: AssistantKeyTestResult | null;
  error: unknown;
}

export interface AssistantPromptState {
  template: string;
  /** DEFAULT means no row in the database: the template shipped in code is in use. */
  source: 'CUSTOM' | 'DEFAULT';
  /** Optimistic-lock token; 0 while no row exists. */
  version: number;
  updatedAt: string | null;
}

export interface AssistantPromptToken {
  token: string;
  required: boolean;
  label: string;
}

export type AssistantPromptRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface AssistantPromptRequest {
  id: string;
  template: string;
  note: string;
  status: AssistantPromptRequestStatus;
  requestedBy: string;
  requesterEmail: string;
  requesterName: string;
  reviewedBy: string | null;
  reviewNote: string;
  baseVersion: number;
  createdAt: string;
  reviewedAt: string | null;
}

export interface AssistantPromptResponse {
  prompt: AssistantPromptState;
  defaultTemplate: string;
  tokens: AssistantPromptToken[];
  maxChars: number;
  canUpdate: boolean;
  canRequest: boolean;
  /** Only filled for a reviewer; empty for request-only admins. */
  pending: AssistantPromptRequest[];
  myRequests: AssistantPromptRequest[];
}

/** The write endpoints answer with the new prompt but never re-send the queues. */
export interface AssistantPromptSaveResponse extends Omit<AssistantPromptResponse, 'pending' | 'myRequests'> {
  changed: boolean;
  item?: AssistantPromptRequest;
  request?: AssistantPromptRequest;
}

@Injectable({ providedIn: 'root' })
export class AdminAssistantService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly base = `${environment.apiBaseUrl}/v1/admin/assistant`;

  getSettings() {
    return this.http.get<AssistantSettingsResponse>(`${this.base}/settings`, { withCredentials: true });
  }

  saveSettings(body: AssistantSettingsSave) {
    return this.auth.getCsrf().pipe(switchMap(csrf =>
      this.http.put<AssistantSettingsResponse>(`${this.base}/settings`, body, {
        withCredentials: true,
        headers: new HttpHeaders({ [csrf.headerName]: csrf.token }),
      })
    ));
  }

  getUsage(days: number) {
    return this.http.get<AssistantUsage>(`${this.base}/usage`, { withCredentials: true, params: { days } });
  }

  getKeys() {
    return this.http.get<AssistantKeysResponse>(`${this.base}/keys`, { withCredentials: true });
  }

  createKey(body: AssistantKeyCreate) {
    return this.auth.getCsrf().pipe(switchMap(csrf =>
      this.http.post<{ item: AssistantKey }>(`${this.base}/keys`, body, {
        withCredentials: true,
        headers: new HttpHeaders({ [csrf.headerName]: csrf.token }),
      })
    ));
  }

  revealKey(id: string) {
    return this.auth.getCsrf().pipe(switchMap(csrf =>
      this.http.post<AssistantKeySecret>(`${this.base}/keys/${encodeURIComponent(id)}/reveal`, {}, {
        withCredentials: true,
        headers: new HttpHeaders({ [csrf.headerName]: csrf.token }),
      })
    ));
  }

  setKeyStatus(id: string, status: 'ACTIVE' | 'DISABLED') {
    return this.auth.getCsrf().pipe(switchMap(csrf =>
      this.http.patch<{ item: AssistantKey; changed: boolean }>(`${this.base}/keys/${encodeURIComponent(id)}`, { status }, {
        withCredentials: true,
        headers: new HttpHeaders({ [csrf.headerName]: csrf.token }),
      })
    ));
  }

  testKey(id: string, model?: string) {
    return this.auth.getCsrf().pipe(switchMap(csrf =>
      this.http.post<AssistantKeyTestResult>(`${this.base}/keys/${encodeURIComponent(id)}/test`, model ? { model } : {}, {
        withCredentials: true,
        headers: new HttpHeaders({ [csrf.headerName]: csrf.token }),
      })
    ));
  }

  /** One CSRF fetch, then three probes in flight; a failing key becomes an outcome instead of an error. */
  testKeys(requests: readonly AssistantKeyTestRequest[]) {
    return this.auth.getCsrf().pipe(switchMap(csrf => from(requests).pipe(
      mergeMap(request => this.http.post<AssistantKeyTestResult>(
        `${this.base}/keys/${encodeURIComponent(request.id)}/test`,
        request.model ? { model: request.model } : {},
        { withCredentials: true, headers: new HttpHeaders({ [csrf.headerName]: csrf.token }) },
      ).pipe(
        map(result => ({ id: request.id, result, error: null }) as AssistantKeyTestOutcome),
        catchError(error => of({ id: request.id, result: null, error } as AssistantKeyTestOutcome)),
      ), 3)
    )));
  }

  revokeKey(id: string) {
    return this.auth.getCsrf().pipe(switchMap(csrf =>
      this.http.delete<{ removed: boolean }>(`${this.base}/keys/${encodeURIComponent(id)}`, {
        withCredentials: true,
        headers: new HttpHeaders({ [csrf.headerName]: csrf.token }),
      })
    ));
  }

  getPrompt() {
    return this.http.get<AssistantPromptResponse>(`${this.base}/prompt`, { withCredentials: true });
  }

  /** Requires assistant:prompt:update; the write is live as soon as it succeeds. */
  savePrompt(body: { template: string; expectedVersion: number }) {
    return this.auth.getCsrf().pipe(switchMap(csrf =>
      this.http.put<AssistantPromptSaveResponse>(`${this.base}/prompt`, body, {
        withCredentials: true,
        headers: new HttpHeaders({ [csrf.headerName]: csrf.token }),
      })
    ));
  }

  /** The default path: the draft waits in the queue until a reviewer approves it. */
  requestPrompt(body: { template: string; expectedVersion: number; note: string }) {
    return this.auth.getCsrf().pipe(switchMap(csrf =>
      this.http.post<AssistantPromptSaveResponse>(`${this.base}/prompt/requests`, body, {
        withCredentials: true,
        headers: new HttpHeaders({ [csrf.headerName]: csrf.token }),
      })
    ));
  }

  approvePromptRequest(id: string, expectedVersion: number) {
    return this.auth.getCsrf().pipe(switchMap(csrf =>
      this.http.post<AssistantPromptSaveResponse>(`${this.base}/prompt/requests/${encodeURIComponent(id)}/approve`, { expectedVersion }, {
        withCredentials: true,
        headers: new HttpHeaders({ [csrf.headerName]: csrf.token }),
      })
    ));
  }

  rejectPromptRequest(id: string, note: string) {
    return this.auth.getCsrf().pipe(switchMap(csrf =>
      this.http.post<AssistantPromptSaveResponse>(`${this.base}/prompt/requests/${encodeURIComponent(id)}/reject`, { note }, {
        withCredentials: true,
        headers: new HttpHeaders({ [csrf.headerName]: csrf.token }),
      })
    ));
  }
}
