import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', title: 'Nhà Này Hơi Báo!', loadComponent: () => import('./features/home/home.page').then(m => m.HomePage) },
  { path: 'thu-vien', title: 'Thư viện thẻ', data: { heading: 'Thư viện thẻ', description: 'Khu vực tra cứu thẻ sẽ được xây dựng sau khi có dữ liệu chính thức.' }, loadComponent: () => import('./shared/placeholder.page').then(m => m.PlaceholderPage) },
  { path: 'wiki', title: 'Wiki luật', data: { heading: 'Wiki luật', description: 'Khu vực hướng dẫn và phiên bản luật đang được chuẩn bị.' }, loadComponent: () => import('./shared/placeholder.page').then(m => m.PlaceholderPage) },
  { path: 'huong-dan', title: 'Hướng dẫn tương tác', data: { heading: 'Hướng dẫn tương tác', description: 'Mô phỏng thẻ và lượt chơi chưa được triển khai trong khung dự án này.' }, loadComponent: () => import('./shared/placeholder.page').then(m => m.PlaceholderPage) },
  { path: '**', title: 'Không tìm thấy trang', data: { heading: 'Không tìm thấy trang', description: 'Đường dẫn này không tồn tại.' }, loadComponent: () => import('./shared/placeholder.page').then(m => m.PlaceholderPage) },
];
