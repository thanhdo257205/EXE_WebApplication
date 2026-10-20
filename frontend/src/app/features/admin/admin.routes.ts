import { Routes } from '@angular/router';
import { adminGuard } from './guards/admin.guard';
import { AdminLayoutComponent } from './layout/admin-layout.component';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    component: AdminLayoutComponent,
    canActivate: [adminGuard],
    children: [
      {
        path: '',
        title: 'Tổng quan hàng chờ — Quản trị viên NNHB',
        loadComponent: () => import('./dashboard/admin-dashboard.page').then(m => m.AdminDashboardPage),
      },
      {
        path: 'dashboard',
        redirectTo: '',
        pathMatch: 'full',
      },
      {
        path: 'cards',
        title: 'Quản trị 148 Thẻ bài — Quản trị viên NNHB',
        data: { section: 'cards' },
        loadComponent: () => import('./section/admin-section.page').then(m => m.AdminSectionPage),
      },
      {
        path: 'characters',
        title: 'Quản trị 8 Cư dân — Quản trị viên NNHB',
        data: { section: 'characters' },
        loadComponent: () => import('./section/admin-section.page').then(m => m.AdminSectionPage),
      },
      {
        path: 'articles',
        title: 'Quản lý Wiki & Bài viết — Quản trị viên NNHB',
        data: { section: 'articles' },
        loadComponent: () => import('./section/admin-section.page').then(m => m.AdminSectionPage),
      },
      {
        path: 'inventory',
        title: 'Quản lý Tồn kho & SKU — Quản trị viên NNHB',
        data: { section: 'inventory' },
        loadComponent: () => import('./section/admin-section.page').then(m => m.AdminSectionPage),
      },
      {
        path: 'orders',
        title: 'Quản lý Đơn hàng & Vận chuyển — Quản trị viên NNHB',
        data: { section: 'orders' },
        loadComponent: () => import('./section/admin-section.page').then(m => m.AdminSectionPage),
      },
      {
        path: 'payments',
        title: 'Thanh toán & Đối soát PayOS — Quản trị viên NNHB',
        data: { section: 'payments' },
        loadComponent: () => import('./section/admin-section.page').then(m => m.AdminSectionPage),
      },
      {
        path: 'users',
        title: 'Quản lý Tài khoản Cư dân — Quản trị viên NNHB',
        data: { section: 'users' },
        loadComponent: () => import('./section/admin-section.page').then(m => m.AdminSectionPage),
      },
      {
        path: 'system',
        title: 'Hệ thống & Audit Log — Quản trị viên NNHB',
        data: { section: 'system' },
        loadComponent: () => import('./section/admin-section.page').then(m => m.AdminSectionPage),
      },
    ],
  },
];
