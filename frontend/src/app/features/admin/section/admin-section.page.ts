import { RiseHeadingDirective } from '../../../shared/motion/rise-heading.directive';
import { Component, inject, computed, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SlicePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../../core/auth/auth.service';
import { MorphIconComponent } from '../../../shared/components/morph-icon/morph-icon.component';
import { MorphIconName } from '../../../shared/components/morph-icon/icons';
import {
  AdminContentService,
  AdminRelease,
  AdminCard,
  AdminCardSet,
  AdminAuditEvent,
  AdminCharacter,
  AdminWikiPage,
  AdminProblemDetail,
} from '../../../core/admin/admin-content.service';

export interface SectionMeta {
  key: string;
  title: string;
  subtitle: string;
  icon: MorphIconName;
  badge: string;
}

@Component({
  selector: 'app-admin-section',
  standalone: true,
  imports: [RiseHeadingDirective, RouterLink, FormsModule, SlicePipe, MorphIconComponent],
  templateUrl: './admin-section.page.html',
  styleUrl: './admin-section.page.css',
})
export class AdminSectionPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly adminApi = inject(AdminContentService);
  private readonly http = inject(HttpClient);
  readonly auth = inject(AuthService);

  readonly loading = signal(false);
  readonly errorMsg = signal<string | null>(null);
  readonly isSessionExpired = signal(false);

  readonly releases = signal<AdminRelease[]>([]);
  readonly activeRelease = signal<AdminRelease | null>(null);

  readonly cards = signal<AdminCard[]>([]);
  readonly cardSets = signal<AdminCardSet[]>([]);
  readonly totalCardsCount = signal<number>(0);

  readonly characters = signal<AdminCharacter[]>([]);
  readonly totalCharactersCount = signal<number>(0);

  readonly wikiPages = signal<AdminWikiPage[]>([]);
  readonly totalWikiCount = signal<number>(0);
  readonly activeWikiTab = signal<'ALL' | 'STORY' | 'RULE' | 'GUIDE' | 'FAQ' | 'DEVLOG'>('ALL');

  readonly auditEvents = signal<AdminAuditEvent[]>([]);
  readonly totalAuditCount = signal<number>(0);

  readonly paymentConfig = signal<{ provider: string; enabled: boolean } | null>(null);
  readonly ordersList = signal<any[]>([]);

  readonly searchQuery = signal('');

  readonly sectionKey = computed(() => {
    return this.route.snapshot.data['section'] || 'cards';
  });

  readonly filteredWikiPages = computed(() => {
    const tab = this.activeWikiTab();
    const list = this.wikiPages();
    if (tab === 'ALL') return list;
    return list.filter(p => p.pageType === tab);
  });

  readonly meta = computed<SectionMeta>(() => {
    switch (this.sectionKey()) {
      case 'cards':
        return {
          key: 'cards',
          title: 'Quản trị Thẻ bài & Bộ thẻ (148 thẻ V2)',
          subtitle: 'Kiểm tra 11 bộ mở rộng, đối chiếu mã định danh và xem trước trước khi chốt bản snapshot.',
          icon: 'cards',
          badge: '148 THẺ BÀI',
        };
      case 'characters':
        return {
          key: 'characters',
          title: 'Quản lý Hồ sơ 8 Cư dân chính thức',
          subtitle: 'Hồ sơ nhân vật, tính cách, kỹ năng giải quyết drama và ảnh đại diện.',
          icon: 'residents',
          badge: '8 CƯ DÂN',
        };
      case 'articles':
        return {
          key: 'articles',
          title: 'Wiki luật, FAQ & Câu chuyện căn nhà',
          subtitle: 'Soạn thảo, quản lý các bản sửa đổi (revision) và duyệt nội dung tra cứu.',
          icon: 'file-text',
          badge: 'NỘI DUNG',
        };
      case 'inventory':
        return {
          key: 'inventory',
          title: 'Quản lý Sản phẩm & Tồn kho SKU',
          subtitle: 'Theo dõi số lượng tồn thực tế, tồn đã giữ và lịch sử điều chỉnh kho có lý do.',
          icon: 'package',
          badge: 'SỔ CÁI KHO',
        };
      case 'orders':
        return {
          key: 'orders',
          title: 'Quản lý Đơn hàng & Vận chuyển',
          subtitle: 'Xem danh sách đơn, trạng thái thanh toán PayOS và tiến độ giao hàng.',
          icon: 'store',
          badge: 'ĐƠN HÀNG',
        };
      case 'payments':
        return {
          key: 'payments',
          title: 'Thanh toán PayOS & Sổ cái giao dịch',
          subtitle: 'Hàng chờ UNKNOWN/REVIEW, kiểm tra webhook inbox và quy trình hoàn tiền có bằng chứng.',
          icon: 'fund',
          badge: 'PAYOS GATEWAY',
        };
      case 'users':
        return {
          key: 'users',
          title: 'Quản lý Tài khoản Cư dân & Phân quyền',
          subtitle: 'Danh sách thành viên, kiểm tra vai trò (ADMIN/CUSTOMER), trạng thái hoạt động.',
          icon: 'user',
          badge: 'TÀI KHOẢN',
        };
      case 'system':
      default:
        return {
          key: 'system',
          title: 'Trạng thái Hệ thống & Nhật ký Audit',
          subtitle: 'Theo dõi PostgreSQL Aiven, Cloudflare Gateway và nhật ký thao tác quản trị viên.',
          icon: 'database',
          badge: 'HẠ TẦNG',
        };
    }
  });

  ngOnInit(): void {
    this.loadSectionData();
  }

  loadSectionData(): void {
    const key = this.sectionKey();
    this.loading.set(true);
    this.errorMsg.set(null);
    this.isSessionExpired.set(false);

    if (key === 'cards' || key === 'characters' || key === 'articles') {
      this.adminApi.getReleases().subscribe({
        next: (page) => {
          this.releases.set(page.items);
          const first = page.items[0] || null;
          this.activeRelease.set(first);

          if (first) {
            this.loadReleaseContent(first.id, key);
          } else {
            this.loading.set(false);
          }
        },
        error: (err) => this.handleApiError(err),
      });
    } else if (key === 'system') {
      this.adminApi.getAuditEvents(0, 20).subscribe({
        next: (page) => {
          this.auditEvents.set(page.items);
          this.totalAuditCount.set(page.totalElements);
          this.loading.set(false);
        },
        error: (err) => this.handleApiError(err),
      });
    } else if (key === 'payments') {
      this.http.get<{ provider: string; enabled: boolean }>('/api/v1/payments/config').subscribe({
        next: (cfg) => {
          this.paymentConfig.set(cfg);
          this.loading.set(false);
        },
        error: () => {
          this.paymentConfig.set({ provider: 'PAYOS', enabled: false });
          this.loading.set(false);
        },
      });
    } else if (key === 'orders') {
      this.http.get<any[]>('/api/v1/orders', { withCredentials: true }).subscribe({
        next: (orders) => {
          this.ordersList.set(Array.isArray(orders) ? orders : []);
          this.loading.set(false);
        },
        error: (err) => {
          // If orders API fails, keep empty array
          this.ordersList.set([]);
          this.handleApiError(err);
        },
      });
    } else {
      this.loading.set(false);
    }
  }

  loadReleaseContent(releaseId: string, key: string): void {
    if (key === 'cards') {
      this.adminApi.getRevisions<AdminCard>(releaseId, 'cards', 0, 50, this.searchQuery()).subscribe({
        next: (res) => {
          // Fix: Read res.result.items and res.result.totalElements from RevisionPage
          this.cards.set(res.result.items);
          this.totalCardsCount.set(res.result.totalElements);
          this.loading.set(false);
        },
        error: (err) => this.handleApiError(err),
      });

      this.adminApi.getRevisions<AdminCardSet>(releaseId, 'card-sets', 0, 50).subscribe({
        next: (res) => {
          this.cardSets.set(res.result.items);
        },
        error: (err) => this.handleApiError(err),
      });
    } else if (key === 'characters') {
      this.adminApi.getRevisions<AdminCharacter>(releaseId, 'characters', 0, 50).subscribe({
        next: (res) => {
          // Fix: Read res.result.items and res.result.totalElements from RevisionPage
          this.characters.set(res.result.items);
          this.totalCharactersCount.set(res.result.totalElements);
          this.loading.set(false);
        },
        error: (err) => this.handleApiError(err),
      });
    } else if (key === 'articles') {
      this.adminApi.getRevisions<AdminWikiPage>(releaseId, 'wiki-pages', 0, 50).subscribe({
        next: (res) => {
          // Fix: Read res.result.items and res.result.totalElements from RevisionPage
          this.wikiPages.set(res.result.items);
          this.totalWikiCount.set(res.result.totalElements);
          this.loading.set(false);
        },
        error: (err) => this.handleApiError(err),
      });
    }
  }

  selectRelease(release: AdminRelease): void {
    this.activeRelease.set(release);
    this.loadReleaseContent(release.id, this.sectionKey());
  }

  setWikiTab(tab: 'ALL' | 'STORY' | 'RULE' | 'GUIDE' | 'FAQ' | 'DEVLOG'): void {
    this.activeWikiTab.set(tab);
  }

  private handleApiError(err: AdminProblemDetail | any): void {
    this.loading.set(false);
    if (err?.code === 'SESSION_EXPIRED' || err?.status === 401) {
      this.isSessionExpired.set(true);
      this.errorMsg.set('Phiên làm việc quản trị viên của bạn đã hết hạn (30 phút). Vui lòng đăng nhập lại.');
    } else if (err?.status === 403) {
      this.errorMsg.set('Từ chối quyền truy cập: Bạn không có quyền ADMIN hoặc thiếu chữ ký bảo mật CSRF.');
    } else if (err?.code === 'VERSION_CONFLICT' || err?.status === 409) {
      this.errorMsg.set('Xung đột phiên bản: Bản phát hành đã được chỉnh sửa bởi quản trị viên khác. Vui lòng tải lại dữ liệu.');
    } else {
      this.errorMsg.set(err?.detail || 'Không thể kết nối đến máy chủ quản trị viên (Backend ngoại tuyến).');
    }
  }
}
