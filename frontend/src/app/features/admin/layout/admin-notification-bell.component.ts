import { DatePipe } from '@angular/common';
import { Component, effect, ElementRef, HostListener, inject, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { AdminNotificationsService } from '../../../core/admin/admin-notifications.service';

@Component({
  selector: 'app-admin-notification-bell',
  standalone: true,
  imports: [DatePipe, RouterLink],
  providers: [AdminNotificationsService],
  template: `
    <button #trigger type="button" class="notification-trigger" (click)="open.set(!open())"
      [attr.aria-expanded]="open()" [attr.aria-label]="'Thông báo quản trị: '+notifications.unreadCount()+' chưa đọc'" aria-controls="admin-notifications-panel">
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
      <span class="trigger-label">Thông báo</span> <span aria-live="polite">({{ notifications.unreadCount() }})</span>
    </button>
    @if (open()) {
      <section id="admin-notifications-panel" aria-label="Thông báo quản trị">
        <div class="panel-heading"><strong>Thông báo</strong><button type="button" (click)="notifications.refresh()" [disabled]="notifications.loading()">Tải lại</button></div>
        <p class="connection" role="status">{{ statusLabel() }}</p>
        @if (notifications.error(); as error) {
          <p role="alert">{{ error }}</p>
          @if (notifications.status() === 'auth-required') { <a routerLink="/dang-nhap" [queryParams]="{returnUrl:'/admin'}">Đăng nhập lại</a> }
        }
        @if (notifications.loading() && !notifications.items().length) { <p>Đang tải thông báo…</p> }
        @else if (!notifications.items().length && !notifications.error() && notifications.status() === 'live') { <p>Chưa có thông báo.</p> }
        <ul>
          @for (item of notifications.items(); track item.id) {
            <li [class.unread]="!item.read">
              <a [routerLink]="safeHref(item.href)" (click)="notifications.markRead(item); open.set(false)">{{ item.title }}</a>
              <time [attr.datetime]="item.createdAt">{{ item.createdAt | date:'dd/MM HH:mm' }}</time>
              @if (!item.read) { <button type="button" (click)="notifications.markRead(item)">Đánh dấu đã đọc</button> }
              @else { <span class="read-label">Đã đọc</span> }
            </li>
          }
        </ul>
        @if (notifications.totalPages() > 1) {
          <nav aria-label="Trang thông báo">
            <button type="button" (click)="notifications.goToPage(notifications.page()-1)" [disabled]="notifications.page() === 0 || notifications.loading()">Trước</button>
            <span>{{ notifications.page()+1 }} / {{ notifications.totalPages() }}</span>
            <button type="button" (click)="notifications.goToPage(notifications.page()+1)" [disabled]="notifications.page()+1 >= notifications.totalPages() || notifications.loading()">Sau</button>
          </nav>
        }
        <button type="button" (click)="close()">Đóng</button>
      </section>
    }
  `,
  styles: `
    :host { position:relative; font-size:.8125rem; color:#e6e4dc; }
    .notification-trigger { display:inline-flex; align-items:center; gap:5px; white-space:nowrap; }
    @media(max-width:640px) { .trigger-label { display:none; } }
    button,a { cursor:pointer; } button { color:inherit; background:#15263a; border:1px solid #39506b; border-radius:6px; padding:6px 9px; }
    button:disabled { opacity:.5; cursor:default; } a { color:#bae6fd; text-decoration:underline; }
    section { position:absolute; right:0; top:calc(100% + 12px); width:min(360px,calc(100vw - 32px)); max-height:70vh; overflow:auto; background:#0f1b2b; border:1px solid #39506b; border-radius:10px; padding:16px; z-index:60; box-shadow:0 12px 40px #0008; }
    @media(max-width:640px) { section { position:fixed; right:16px; top:64px; } }
    .panel-heading,nav { display:flex; align-items:center; justify-content:space-between; gap:8px; }
    .connection,.read-label,time { color:#a6aaa3; font-size:.75rem; } p { margin:12px 0; }
    ul { list-style:none; padding:0; margin:0 0 12px; } li { padding:12px 0; border-bottom:1px solid #26384d; display:grid; gap:6px; }
    li button { justify-self:start; } .unread a { font-weight:700; } nav { margin:12px 0; }
    :focus-visible { outline:2px solid #dafa76; outline-offset:3px; }
  `,
})
export class AdminNotificationBellComponent {
  readonly notifications = inject(AdminNotificationsService);
  readonly open = signal(false);
  private readonly auth = inject(AuthService);
  private readonly element = inject(ElementRef);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  constructor() {
    effect(() => {
      const user = this.auth.currentUser();
      untracked(() => { if (user?.role === 'ADMIN') this.notifications.start(user.id); else this.notifications.stop(); });
    });
  }
  safeHref(href: string | undefined): string {
    return href === '/admin/users' ? href : '/admin';
  }
  statusLabel(): string {
    return ({ live:'Đang cập nhật trực tiếp', connecting:'Đang kết nối…', reconnecting:'Đang kết nối lại…',
      paused:'Tạm dừng cập nhật', 'auth-required':'Cần đăng nhập lại', unavailable:'Cập nhật trực tiếp chưa khả dụng' })[this.notifications.status()];
  }
  close(): void { this.open.set(false); this.trigger()?.nativeElement.focus(); }
  @HostListener('keydown.escape') escape(): void { if (this.open()) this.close(); }
  @HostListener('document:click', ['$event']) outside(event: MouseEvent): void {
    if (!this.element.nativeElement.contains(event.target)) this.open.set(false);
  }
}
