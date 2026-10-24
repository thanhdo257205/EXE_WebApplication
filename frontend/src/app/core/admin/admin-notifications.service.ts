import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { DestroyRef, inject, Injectable, InjectionToken, PLATFORM_ID, signal } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Subscription, switchMap } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';

export type AdminNotificationType = 'FEEDBACK_NEW' | 'USER_REGISTERED';

export interface AdminNotification {
  id: string;
  type: AdminNotificationType;
  title: string;
  sourceId: string;
  href: string;
  createdAt: string;
  read: boolean;
}
export interface NotificationPage {
  items: AdminNotification[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  unreadCount: number;
}
export const ADMIN_EVENT_SOURCE = new InjectionToken<(url: string) => EventSource>('AdminEventSource', {
  factory: () => url => new EventSource(url, { withCredentials: true }),
});

// Provided by the bell component so the stream, pending requests and data die with the admin layout.
@Injectable()
export class AdminNotificationsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly doc = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly createSource = inject(ADMIN_EVENT_SOURCE);
  private readonly base = `${environment.apiBaseUrl}/v1/admin/notifications`;
  readonly items = signal<AdminNotification[]>([]);
  readonly unreadCount = signal(0);
  readonly page = signal(0);
  readonly totalPages = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly status = signal<'connecting' | 'live' | 'reconnecting' | 'paused' | 'auth-required' | 'unavailable'>('paused');
  private source?: EventSource;
  private reconnect?: ReturnType<typeof setTimeout>;
  private request?: Subscription;
  private probe?: Subscription;
  private mutations = new Subscription();
  private user?: string;
  private failures = 0;
  private summary = '';
  private refreshAgain = false;

  constructor() {
    if (this.browser) this.doc.addEventListener('visibilitychange', this.visibilityChanged);
    inject(DestroyRef).onDestroy(() => {
      this.stop();
      if (this.browser) this.doc.removeEventListener('visibilitychange', this.visibilityChanged);
    });
  }
  start(user: string): void {
    if (this.user !== user) { this.stop(); this.user = user; }
    if (!this.browser || this.doc.hidden || this.source || this.reconnect) return;
    this.connect();
  }
  stop(): void {
    this.pause(); this.user = undefined; this.summary = ''; this.failures = 0;
    this.mutations.unsubscribe(); this.mutations = new Subscription();
    this.items.set([]); this.unreadCount.set(0); this.page.set(0); this.totalPages.set(0); this.error.set(null);
  }
  private pause(): void {
    this.source?.close(); this.source = undefined;
    clearTimeout(this.reconnect); this.reconnect = undefined;
    this.request?.unsubscribe(); this.request = undefined;
    this.probe?.unsubscribe(); this.probe = undefined;
    this.loading.set(false); this.refreshAgain = false; this.status.set('paused');
  }
  private readonly visibilityChanged = () => {
    if (this.doc.hidden) this.pause();
    else if (this.user && this.auth.currentUser()?.role === 'ADMIN' && this.status() !== 'auth-required') this.start(this.user);
  };
  private connect(): void {
    if (!this.user || this.doc.hidden) return;
    this.summary = ''; // Always catch up from the durable list after reconnect, even if counts did not change.
    this.status.set(this.failures ? 'reconnecting' : 'connecting');
    try { this.source = this.createSource(`${this.base}/stream`); }
    catch { this.status.set('unavailable'); this.refresh(); return; }
    const source = this.source;
    source.addEventListener('summary', event => {
      if (this.source !== source) return;
      try {
        const data = JSON.parse((event as MessageEvent).data);
        if (!Number.isSafeInteger(data.unreadCount) || data.unreadCount < 0 || !Number.isSafeInteger(data.totalElements)
            || data.totalElements < 0 || typeof data.latestId !== 'string') throw new Error('Invalid summary');
        this.status.set('live'); this.failures = 0; this.unreadCount.set(data.unreadCount);
        const signature = JSON.stringify(data);
        if (signature !== this.summary) { this.summary = signature; this.refresh(); }
      } catch { this.disconnected(source, false); }
    });
    source.addEventListener('renew', () => this.disconnected(source, true));
    source.addEventListener('retry', () => this.disconnected(source, false));
    source.addEventListener('auth-required', () => { if (source === this.source) this.expired(); });
    source.onerror = () => {
      if (source !== this.source) return;
      source.close(); this.source = undefined; this.status.set('reconnecting');
      // EventSource hides HTTP status. Probe /me to stop on expired/revoked credentials, not reconnect forever.
      this.probe = this.auth.me().subscribe({
        next: user => { if (user.role !== 'ADMIN') this.expired(); else this.schedule(false); },
        error: error => { if ([401, 403].includes(error.status)) this.expired(); else this.schedule(false); },
      });
    };
  }
  private disconnected(source: EventSource, normal: boolean): void {
    if (source !== this.source) return;
    source.close(); this.source = undefined; this.schedule(normal);
  }
  private schedule(normal: boolean): void {
    if (!this.user || this.doc.hidden) return;
    this.status.set('reconnecting');
    const delay = normal ? 1_000 : Math.min(60_000, 5_000 * 2 ** Math.min(this.failures++, 4));
    clearTimeout(this.reconnect);
    this.reconnect = setTimeout(() => { this.reconnect = undefined; this.connect(); }, delay);
  }
  private expired(): void {
    this.stop(); this.status.set('auth-required');
    this.error.set('Phiên quản trị đã hết hạn hoặc quyền đã thay đổi. Vui lòng đăng nhập lại.');
  }
  refresh(): void {
    if (!this.user || this.doc.hidden) return;
    if (this.loading()) { this.refreshAgain = true; return; }
    this.loading.set(true); this.error.set(null);
    this.request = this.http.get<NotificationPage>(this.base, {
      withCredentials: true, params: new HttpParams().set('page', this.page()).set('size', 20),
    }).subscribe({
      next: data => {
        this.items.set(data.items); this.totalPages.set(data.totalPages); this.unreadCount.set(data.unreadCount);
        this.loading.set(false);
        if (this.refreshAgain) { this.refreshAgain = false; this.refresh(); }
      },
      error: error => {
        this.loading.set(false); this.refreshAgain = false;
        if ([401, 403].includes(error.status)) this.expired();
        else this.error.set('Chưa tải được thông báo. Vui lòng thử lại.');
      },
    });
  }
  goToPage(page: number): void {
    if (page < 0 || page >= this.totalPages() || this.loading()) return;
    this.page.set(page); this.refresh();
  }
  markRead(item: AdminNotification): void {
    if (item.read || !this.user) return;
    this.mutations.add(this.auth.getCsrf().pipe(switchMap(csrf => this.http.post(`${this.base}/${item.id}/read`, null, {
      withCredentials: true, headers: new HttpHeaders({ [csrf.headerName]: csrf.token }),
    }))).subscribe({ next: () => this.refresh(), error: error => {
      if ([401, 403].includes(error.status)) this.expired();
      else this.error.set('Chưa đánh dấu được thông báo. Vui lòng thử lại.');
    } }));
  }
}
