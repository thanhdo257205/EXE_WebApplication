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
}
export interface AdminAccountsPage {
  items: AdminAccount[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  canManageRoles: boolean;
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
}
