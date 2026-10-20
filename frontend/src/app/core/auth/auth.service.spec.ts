import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from './auth.service';

describe('Authentication API contract', () => {
  let auth: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('obtains a fresh CSRF token before login and logout and sends credentials', () => {
    auth.login('member@example.test', 'test-password', 'challenge-token').subscribe();
    http.expectOne('/api/v1/auth/csrf').flush({ headerName: 'X-XSRF-TOKEN', token: 'csrf-before-login' });
    const login = http.expectOne('/api/v1/auth/login');
    expect(login.request.withCredentials).toBe(true);
    expect(login.request.headers.get('X-XSRF-TOKEN')).toBe('csrf-before-login');
    expect(login.request.headers.get('X-Turnstile-Token')).toBe('challenge-token');
    login.flush({ id: 'test-id', email: 'member@example.test', displayName: 'Member', role: 'CUSTOMER' });

    expect(auth.currentUser()?.email).toBe('member@example.test');

    auth.logout().subscribe();
    http.expectOne('/api/v1/auth/csrf').flush({ headerName: 'X-XSRF-TOKEN', token: 'csrf-after-login' });
    const logout = http.expectOne('/api/v1/auth/logout');
    expect(logout.request.headers.get('X-XSRF-TOKEN')).toBe('csrf-after-login');
    expect(logout.request.withCredentials).toBe(true);
    logout.flush(null, { status: 204, statusText: 'No Content' });

    expect(auth.currentUser()).toBeNull();
  });

  it('sends recovery email and reset token only in CSRF-protected request bodies', () => {
    auth.forgotPassword('member@example.test').subscribe();
    http.expectOne('/api/v1/auth/csrf').flush({ headerName: 'X-XSRF-TOKEN', token: 'csrf-recovery' });
    const forgot = http.expectOne('/api/v1/auth/forgot-password');
    expect(forgot.request.body).toEqual({ email: 'member@example.test' });
    expect(forgot.request.withCredentials).toBe(true);
    expect(forgot.request.headers.get('X-XSRF-TOKEN')).toBe('csrf-recovery');
    forgot.flush({ message: 'Generic acknowledgement' }, { status: 202, statusText: 'Accepted' });
    auth.currentUser.set({ id: 'id', email: 'member@example.test', displayName: 'Member', role: 'CUSTOMER' });
    auth.resetPassword('a'.repeat(43), 'New-password-123!').subscribe();
    http.expectOne('/api/v1/auth/csrf').flush({ headerName: 'X-XSRF-TOKEN', token: 'csrf-reset' });
    const reset = http.expectOne('/api/v1/auth/reset-password');
    expect(reset.request.body).toEqual({ token: 'a'.repeat(43), password: 'New-password-123!' });
    expect(reset.request.headers.get('X-XSRF-TOKEN')).toBe('csrf-reset');
    reset.flush(null, { status: 204, statusText: 'No Content' });
    expect(auth.currentUser()).toBeNull();
  });

  it('obtains a fresh CSRF token before register and sets current user', () => {
    auth.register('New User', 'new@example.test', 'StrongPass123!').subscribe();
    http.expectOne('/api/v1/auth/csrf').flush({ headerName: 'X-XSRF-TOKEN', token: 'csrf-register' });
    const reg = http.expectOne('/api/v1/auth/register');
    expect(reg.request.withCredentials).toBe(true);
    expect(reg.request.headers.get('X-XSRF-TOKEN')).toBe('csrf-register');
    expect(reg.request.body).toEqual({
      displayName: 'New User',
      email: 'new@example.test',
      password: 'StrongPass123!',
    });
    reg.flush({ id: 'user-id', email: 'new@example.test', displayName: 'New User', role: 'CUSTOMER' });

    expect(auth.currentUser()?.displayName).toBe('New User');
  });
});
