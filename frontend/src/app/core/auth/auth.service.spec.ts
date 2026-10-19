import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from './auth.service';

describe('Authentication API contract', () => {
  it('obtains a fresh CSRF token before login and logout and sends credentials', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const auth = TestBed.inject(AuthService);
    const http = TestBed.inject(HttpTestingController);
    auth.login('member@example.test', 'test-password', 'challenge-token').subscribe();
    http.expectOne('/api/v1/auth/csrf').flush({ headerName: 'X-XSRF-TOKEN', token: 'csrf-before-login' });
    const login = http.expectOne('/api/v1/auth/login');
    expect(login.request.withCredentials).toBe(true);
    expect(login.request.headers.get('X-XSRF-TOKEN')).toBe('csrf-before-login');
    expect(login.request.headers.get('X-Turnstile-Token')).toBe('challenge-token');
    login.flush({ id: 'test-id', email: 'member@example.test', displayName: 'Member', role: 'CUSTOMER' });
    auth.logout().subscribe();
    http.expectOne('/api/v1/auth/csrf').flush({ headerName: 'X-XSRF-TOKEN', token: 'csrf-after-login' });
    const logout = http.expectOne('/api/v1/auth/logout');
    expect(logout.request.headers.get('X-XSRF-TOKEN')).toBe('csrf-after-login');
    expect(logout.request.withCredentials).toBe(true);
    logout.flush(null, { status: 204, statusText: 'No Content' });
    http.verify();
  });
});
