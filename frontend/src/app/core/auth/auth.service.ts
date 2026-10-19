import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CurrentUser { id: string; email: string; displayName: string; role: 'ADMIN' | 'EDITOR' | 'CUSTOMER'; }
interface Csrf { headerName: string; token: string; }
export interface AuthConfig { password: boolean; google: boolean; googleLoginUrl: string | null; }

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private get base() {
    if (!environment.apiBaseUrl) throw new Error('API URL chưa được cấu hình.');
    return `${environment.apiBaseUrl}/v1/auth`;
  }
  config() { return this.http.get<AuthConfig>(`${this.base}/config`, { withCredentials: true }); }
  me() { return this.http.get<CurrentUser>(`${this.base}/me`, { withCredentials: true }); }
  login(email: string, password: string, turnstileToken: string) {
    return this.csrf().pipe(switchMap(csrf => this.http.post<CurrentUser>(`${this.base}/login`, { email, password }, {
      withCredentials: true,
      headers: new HttpHeaders({ [csrf.headerName]: csrf.token, 'X-Turnstile-Token': turnstileToken }),
    })));
  }
  logout() {
    return this.csrf().pipe(switchMap(csrf => this.http.post<void>(`${this.base}/logout`, null, {
      withCredentials: true, headers: new HttpHeaders({ [csrf.headerName]: csrf.token }),
    })));
  }
  private csrf() { return this.http.get<Csrf>(`${this.base}/csrf`, { withCredentials: true }); }
}
