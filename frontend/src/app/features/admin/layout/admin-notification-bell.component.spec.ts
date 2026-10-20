import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
      const item = { id: '1', type: 'FEEDBACK_NEW', title: 'Có phản hồi người chơi mới', sourceId: 'feedback', href: '/admin', createdAt: '2026-10-20T00:00:00Z', read: false };
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
});
