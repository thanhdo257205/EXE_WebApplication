import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { adminGuard } from './admin.guard';
import { AuthService } from '../../../core/auth/auth.service';

describe('adminGuard', () => {
  let auth: AuthService;
  let navigatedUrl: any = null;

  beforeEach(() => {
    navigatedUrl = null;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: Router,
          useValue: {
            navigate: (commands: any[], extras?: any) => {
              navigatedUrl = { commands, extras };
              return Promise.resolve(true);
            },
          },
        },
      ],
    });
    auth = TestBed.inject(AuthService);
  });

  it('allows access when user is ADMIN', () => {
    auth.currentUser.set({ id: '1', email: 'admin@test.test', displayName: 'Admin', role: 'ADMIN' });
    const result = TestBed.runInInjectionContext(() => adminGuard({} as any, { url: '/admin' } as any));
    expect(result).toBe(true);
    expect(navigatedUrl).toBeNull();
  });

  it('blocks and redirects when user is CUSTOMER', () => {
    auth.currentUser.set({ id: '2', email: 'cust@test.test', displayName: 'Customer', role: 'CUSTOMER' });
    const result = TestBed.runInInjectionContext(() => adminGuard({} as any, { url: '/admin' } as any));
    expect(result).toBe(false);
    expect(navigatedUrl?.commands).toEqual(['/']);
    expect(navigatedUrl?.extras?.queryParams).toEqual({ error: 'forbidden' });
  });
});
