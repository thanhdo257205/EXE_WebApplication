import { Component, ViewEncapsulation } from '@angular/core';

/**
 * Lớp giao diện chung của khu quản trị theo ngôn ngữ thiết kế của site (nền tối ấm, nhấn xanh chanh, chữ Anton).
 * Không đóng gói style để ghi đè được class Tailwind trong template các trang admin; mọi selector đều nằm dưới `.admin-app-root`
 * và chỉ được nạp cùng chunk admin.
 */
@Component({
  selector: 'app-admin-theme',
  template: '',
  styleUrl: './admin-theme.css',
  encapsulation: ViewEncapsulation.None,
})
export class AdminThemeComponent {}
