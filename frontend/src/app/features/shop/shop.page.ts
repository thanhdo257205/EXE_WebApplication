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
  constructor() {
    this.shop.products().subscribe({ next: list => this.products.set(list), error: () => this.failed.set(true) });
  }
  load() { this.failed.set(false); this.products.set(null); this.shop.products().subscribe({ next: list => this.products.set(list), error: () => this.failed.set(true) }); }
}
