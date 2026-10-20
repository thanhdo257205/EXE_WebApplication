import { RiseHeadingDirective } from '../../../shared/motion/rise-heading.directive';
import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { AdminContentService, AdminDashboardData, AdminProblemDetail } from '../../../core/admin/admin-content.service';
import { MorphIconComponent } from '../../../shared/components/morph-icon/morph-icon.component';

export interface ActionQueueItem {
  id: string;
  title: string;
  category: 'CONTENT' | 'COMMERCE' | 'PAYMENT' | 'USER';
  priority: 'P0' | 'P1' | 'P2';
  status: 'PENDING' | 'IN_REVIEW' | 'COMPLETED';
  updatedAt: string;
  actionUrl: string;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [RiseHeadingDirective, RouterLink, MorphIconComponent],
  templateUrl: './admin-dashboard.page.html',
  styleUrl: './admin-dashboard.page.css',
})
export class AdminDashboardPage implements OnInit {
  readonly auth = inject(AuthService);
  private readonly adminApi = inject(AdminContentService);

  readonly refreshing = signal(false);
  readonly activeFilter = signal<'ALL' | 'CONTENT' | 'COMMERCE' | 'PAYMENT'>('ALL');

  readonly dashboardData = signal<AdminDashboardData | null>(null);
  readonly backendStatus = signal<'CONNECTED' | 'LOADING' | 'OFFLINE'>('LOADING');
  readonly errorMessage = signal<string | null>(null);
  readonly isSessionExpired = signal(false);

  readonly formattedAsOf = computed(() => {
    const raw = this.dashboardData()?.asOf;
    if (!raw) return '';
    try {
      return new Date(raw).toLocaleString('vi-VN');
    } catch {
      return raw;
    }
  });

  readonly queueItems = signal<ActionQueueItem[]>([
    {
      id: 'Q-01',
      title: 'Xác minh 148 thẻ bài V2 & đối chiếu 11 bộ mở rộng trước khi xuất bản',
      category: 'CONTENT',
      priority: 'P0',
      status: 'IN_REVIEW',
      updatedAt: '10 phút trước',
      actionUrl: '/admin/cards',
    },
    {
      id: 'Q-02',
      title: 'Đơn hàng #DH-202610-001 đang chờ xác nhận thanh toán PayOS webhook',
      category: 'PAYMENT',
      priority: 'P0',
      status: 'PENDING',
      updatedAt: '25 phút trước',
      actionUrl: '/admin/payments',
    },
    {
      id: 'Q-03',
      title: 'Cập nhật tồn kho SKU: Board game Chưa Giàu Đã Lớn (Bản chuẩn)',
      category: 'COMMERCE',
      priority: 'P1',
      status: 'PENDING',
      updatedAt: '1 giờ trước',
      actionUrl: '/admin/inventory',
    },
    {
      id: 'Q-04',
      title: 'Duyệt bài viết wiki mới: "Hướng dẫn xử lý thẻ Sự Kiện Hóa Đơn"',
      category: 'CONTENT',
      priority: 'P1',
      status: 'PENDING',
      updatedAt: '2 giờ trước',
      actionUrl: '/admin/articles',
    },
    {
      id: 'Q-05',
      title: 'Xử lý 2 phản hồi của người chơi về hiệu ứng thẻ "Bình Nấu Ăn"',
      category: 'CONTENT',
      priority: 'P2',
      status: 'PENDING',
      updatedAt: 'Hôm nay',
      actionUrl: '/admin/cards',
    },
  ]);

  get filteredItems(): ActionQueueItem[] {
    const filter = this.activeFilter();
    if (filter === 'ALL') return this.queueItems();
    return this.queueItems().filter(item => item.category === filter);
  }

  ngOnInit(): void {
    this.loadDashboardData();
  }

  loadDashboardData(): void {
    this.backendStatus.set('LOADING');
    this.errorMessage.set(null);
    this.isSessionExpired.set(false);

    this.adminApi.getDashboard().subscribe({
      next: (data) => {
        this.dashboardData.set(data);
        this.backendStatus.set('CONNECTED');
        this.refreshing.set(false);
      },
      error: (err: AdminProblemDetail | any) => {
        this.backendStatus.set('OFFLINE');
        if (err?.code === 'SESSION_EXPIRED' || err?.status === 401) {
          this.isSessionExpired.set(true);
          this.errorMessage.set('Phiên làm việc quản trị viên của bạn đã hết hạn (30 phút). Vui lòng đăng nhập lại.');
        } else {
          this.errorMessage.set(err?.detail || 'Không thể kết nối đến API Quản trị viên');
        }
        this.refreshing.set(false);
      },
    });
  }

  setFilter(filter: 'ALL' | 'CONTENT' | 'COMMERCE' | 'PAYMENT'): void {
    this.activeFilter.set(filter);
  }

  refreshDashboard(): void {
    this.refreshing.set(true);
    this.loadDashboardData();
  }
}
