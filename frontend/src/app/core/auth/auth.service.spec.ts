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
    vi.useRealTimers();
    http.verify();
  });

  it('shares login preparation and reuses readiness briefly without starting OAuth', () => {
    const ready = { password: true, google: true, googleLoginUrl: '/api/v1/auth/oauth2/authorization/google' };
    const first = vi.fn(), second = vi.fn();
    auth.prepareLogin().subscribe(first);
    auth.prepareLogin().subscribe(second);
    http.expectOne('/api/v1/auth/config').flush(ready);
    expect(first).toHaveBeenCalledWith(ready);
    expect(second).toHaveBeenCalledWith(ready);
    auth.prepareLogin().subscribe();
    http.expectNone('/api/v1/auth/config');
    http.expectNone('/api/v1/auth/oauth2/authorization/google');
    expect(auth.authConfig()).toEqual(ready);
  });

  it('expires prepared readiness and cancels unneeded preparation when its last observer leaves', () => {
    vi.useFakeTimers();
    auth.prepareLogin().subscribe();
    http.expectOne('/api/v1/auth/config').flush({ password: true, google: true, googleLoginUrl: '/api/v1/auth/oauth2/authorization/google' });
    vi.advanceTimersByTime(30_001);
    const subscription = auth.prepareLogin().subscribe();
    const request = http.expectOne('/api/v1/auth/config');
    subscription.unsubscribe();
    expect(request.cancelled).toBe(true);
    auth.prepareLogin().subscribe();
    http.expectOne('/api/v1/auth/config').flush({ password: true, google: false, googleLoginUrl: null });
  });

  it('retries only transient preparation reads and stops after two retries', () => {
    vi.useFakeTimers();
    const error = vi.fn();
    auth.prepareLogin().subscribe({ error });
    for (let attempt = 0; attempt < 3; attempt++) {
      http.expectOne('/api/v1/auth/config').flush({}, { status: 503, statusText: 'Unavailable' });
      if (attempt < 2) vi.advanceTimersByTime((attempt + 1) * 1_000);
    }
    expect(error).toHaveBeenCalledOnce();
    http.expectNone('/api/v1/auth/oauth2/authorization/google');
    auth.prepareLogin().subscribe();
    http.expectOne('/api/v1/auth/config').flush({ password: true, google: true, googleLoginUrl: '/api/v1/auth/oauth2/authorization/google' });
  });

  it('never retries rate-limited or forbidden preparations', () => {
    for (const status of [403, 429]) {
      const error = vi.fn();
      auth.prepareLogin().subscribe({ error });
      http.expectOne('/api/v1/auth/config').flush({}, { status, statusText: 'Rejected' });
      expect(error).toHaveBeenCalledOnce();
      http.expectNone('/api/v1/auth/config');
    }
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

  it('reads fine-grained rights only from the server-provided admin session', () => {
    expect(auth.hasPermission('content:read')).toBe(false);
    auth.currentUser.set({ id: '1', email: 'm@example.test', displayName: 'M', role: 'CUSTOMER', permissions: ['content:read'] });
    expect(auth.hasPermission('content:read')).toBe(false);
    expect(auth.hasAnyPermission(['content:read', 'users:read'])).toBe(false);

    auth.currentUser.set({ id: '2', email: 'a@example.test', displayName: 'A', role: 'ADMIN', adminLevel: 'DELEGATED', permissions: ['users:read'] });
    expect(auth.hasPermission('users:read')).toBe(true);
    expect(auth.hasPermission('content:read')).toBe(false);
    expect(auth.hasAnyPermission(['content:read', 'users:read'])).toBe(true);
    expect(auth.hasAnyPermission([])).toBe(false);

    // An admin whose /me payload predates the permission feature behaves like a locked co-admin.
    auth.currentUser.set({ id: '3', email: 'b@example.test', displayName: 'B', role: 'ADMIN' });
    expect(auth.hasPermission('users:read')).toBe(false);
  });

  it('stores the permission list delivered by /auth/me', () => {
    auth.loadCurrentUser().subscribe();
    http.expectOne('/api/v1/auth/me').flush({
      id: '2', email: 'a@example.test', displayName: 'A', role: 'ADMIN',
      adminLevel: 'DELEGATED', permissions: ['content:read', 'cards:update'],
    });
    expect(auth.currentUser()?.permissions).toEqual(['content:read', 'cards:update']);
    expect(auth.hasPermission('cards:update')).toBe(true);
    expect(auth.checkingSession()).toBe(false);
  });
});
