import { Component, inject, computed } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MorphIconComponent } from '../../../shared/components/morph-icon/morph-icon.component';
import { MorphIconName } from '../../../shared/components/morph-icon/icons';

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
  imports: [RouterLink, MorphIconComponent],
  templateUrl: './admin-section.page.html',
  styleUrl: './admin-section.page.css',
})
export class AdminSectionPage {
  private readonly route = inject(ActivatedRoute);

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
}
