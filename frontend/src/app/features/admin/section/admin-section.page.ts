import { Component, inject, computed, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MorphIconComponent } from '../../../shared/components/morph-icon/morph-icon.component';
import { MorphIconName } from '../../../shared/components/morph-icon/icons';
import {
  AdminContentService,
  AdminRelease,
  AdminCard,
  AdminAuditEvent,
  AdminCharacter,
  AdminWikiPage,
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
  imports: [RouterLink, FormsModule, MorphIconComponent],
  templateUrl: './admin-section.page.html',
  styleUrl: './admin-section.page.css',
})
export class AdminSectionPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly adminApi = inject(AdminContentService);

  readonly loading = signal(false);
  readonly errorMsg = signal<string | null>(null);

  readonly releases = signal<AdminRelease[]>([]);
  readonly activeRelease = signal<AdminRelease | null>(null);
  readonly cards = signal<AdminCard[]>([]);
  readonly characters = signal<AdminCharacter[]>([]);
  readonly wikiPages = signal<AdminWikiPage[]>([]);
  readonly auditEvents = signal<AdminAuditEvent[]>([]);

  readonly searchQuery = signal('');

  readonly sectionKey = computed(() => {
    return this.route.snapshot.data['section'] || 'cards';
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
        error: (err) => {
          this.errorMsg.set(err?.detail || 'Chưa thể tải danh sách bản phát hành (Backend đang ngoại tuyến).');
          this.loading.set(false);
        },
      });
    } else if (key === 'system') {
      this.adminApi.getAuditEvents(0, 10).subscribe({
        next: (page) => {
          this.auditEvents.set(page.items);
          this.loading.set(false);
        },
        error: (err) => {
          this.errorMsg.set(err?.detail || 'Chưa thể tải nhật ký audit (Backend đang ngoại tuyến).');
          this.loading.set(false);
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
          this.cards.set(res.items);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
    } else if (key === 'characters') {
      this.adminApi.getRevisions<AdminCharacter>(releaseId, 'characters', 0, 20).subscribe({
        next: (res) => {
          this.characters.set(res.items);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
    } else if (key === 'articles') {
      this.adminApi.getRevisions<AdminWikiPage>(releaseId, 'wiki-pages', 0, 20).subscribe({
        next: (res) => {
          this.wikiPages.set(res.items);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
    }
  }

  selectRelease(release: AdminRelease): void {
    this.activeRelease.set(release);
    this.loadReleaseContent(release.id, this.sectionKey());
  }
}
