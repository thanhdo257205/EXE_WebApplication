import { inject, Injectable, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { catchError, of, switchMap, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  role: 'ADMIN' | 'EDITOR' | 'CUSTOMER';
}

interface Csrf {
  headerName: string;
  token: string;
}

export interface AuthConfig {
  password: boolean;
  google: boolean;
  googleLoginUrl: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  readonly currentUser = signal<CurrentUser | null>(null);
  readonly authConfig = signal<AuthConfig | null>(null);
  readonly checkingSession = signal<boolean>(false);

  private get base() {
    if (!environment.apiBaseUrl) throw new Error('API URL chưa được cấu hình.');
    return `${environment.apiBaseUrl}/v1/auth`;
  }

  config() {
    return this.http.get<AuthConfig>(`${this.base}/config`, { withCredentials: true }).pipe(
      tap(cfg => this.authConfig.set(cfg)),
      catchError(() => of({ password: true, google: false, googleLoginUrl: null }))
    );
  }

  me() {
    return this.http.get<CurrentUser>(`${this.base}/me`, { withCredentials: true }).pipe(
      tap(user => this.currentUser.set(user))
    );
  }

  loadCurrentUser() {
    this.checkingSession.set(true);
    return this.me().pipe(
      tap({
        next: () => this.checkingSession.set(false),
        error: () => {
          this.currentUser.set(null);
          this.checkingSession.set(false);
        },
      })
    );
  }

  login(email: string, password: string, turnstileToken = '') {
    return this.csrf().pipe(
      switchMap(csrf =>
        this.http.post<CurrentUser>(
          `${this.base}/login`,
          { email, password },
          {
            withCredentials: true,
            headers: new HttpHeaders({
              [csrf.headerName]: csrf.token,
              ...(turnstileToken ? { 'X-Turnstile-Token': turnstileToken } : {}),
            }),
          }
        )
      ),
      tap(user => this.currentUser.set(user))
    );
  }

  register(displayName: string, email: string, password: string, turnstileToken = '') {
    return this.csrf().pipe(
      switchMap(csrf =>
        this.http.post<CurrentUser>(
          `${this.base}/register`,
          { displayName, email, password },
          {
            withCredentials: true,
            headers: new HttpHeaders({
              [csrf.headerName]: csrf.token,
              ...(turnstileToken ? { 'X-Turnstile-Token': turnstileToken } : {}),
            }),
          }
        )
      ),
      tap(user => this.currentUser.set(user))
    );
  }

  logout() {
    return this.csrf().pipe(
      switchMap(csrf =>
        this.http.post<void>(`${this.base}/logout`, null, {
          withCredentials: true,
          headers: new HttpHeaders({ [csrf.headerName]: csrf.token }),
        })
      ),
      tap(() => this.currentUser.set(null))
    );
  }

  forgotPassword(email: string) {
    return this.csrf().pipe(switchMap(csrf =>
      this.http.post<{ message: string }>(`${this.base}/forgot-password`, { email }, {
        withCredentials: true,
        headers: new HttpHeaders({ [csrf.headerName]: csrf.token }),
      })
    ));
  }

  resetPassword(token: string, password: string) {
    return this.csrf().pipe(switchMap(csrf =>
      this.http.post<void>(`${this.base}/reset-password`, { token, password }, {
        withCredentials: true,
        headers: new HttpHeaders({ [csrf.headerName]: csrf.token }),
      })
    ), tap(() => this.currentUser.set(null)));
  }

  getCsrf() {
    return this.csrf();
  }

  private csrf() {
    return this.http.get<Csrf>(`${this.base}/csrf`, { withCredentials: true });
  }
}
