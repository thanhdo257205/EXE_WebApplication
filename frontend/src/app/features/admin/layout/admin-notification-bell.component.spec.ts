import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ADMIN_EVENT_SOURCE } from '../../../core/admin/admin-notifications.service';
import { AuthService } from '../../../core/auth/auth.service';
import { AdminNotificationBellComponent } from './admin-notification-bell.component';

describe('Admin notification bell', () => {
  it('renders a real notification, marks it read with CSRF and closes with Escape', async () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const source = new EventTarget() as EventSource;
    source.close = vi.fn();
    await TestBed.configureTestingModule({ imports: [AdminNotificationBellComponent], providers: [
      provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: ADMIN_EVENT_SOURCE, useValue: () => source },
    ] }).compileComponents();
    TestBed.inject(AuthService).currentUser.set({ id: 'admin', email: 'admin@example.test', displayName: 'Admin', role: 'ADMIN' });
    const fixture = TestBed.createComponent(AdminNotificationBellComponent);
    const http = TestBed.inject(HttpTestingController);
    try {
      fixture.detectChanges();
      source.dispatchEvent(new MessageEvent('summary', { data: JSON.stringify({ latestId: '1', totalElements: 1, unreadCount: 1 }) }));
      const item = { id: '1', type: 'FEEDBACK_NEW' as const, title: 'Có phản hồi người chơi mới', sourceId: 'feedback', href: '/admin', createdAt: '2026-10-20T00:00:00Z', read: false };
      const response = { items: [item], page: 0, size: 20, totalPages: 1, totalElements: 1, unreadCount: 1 };
      http.expectOne(request => request.url === '/api/v1/admin/notifications').flush(response);
      const trigger: HTMLButtonElement = fixture.nativeElement.querySelector('.notification-trigger');
      trigger.click(); fixture.detectChanges();
      expect(trigger.textContent).toContain('(1)');
      expect(fixture.nativeElement.textContent).toContain('Có phản hồi người chơi mới');
      const markRead = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(button => button.textContent?.includes('Đánh dấu đã đọc'))!;
      markRead.click(); http.expectOne('/api/v1/auth/csrf').flush({ headerName: 'X-XSRF-TOKEN', token: 'test' });
      http.expectOne('/api/v1/admin/notifications/1/read').flush({ id: '1', read: true });
      http.expectOne(request => request.url === '/api/v1/admin/notifications').flush({ ...response, unreadCount: 0, items: [{ ...item, read: true }] });
      fixture.detectChanges(); expect(trigger.textContent).toContain('(0)');
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('#admin-notifications-panel')).toBeNull();
    } finally { fixture.destroy(); http.verify({ ignoreCancelled: true }); vi.restoreAllMocks(); }
  });

  it('renders mixed events, binds registration links to /admin/users, and marks read opaque registration IDs via CSRF', async () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const source = new EventTarget() as EventSource;
    source.close = vi.fn();
    await TestBed.configureTestingModule({ imports: [AdminNotificationBellComponent], providers: [
      provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: ADMIN_EVENT_SOURCE, useValue: () => source },
    ] }).compileComponents();
    TestBed.inject(AuthService).currentUser.set({ id: 'admin', email: 'admin@example.test', displayName: 'Admin', role: 'ADMIN' });
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(AdminNotificationBellComponent);
    const http = TestBed.inject(HttpTestingController);
    try {
      fixture.detectChanges();
      source.dispatchEvent(new MessageEvent('summary', { data: JSON.stringify({ latestId: '1:1', totalElements: 2, unreadCount: 2 }) }));
      const regItem = { id: 'registration:1', type: 'USER_REGISTERED' as const, title: 'Có tài khoản mới đăng ký', sourceId: 'user-1', href: '/admin/users', createdAt: '2026-10-24T12:00:00Z', read: false };
      const fbItem = { id: '1', type: 'FEEDBACK_NEW' as const, title: 'Có phản hồi người chơi mới', sourceId: 'feedback-1', href: '/admin', createdAt: '2026-10-24T10:00:00Z', read: false };
      const response = { items: [regItem, fbItem], page: 0, size: 20, totalPages: 1, totalElements: 2, unreadCount: 2 };
      http.expectOne(request => request.url === '/api/v1/admin/notifications').flush(response);
      const trigger: HTMLButtonElement = fixture.nativeElement.querySelector('.notification-trigger');
      trigger.click(); fixture.detectChanges();
      expect(trigger.textContent).toContain('(2)');
      expect(fixture.nativeElement.textContent).toContain('Có tài khoản mới đăng ký');
      expect(fixture.nativeElement.textContent).toContain('Có phản hồi người chơi mới');

      const links = Array.from(fixture.nativeElement.querySelectorAll('li a') as NodeListOf<HTMLAnchorElement>);
      expect(links).toHaveLength(2);
      expect(links[0].getAttribute('href') || links[0].pathname).toContain('/admin/users');
      expect(links[1].getAttribute('href') || links[1].pathname).toBe('/admin');

      links[0].click();
      http.expectOne('/api/v1/auth/csrf').flush({ headerName: 'X-XSRF-TOKEN', token: 'test-csrf' });
      http.expectOne('/api/v1/admin/notifications/registration:1/read').flush({ id: 'registration:1', read: true });
      http.expectOne(request => request.url === '/api/v1/admin/notifications').flush({
        ...response,
        unreadCount: 1,
        items: [{ ...regItem, read: true }, fbItem],
      });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('#admin-notifications-panel')).toBeNull();
      await fixture.whenStable();
    } finally { fixture.destroy(); http.verify({ ignoreCancelled: true }); vi.restoreAllMocks(); }
  });
});
