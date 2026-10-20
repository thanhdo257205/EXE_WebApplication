import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'quen-mat-khau',
    title: 'Quên mật khẩu — Nhà Này Hơi Báo!',
    loadComponent: () => import('./features/auth/recovery/recovery.page').then(m => m.RecoveryPage),
  },
  {
    path: 'dat-lai-mat-khau',
    title: 'Đặt lại mật khẩu — Nhà Này Hơi Báo!',
    data: { resetPassword: true },
    loadComponent: () => import('./features/auth/recovery/recovery.page').then(m => m.RecoveryPage),
  },
  {
    path: 'dang-nhap',
    title: 'Đăng nhập — Nhà Này Hơi Báo!',
    loadComponent: () => import('./features/auth/login/login.page').then(m => m.LoginPage),
  },
  {
    path: 'login',
    redirectTo: 'dang-nhap',
    pathMatch: 'full',
  },
  {
    path: 'dang-ky',
    title: 'Đăng ký tài khoản cư dân — Nhà Này Hơi Báo!',
    loadComponent: () => import('./features/auth/register/register.page').then(m => m.RegisterPage),
  },
  {
    path: 'register',
    redirectTo: 'dang-ky',
    pathMatch: 'full',
  },
  {
    path: 'chinh-sach-quyen-rieng-tu',
    title: 'Chính sách quyền riêng tư — Nhà Này Hơi Báo!',
    data: { legalDocument: 'privacy' },
    loadComponent: () => import('./features/legal/legal.page').then(m => m.LegalPage),
  },
  {
    path: 'dieu-khoan-su-dung',
    title: 'Điều khoản sử dụng — Nhà Này Hơi Báo!',
    data: { legalDocument: 'terms' },
    loadComponent: () => import('./features/legal/legal.page').then(m => m.LegalPage),
  },
  {
    path: '',
    title: 'Nhà Này Hơi Báo! — Wiki',
    loadComponent: () => import('./features/home/home.page').then(m => m.HomePage),
  },
  {
    path: 'thu-vien',
    title: 'Thư viện thẻ bài — Nhà Này Hơi Báo!',
    data: { heading: 'Thư viện thẻ bài (148 thẻ V2)', description: 'Khu vực tra cứu thẻ, phân loại theo 11 bộ mở rộng và tìm kiếm hiệu ứng minh họa.' },
    loadComponent: () => import('./shared/placeholder.page').then(m => m.PlaceholderPage),
  },
  {
    path: 'cu-dan',
    title: 'Hồ sơ cư dân — Nhà Này Hơi Báo!',
    data: { heading: 'Hồ sơ 8 cư dân', description: 'Chi tiết tính cách, sở thích, kỹ năng đặc biệt và thói quen sinh hoạt của 8 thành viên trong nhà.' },
    loadComponent: () => import('./shared/placeholder.page').then(m => m.PlaceholderPage),
  },
  {
    path: 'cach-choi',
    title: 'Hướng dẫn cách chơi — Nhà Này Hơi Báo!',
    data: { heading: 'Hướng dẫn cách chơi', description: 'Các bước thiết lập bàn chơi, cấu trúc vòng chơi, giai đoạn Sự Kiện và cách tính điểm thắng cuộc.' },
    loadComponent: () => import('./shared/placeholder.page').then(m => m.PlaceholderPage),
  },
  {
    path: 'huong-dan',
    redirectTo: 'cach-choi',
    pathMatch: 'full',
  },
  {
    path: 'wiki',
    title: 'Wiki luật chơi — Nhà Này Hơi Báo!',
    data: { heading: 'Wiki luật chơi & Cơ chế', description: 'Quy tắc giải quyết tranh chấp thẻ, cơ chế Drama và các câu hỏi thường gặp (FAQ).' },
    loadComponent: () => import('./shared/placeholder.page').then(m => m.PlaceholderPage),
  },
  {
    path: 'quy-nha',
    title: 'Quỹ Nhà Chung — Nhà Này Hơi Báo!',
    data: { heading: 'Mô phỏng Quỹ Nhà Chung', description: 'Công cụ tính toán tương tác: Kiểm tra 4 cư dân đóng tiền và đối chiếu với Hóa đơn 8 Tiền (Thiếu, Đủ, Dư).' },
    loadComponent: () => import('./shared/placeholder.page').then(m => m.PlaceholderPage),
  },
  {
    path: 'cau-chuyen',
    title: 'Câu chuyện căn nhà — Nhà Này Hơi Báo!',
    data: { heading: 'Câu chuyện căn nhà', description: 'Cốt truyện về những người trẻ lần đầu tập sống chung, bão hóa đơn và những tình huống dở khóc dở cười.' },
    loadComponent: () => import('./shared/placeholder.page').then(m => m.PlaceholderPage),
  },
  {
    path: 'cua-hang',
    title: 'Cửa hàng board game — Nhà Này Hơi Báo!',
    data: { heading: 'Kho vật phẩm & Board game chính hãng', description: 'Sở hữu trọn bộ bản cứng Chưa Giàu Đã Lớn, các gói mở rộng V2 và phụ kiện bàn chơi cao cấp.' },
    loadComponent: () => import('./shared/placeholder.page').then(m => m.PlaceholderPage),
  },
  {
    path: 'gio-hang',
    title: 'Giỏ hàng & Thanh toán — Nhà Này Hơi Báo!',
    data: { heading: 'Giỏ hàng & Thanh toán', description: 'Danh sách vật phẩm đã chọn và hóa đơn thanh toán qua PayOS.' },
    loadComponent: () => import('./shared/placeholder.page').then(m => m.PlaceholderPage),
  },
  {
    path: '**',
    title: 'Không tìm thấy trang — Nhà Này Hơi Báo!',
    data: { heading: '404 - Không tìm thấy trang', description: 'Đường dẫn này không tồn tại hoặc đã được thay đổi.' },
    loadComponent: () => import('./shared/placeholder.page').then(m => m.PlaceholderPage),
  },
];
