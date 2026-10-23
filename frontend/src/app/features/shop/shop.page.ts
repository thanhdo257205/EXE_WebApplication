import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RiseHeadingDirective } from '../../shared/motion/rise-heading.directive';
import { formatVnd, ShopProduct, ShopService } from '../../core/shop/shop.service';

@Component({
  selector: 'app-shop-page',
  standalone: true,
  imports: [RouterLink, RiseHeadingDirective],
  templateUrl: './shop.page.html',
  styleUrl: './shop.page.css',
})
export class ShopPage {
  private readonly shop = inject(ShopService);
  readonly products = signal<ShopProduct[] | null>(null);
  readonly failed = signal(false);
  readonly price = formatVnd;
  readonly steps = [
    { title: 'Chọn sản phẩm', text: 'Bấm “Mua ngay” ở sản phẩm muốn đặt để chuyển sang giỏ hàng và thanh toán.' },
    { title: 'Chọn địa chỉ giao', text: 'Chọn một địa chỉ trong sổ địa chỉ; nếu chưa có, trang sẽ mở phần nhập địa chỉ trước khi đặt.' },
    { title: 'Quét mã QR PayOS', text: 'Quét mã bằng ứng dụng ngân hàng; đơn được xác nhận khi PayOS báo đã nhận tiền.' },
  ];
  constructor() {
    this.shop.products().subscribe({ next: list => this.products.set(list), error: () => this.failed.set(true) });
  }
  load() { this.failed.set(false); this.products.set(null); this.shop.products().subscribe({ next: list => this.products.set(list), error: () => this.failed.set(true) }); }
}
