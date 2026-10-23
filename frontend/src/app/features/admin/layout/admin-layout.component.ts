import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
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
    { label: 'Thẻ & Bộ thẻ (148 thẻ)', link: '/admin/cards', icon: 'cards' },
    { label: 'Cư dân (8 nhân vật)', link: '/admin/characters', icon: 'residents' },
    { label: 'Wiki & Bài viết', link: '/admin/articles', icon: 'file-text' },
    { label: 'Sản phẩm & Tồn kho', link: '/admin/inventory', icon: 'package' },
    { label: 'Đơn hàng & Vận chuyển', link: '/admin/orders', icon: 'store', badge: 'Mới' },
    { label: 'Thanh toán PayOS', link: '/admin/payments', icon: 'fund' },
    { label: 'Tài khoản cư dân', link: '/admin/users', icon: 'user' },
    { label: 'Hệ thống & Audit Log', link: '/admin/system', icon: 'database' },
  ];

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
