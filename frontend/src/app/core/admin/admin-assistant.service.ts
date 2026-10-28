import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { switchMap } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';

export interface AssistantProviderSlot {
  slot: string;
  disabled: boolean;
}

export interface AssistantProviderConfig {
  id: string;
  label: string;
  defaultModel: string;
  slots: AssistantProviderSlot[];
}

export interface AssistantSettings {
  order: string[];
  models: Record<string, string>;
  disabledSlots: string[];
  version: number;
  updatedAt: string | null;
}

export interface AssistantSettingsResponse {
  settings: AssistantSettings;
  providers: AssistantProviderConfig[];
  canManage: boolean;
}

export interface AssistantUsageTotals {
  requests: number;
  cacheHits: number;
  failures: number;
  answered: number;
  avgLatencyMs: number;
}

export interface AssistantUsageProvider {
  provider: string;
  requests: number;
  failures: number;
  avgLatencyMs: number;
}

export interface AssistantUsageSlot {
  slot: string;
  provider: string;
  model: string;
  requests: number;
  failures: number;
  avgLatencyMs: number;
}

export interface AssistantUsageDay {
  day: string;
  requests: number;
  cacheHits: number;
  failures: number;
}

export interface AssistantUsage {
  days: number;
  since: string;
  totals: AssistantUsageTotals;
  providers: AssistantUsageProvider[];
  slots: AssistantUsageSlot[];
  daily: AssistantUsageDay[];
}

export interface AssistantSettingsSave {
  order: string[];
  models: Record<string, string>;
  disabledSlots: string[];
  expectedVersion: number;
}

export type AssistantKeyStatus = 'PENDING' | 'ACTIVE' | 'DISABLED' | 'REVOKED';

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
  canManageStatus: boolean;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
}

export interface AssistantKeysResponse {
  items: AssistantKey[];
  canManage: boolean;
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

  revokeKey(id: string) {
    return this.auth.getCsrf().pipe(switchMap(csrf =>
      this.http.delete<{ removed: boolean }>(`${this.base}/keys/${encodeURIComponent(id)}`, {
        withCredentials: true,
        headers: new HttpHeaders({ [csrf.headerName]: csrf.token }),
      })
    ));
  }
}
