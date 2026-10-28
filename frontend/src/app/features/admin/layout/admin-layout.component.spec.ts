import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminLayoutComponent } from './admin-layout.component';
import { ADMIN_EVENT_SOURCE } from '../../../core/admin/admin-notifications.service';
import { AuthService } from '../../../core/auth/auth.service';

@Component({ selector: 'app-blank', template: '' })
class BlankComponent {}

describe('AdminLayoutComponent permissions', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  let router: Router;

  const account = (permissions: string[]) => ({
    id: 'admin', email: 'admin@example.test', displayName: 'Quản trị', role: 'ADMIN' as const,
    adminLevel: permissions.includes('permissions:manage') ? 'OWNER' as const : 'DELEGATED' as const,
    permissions,
  });

  /** The bell streams over SSE; a silent fake source keeps this spec about navigation. */
  const fakeSource = () => {
    const source = new EventTarget() as EventSource;
    source.close = vi.fn();
    source.onerror = null;
    return () => source;
  };

  const render = (permissions: string[]) => {
    auth.currentUser.set(account(permissions));
    const fixture = TestBed.createComponent(AdminLayoutComponent);
    // Boot refresh of /auth/me, so an owner's edit reaches the nav without a manual reload.
    http.expectOne('/api/v1/auth/me').flush(account(permissions));
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  const navLabels = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('.nav-label')).map(node => node.textContent?.trim());

  beforeEach(() => {
    history.replaceState(null, '');
    TestBed.configureTestingModule({
      imports: [AdminLayoutComponent],
      providers: [
        provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting(),
        provideRouter([{ path: '**', component: BlankComponent }]),
        { provide: ADMIN_EVENT_SOURCE, useValue: fakeSource() },
      ],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  it('hides sections the account has no permission for', () => {
    const { el } = render(['content:read']);
    const labels = navLabels(el);
    expect(labels).toContain('Thẻ & Bộ thẻ (148 thẻ)');
    expect(labels).toContain('Wiki & Bài viết');
    expect(labels).not.toContain('Tài khoản cư dân');
    expect(labels).not.toContain('Trợ lý AI & hạn mức');
    // Sections without a backend permission gate stay open for every admin.
    expect(labels).toContain('Tổng quan & Hàng chờ');
    expect(labels).toContain('Đơn hàng & Vận chuyển');
    expect(labels).toContain('Hệ thống & Audit Log');
  });

  it('shows the gated sections once the owner grants the reads', () => {
    const { el } = render(['content:read', 'users:read', 'assistant:read', 'permissions:manage']);
    const labels = navLabels(el);
    expect(labels).toContain('Tài khoản cư dân');
    expect(labels).toContain('Trợ lý AI & hạn mức');
    expect(labels).toHaveLength(10);
  });

  it('locks a permission-less co-admin out of every gated section', () => {
    const { el } = render([]);
    expect(navLabels(el)).toEqual([
      'Tổng quan & Hàng chờ', 'Sản phẩm & Tồn kho', 'Đơn hàng & Vận chuyển',
      'Thanh toán PayOS', 'Hệ thống & Audit Log',
    ]);
  });

  it('explains a guard redirect and dismisses on demand', async () => {
    const { fixture, el } = render(['users:read']);
    expect(el.querySelector('.permission-notice')).toBeNull();

    history.replaceState({ thieuQuyen: 'cards' }, '');
    await router.navigateByUrl('/admin/cards');
    fixture.detectChanges();
    const notice = el.querySelector('.permission-notice');
    expect(notice?.getAttribute('role')).toBe('alert');
    expect(notice?.textContent).toContain('chưa có quyền mở mục “Thẻ & Bộ thẻ (148 thẻ)”');
    expect(notice?.textContent).toContain('Tài khoản cư dân');

    (el.querySelector('.permission-notice-close') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.permission-notice')).toBeNull();
    expect(fixture.componentInstance.permissionNotice()).toBe('');
  });

  it('stays quiet on a navigation that carries no blocked section', async () => {
    const { fixture, el } = render(['content:read']);
    await router.navigateByUrl('/admin/cards');
    fixture.detectChanges();
    expect(el.querySelector('.permission-notice')).toBeNull();
  });
});
