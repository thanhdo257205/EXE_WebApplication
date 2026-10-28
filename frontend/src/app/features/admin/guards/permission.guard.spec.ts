import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { permissionGuard } from './permission.guard';
import { AuthService } from '../../../core/auth/auth.service';

describe('permissionGuard', () => {
  let auth: AuthService;
  let navigated: any = null;

  beforeEach(() => {
    navigated = null;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: Router,
          useValue: {
            navigate: (commands: any[], extras?: any) => {
              navigated = { commands, extras };
              return Promise.resolve(true);
            },
          },
        },
      ],
    });
    auth = TestBed.inject(AuthService);
  });

  const run = (permissions: string[] | undefined, url: string) =>
    TestBed.runInInjectionContext(() => permissionGuard({ data: { permissions } } as any, { url } as any));

  it('opens a section whose permission the account holds', () => {
    auth.currentUser.set({ id: '1', email: 'a@test.test', displayName: 'A', role: 'ADMIN', permissions: ['content:read'] });
    expect(run(['content:read'], '/admin/cards')).toBe(true);
    expect(navigated).toBeNull();
  });

  it('accepts any-of requirements', () => {
    auth.currentUser.set({ id: '1', email: 'a@test.test', displayName: 'A', role: 'ADMIN', permissions: ['assistant:read'] });
    expect(run(['content:read', 'assistant:read'], '/admin/assistant')).toBe(true);
    expect(navigated).toBeNull();
  });

  it('routes a missing permission back to the overview with the blocked section name', () => {
    auth.currentUser.set({ id: '1', email: 'a@test.test', displayName: 'A', role: 'ADMIN', permissions: ['users:read'] });
    expect(run(['content:read'], '/admin/cards')).toBe(false);
    expect(navigated.commands).toEqual(['/admin']);
    expect(navigated.extras.state).toEqual({ thieuQuyen: 'cards' });
  });

  it('names the overview itself when a root admin url is blocked', () => {
    auth.currentUser.set({ id: '1', email: 'a@test.test', displayName: 'A', role: 'ADMIN', permissions: [] });
    expect(run(['content:read'], '/admin')).toBe(false);
    expect(navigated.extras.state).toEqual({ thieuQuyen: 'trang' });
  });

  it('never locks out sections that declare no permission', () => {
    auth.currentUser.set({ id: '1', email: 'a@test.test', displayName: 'A', role: 'ADMIN', permissions: [] });
    expect(run(undefined, '/admin/system')).toBe(true);
    expect(run([], '/admin/orders')).toBe(true);
    expect(navigated).toBeNull();
  });

  it('treats a member account as having no admin permission', () => {
    auth.currentUser.set({ id: '1', email: 'a@test.test', displayName: 'A', role: 'CUSTOMER', permissions: ['content:read'] });
    expect(run(['content:read'], '/admin/cards')).toBe(false);
    expect(navigated.commands).toEqual(['/admin']);
  });
});
