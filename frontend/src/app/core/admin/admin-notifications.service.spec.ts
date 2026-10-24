import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ADMIN_EVENT_SOURCE, AdminNotificationsService } from './admin-notifications.service';
import { AuthService } from '../auth/auth.service';

export class FakeNotificationSource extends EventTarget {
  onerror: ((event: Event) => void) | null = null;
  close = vi.fn();
  emit(name: string, data: object) { this.dispatchEvent(new MessageEvent(name, { data: JSON.stringify(data) })); }
}
const root = '/api/v1/admin/notifications';
const summary = { latestId: '1', totalElements: 1, unreadCount: 1 };
const item = { id: '1', type: 'FEEDBACK_NEW' as const, title: 'Có phản hồi người chơi mới', sourceId: 'feedback', href: '/admin', createdAt: '2026-10-20T00:00:00Z', read: false };
const page = { items: [item], totalElements: 1, totalPages: 1, unreadCount: 1, page: 0, size: 20 };

describe('Admin notification connection lifecycle', () => {
  let service: AdminNotificationsService, http: HttpTestingController, sources: FakeNotificationSource[];
  beforeEach(() => {
    sources = [];
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    TestBed.configureTestingModule({ providers: [AdminNotificationsService, provideHttpClient(), provideHttpClientTesting(),
      { provide: ADMIN_EVENT_SOURCE, useValue: () => { const source = new FakeNotificationSource(); sources.push(source); return source as unknown as EventSource; } },
    ] });
    TestBed.inject(AuthService).currentUser.set({ id: 'admin', email: 'admin@example.test', displayName: 'Admin', role: 'ADMIN' });
    service = TestBed.inject(AdminNotificationsService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { service.stop(); http.verify({ ignoreCancelled: true }); vi.useRealTimers(); vi.restoreAllMocks(); });
  function list() { return http.expectOne(request => request.url === root); }

  it('loads durable notifications on SSE summary and deduplicates unchanged summaries', () => {
    service.start('admin'); service.start('admin');
    expect(sources).toHaveLength(1);
    sources[0].emit('summary', summary);
    const request = list(); expect(request.request.params.get('size')).toBe('20'); expect(request.request.withCredentials).toBe(true);
    request.flush(page);
    expect(service.items()[0].title).toContain('phản hồi'); expect(service.unreadCount()).toBe(1);
    sources[0].emit('summary', summary); http.expectNone(root);
    expect(service.status()).toBe('live');
  });
  it('catches up after reconnect even when summary has the same ID and counts', () => {
    vi.useFakeTimers(); service.start('admin');
    sources[0].emit('summary', summary); list().flush(page);
    sources[0].emit('renew', { reconnect: true }); expect(sources[0].close).toHaveBeenCalled();
    vi.advanceTimersByTime(1_000); expect(sources).toHaveLength(2);
    sources[1].emit('summary', summary); list().flush(page);
    expect(service.status()).toBe('live');
  });
  it('marks read with CSRF and keeps the unread count until the server confirms it', () => {
    service.start('admin'); sources[0].emit('summary', summary); list().flush(page);
    service.markRead(service.items()[0]);
    http.expectOne('/api/v1/auth/csrf').flush({ headerName: 'X-XSRF-TOKEN', token: 'test-csrf' });
    const mutation = http.expectOne(`${root}/1/read`);
    expect(mutation.request.method).toBe('POST'); expect(mutation.request.headers.get('X-XSRF-TOKEN')).toBe('test-csrf');
    expect(service.unreadCount()).toBe(1);
    mutation.flush({ id: '1', read: true }); list().flush({ ...page, items: [{ ...item, read: true }], unreadCount: 0 });
    expect(service.unreadCount()).toBe(0);
  });
  it('handles USER_REGISTERED event and marks read with opaque registration ID via CSRF', () => {
    service.start('admin');
    const compositeSummary = { latestId: '1:1', totalElements: 2, unreadCount: 2 };
    sources[0].emit('summary', compositeSummary);
    const regItem = {
      id: 'registration:1',
      type: 'USER_REGISTERED' as const,
      title: 'Có tài khoản mới đăng ký',
      sourceId: 'user-uuid-1',
      href: '/admin/users',
      createdAt: '2026-10-24T12:00:00Z',
      read: false,
    };
    const mixedPage = {
      items: [regItem, item],
      totalElements: 2,
      totalPages: 1,
      unreadCount: 2,
      page: 0,
      size: 20,
    };
    list().flush(mixedPage);
    expect(service.items()).toHaveLength(2);
    expect(service.items()[0].id).toBe('registration:1');
    expect(service.items()[0].type).toBe('USER_REGISTERED');
    expect(service.items()[0].href).toBe('/admin/users');
    expect(service.unreadCount()).toBe(2);

    service.markRead(service.items()[0]);
    http.expectOne('/api/v1/auth/csrf').flush({ headerName: 'X-XSRF-TOKEN', token: 'test-csrf' });
    const mutation = http.expectOne(`${root}/registration:1/read`);
    expect(mutation.request.method).toBe('POST');
    expect(mutation.request.headers.get('X-XSRF-TOKEN')).toBe('test-csrf');
    expect(mutation.request.withCredentials).toBe(true);
    mutation.flush({ id: 'registration:1', read: true });
    list().flush({ ...mixedPage, items: [{ ...regItem, read: true }, item], unreadCount: 1 });
    expect(service.unreadCount()).toBe(1);
    expect(service.items()[0].read).toBe(true);
  });
  it('closes on hidden tabs and reloads missed data when visible again', () => {
    service.start('admin'); sources[0].emit('summary', summary); list().flush(page);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true); document.dispatchEvent(new Event('visibilitychange'));
    expect(sources[0].close).toHaveBeenCalled(); expect(service.status()).toBe('paused');
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false); document.dispatchEvent(new Event('visibilitychange'));
    expect(sources).toHaveLength(2); sources[1].emit('summary', { ...summary, unreadCount: 2, totalElements: 2, latestId: '2' });
    list().flush({ ...page, unreadCount: 2, totalElements: 2 }); expect(service.unreadCount()).toBe(2);
  });
  it('stops and clears private data on auth-required without a reconnect loop', () => {
    vi.useFakeTimers(); service.start('admin'); sources[0].emit('summary', summary); list().flush(page);
    sources[0].emit('auth-required', {}); vi.advanceTimersByTime(120_000);
    expect(service.status()).toBe('auth-required'); expect(service.items()).toEqual([]); expect(service.unreadCount()).toBe(0);
    expect(sources).toHaveLength(1);
  });
  it('probes a failed stream and stops for 401; transient errors reconnect with backoff', () => {
    vi.useFakeTimers(); service.start('admin'); sources[0].onerror?.(new Event('error'));
    http.expectOne('/api/v1/auth/me').flush({}, { status: 503, statusText: 'Unavailable' });
    vi.advanceTimersByTime(4_999); expect(sources).toHaveLength(1);
    vi.advanceTimersByTime(1); expect(sources).toHaveLength(2);
    sources[1].onerror?.(new Event('error'));
    http.expectOne('/api/v1/auth/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    vi.advanceTimersByTime(120_000); expect(sources).toHaveLength(2); expect(service.status()).toBe('auth-required');
  });
  it('cancels stale reads and ignores late source events after leaving the layout', () => {
    service.start('admin'); sources[0].emit('summary', summary); const pending = list();
    service.stop(); expect(pending.cancelled).toBe(true);
    sources[0].emit('summary', summary); expect(service.items()).toEqual([]); http.expectNone(root);
  });
});
