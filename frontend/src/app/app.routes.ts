import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'admin',
    loadChildren: () => import('./features/admin/admin.routes').then(m => m.ADMIN_ROUTES),
  },
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
    data: { kind: 'cards', heading: 'Tủ thẻ trong nhà', description: 'Tìm thẻ theo tên hoặc mã, xem hiệu ứng và ghi chú luật của bản đã phát hành.' },
    loadComponent: () => import('./features/public-content/public-content.page').then(m => m.PublicContentPage),
  },
  {
    path: 'san-dau',
    title: 'Sân đấu mô phỏng — Nhà Này Hơi Báo!',
    loadComponent: () => import('./features/arena/arena.page').then(m => m.ArenaPage),
  },
  {
    path: 'thu-vien/mau/:slug',
    title: 'Trải nghiệm thẻ 3D — Nhà Này Hơi Báo!',
    data: { kind: 'cards', sample: true, heading: 'Thẻ minh họa 3D' },
    loadComponent: () => import('./features/public-content/public-content.page').then(m => m.PublicContentPage),
  },
  {
    path: 'thu-vien/:slug',
    title: 'Chi tiết thẻ — Nhà Này Hơi Báo!',
    data: { kind: 'cards', heading: 'Chi tiết thẻ' },
    loadComponent: () => import('./features/public-content/public-content.page').then(m => m.PublicContentPage),
  },
  {
    path: 'cu-dan',
    title: 'Hồ sơ cư dân — Nhà Này Hơi Báo!',
    data: { kind: 'characters', heading: 'Những người chung nhà', description: 'Gặp gỡ các cư dân và xem câu chuyện, kỹ năng trong bản nội dung đã phát hành.' },
    loadComponent: () => import('./features/public-content/public-content.page').then(m => m.PublicContentPage),
  },
  {
    path: 'cu-dan/:slug',
    title: 'Hồ sơ cư dân — Nhà Này Hơi Báo!',
    data: { kind: 'characters', heading: 'Hồ sơ cư dân' },
    loadComponent: () => import('./features/public-content/public-content.page').then(m => m.PublicContentPage),
  },
  {
    path: 'cach-choi',
    title: 'Hướng dẫn cách chơi — Nhà Này Hơi Báo!',
    loadComponent: () => import('./features/guide/how-to-play.page').then(m => m.HowToPlayPage),
  },
  {
    path: 'huong-dan',
    redirectTo: 'cach-choi',
    pathMatch: 'full',
  },
  {
    path: 'wiki',
    title: 'Wiki luật chơi — Nhà Này Hơi Báo!',
    data: { kind: 'wiki-pages', heading: 'Sổ tay chung của căn nhà', description: 'Tra cứu hướng dẫn, câu hỏi thường gặp, câu chuyện và những quy tắc đã phát hành.' },
    loadComponent: () => import('./features/public-content/public-content.page').then(m => m.PublicContentPage),
  },
  {
    path: 'wiki/:slug',
    title: 'Bài viết wiki — Nhà Này Hơi Báo!',
    data: { kind: 'wiki-pages', heading: 'Bài viết wiki' },
    loadComponent: () => import('./features/public-content/public-content.page').then(m => m.PublicContentPage),
  },
  {
    path: 'tro-ly',
    title: 'Trợ lý boardgame — Nhà Này Hơi Báo!',
    loadComponent: () => import('./features/assistant/assistant.page').then(m => m.AssistantPage),
  },
  {
    path: 'quy-nha',
    title: 'Quỹ Nhà Chung — Nhà Này Hơi Báo!',
    loadComponent: () => import('./features/fund/fund.page').then(m => m.FundPage),
  },
  {
    path: 'cau-chuyen',
    title: 'Câu chuyện căn nhà — Nhà Này Hơi Báo!',
    loadComponent: () => import('./features/story/story.page').then(m => m.StoryPage),
  },
  {
    path: 'cua-hang',
    title: 'Cửa hàng board game — Nhà Này Hơi Báo!',
    loadComponent: () => import('./features/shop/shop.page').then(m => m.ShopPage),
  },
  {
    path: 'dia-chi',
    title: 'Sổ địa chỉ — Nhà Này Hơi Báo!',
    loadComponent: () => import('./features/account/addresses.page').then(m => m.AddressesPage),
  },
  {
    path: 'gio-hang',
    title: 'Giỏ hàng & Thanh toán — Nhà Này Hơi Báo!',
    loadComponent: () => import('./features/shop/checkout.page').then(m => m.CheckoutPage),
  },
  {
    path: '**',
    title: 'Không tìm thấy trang — Nhà Này Hơi Báo!',
    data: { heading: '404 - Không tìm thấy trang', description: 'Đường dẫn này không tồn tại hoặc đã được thay đổi.', section: 'Lạc đường', tone: 'blue' },
    loadComponent: () => import('./shared/placeholder.page').then(m => m.PlaceholderPage),
  },
];
