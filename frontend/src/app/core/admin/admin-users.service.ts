import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { switchMap } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';

export interface AdminAccount {
  id: string;
  email: string;
  displayName: string;
  role: 'ADMIN' | 'EDITOR' | 'CUSTOMER';
  adminLevel: 'OWNER' | 'DELEGATED' | null;
  enabled: boolean;
  version: number;
  createdAt: string;
  /** Present for every ADMIN account when the requester holds users:read. */
  permissions?: string[];
  permissionsVersion?: number;
  customPermissions?: boolean;
  /** Who first stored this set; null means the main admin wrote it or no custom set exists yet. */
  permissionsGrantedBy?: string | null;
  /** Server-side answer to "may this viewer edit that account's set"; the UI never re-derives it. */
  permissionsEditable?: boolean;
}
export interface AdminAccountsPage {
  items: AdminAccount[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  canManageRoles: boolean;
  canManagePermissions: boolean;
}
export interface AdminInvite {
  id: string;
  email: string;
  invitedByName: string | null;
  createdAt: string;
}
export interface AdminInvitesResult {
  items: AdminInvite[];
  canManageRoles: boolean;
}
export type AdminInviteResult =
  | { status: 'INVITED'; invite: AdminInvite }
  | { status: 'PROMOTED'; account: AdminAccount };
export interface AdminPermissionsResult {
  account: AdminAccount;
  changed: boolean;
}

@Injectable({ providedIn: 'root' })
export class AdminUsersService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly base = `${environment.apiBaseUrl}/v1/admin/users`;

  list(page = 0, query = '') {
    return this.http.get<AdminAccountsPage>(this.base, {
      withCredentials: true,
      params: new HttpParams().set('page', page).set('size', 20).set('q', query),
    });
  }

  changeRole(account: AdminAccount, role: 'ADMIN' | 'CUSTOMER') {
    return this.auth.getCsrf().pipe(switchMap(csrf =>
      this.http.put<{ item: AdminAccount; changed: boolean }>(`${this.base}/${account.id}/role`, {
        role, expectedVersion: account.version,
      }, {
        withCredentials: true,
        headers: new HttpHeaders({ [csrf.headerName]: csrf.token }),
      })
    ));
  }

  /** Needs permissions:manage; the server also refuses the caller's own account and their granters. */
  updatePermissions(account: AdminAccount, permissions: readonly string[]) {
    return this.auth.getCsrf().pipe(switchMap(csrf =>
      this.http.put<AdminPermissionsResult>(`${this.base}/${account.id}/permissions`, {
        permissions: [...permissions], expectedVersion: account.permissionsVersion ?? 0,
      }, {
        withCredentials: true,
        headers: new HttpHeaders({ [csrf.headerName]: csrf.token }),
      })
    ));
  }

  listInvites() {
    return this.http.get<AdminInvitesResult>(`${this.base}/invites`, { withCredentials: true });
  }
  invite(email: string) {
    return this.auth.getCsrf().pipe(switchMap(csrf =>
      this.http.post<AdminInviteResult>(`${this.base}/invites`, { email }, {
        withCredentials: true,
        headers: new HttpHeaders({ [csrf.headerName]: csrf.token }),
      })
    ));
  }

  revokeInvite(id: string) {
    return this.auth.getCsrf().pipe(switchMap(csrf =>
      this.http.delete<{ removed: boolean }>(`${this.base}/invites/${encodeURIComponent(id)}`, {
        withCredentials: true,
        headers: new HttpHeaders({ [csrf.headerName]: csrf.token }),
      })
    ));
  }
}
