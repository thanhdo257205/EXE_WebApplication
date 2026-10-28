import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { MorphIconComponent } from '../../../shared/components/morph-icon/morph-icon.component';
import { MorphIconName } from '../../../shared/components/morph-icon/icons';
import { AdminNotificationBellComponent } from './admin-notification-bell.component';
import { AdminThemeComponent } from './admin-theme.component';

export interface AdminNavItem {
  label: string;
  link: string;
  icon: MorphIconName;
  badge?: string;
  exact?: boolean;
  /** Any-of: the entry stays hidden when the account holds none of these permissions. */
  permissions?: string[];
}

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, MorphIconComponent, AdminNotificationBellComponent, AdminThemeComponent],
  templateUrl: './admin-layout.component.html',
  styleUrls: ['./admin-layout.component.css', './admin-layout-brand.css'],
})
export class AdminLayoutComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly sidebarOpen = signal(false);

  readonly navItems: AdminNavItem[] = [
    { label: 'Tổng quan & Hàng chờ', link: '/admin', icon: 'shield', exact: true },
    { label: 'Thẻ & Bộ thẻ (148 thẻ)', link: '/admin/cards', icon: 'cards', permissions: ['content:read'] },
    { label: 'Cư dân (8 nhân vật)', link: '/admin/characters', icon: 'residents', permissions: ['content:read'] },
    { label: 'Wiki & Bài viết', link: '/admin/articles', icon: 'file-text', permissions: ['content:read'] },
    { label: 'Sản phẩm & Tồn kho', link: '/admin/inventory', icon: 'package' },
    { label: 'Đơn hàng & Vận chuyển', link: '/admin/orders', icon: 'store', badge: 'Mới' },
    { label: 'Thanh toán PayOS', link: '/admin/payments', icon: 'fund' },
    { label: 'Tài khoản cư dân', link: '/admin/users', icon: 'user', permissions: ['users:read'] },
    { label: 'Trợ lý AI & hạn mức', link: '/admin/assistant', icon: 'search', permissions: ['assistant:read'] },
    { label: 'Hệ thống & Audit Log', link: '/admin/system', icon: 'database' },
  ];

  readonly visibleNavItems = computed(() =>
    this.navItems.filter(item => !item.permissions || this.auth.hasAnyPermission(item.permissions)),
  );

  /** Set when permissionGuard bounced a direct URL back to the overview. */
  readonly permissionNotice = signal('');

  constructor() {
    const destroyRef = inject(DestroyRef);
    // Re-read /auth/me so a permission change made by the owner is reflected without a manual reload.
    this.auth.loadCurrentUser().pipe(takeUntilDestroyed(destroyRef)).subscribe({ error: () => undefined });
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      takeUntilDestroyed(destroyRef),
    ).subscribe(() => {
      const blocked = (history.state as { thieuQuyen?: string } | null | undefined)?.thieuQuyen;
      this.permissionNotice.set(blocked ? this.blockedMessage(blocked) : '');
    });
  }

  private blockedMessage(slug: string): string {
    const section = this.navItems.find(item => item.link === `/admin/${slug}`)?.label ?? slug;
    return `Tài khoản của bạn chưa có quyền mở mục “${section}”. Admin chính có thể cấp thêm quyền trong trang Tài khoản cư dân.`;
  }

  dismissPermissionNotice(): void { this.permissionNotice.set(''); }

  toggleSidebar(): void {
    this.sidebarOpen.update(v => !v);
  }

  logout(): void {
    this.auth.logout().subscribe({
      next: () => this.router.navigateByUrl('/dang-nhap'),
      error: () => this.router.navigateByUrl('/dang-nhap'),
    });
  }
}
