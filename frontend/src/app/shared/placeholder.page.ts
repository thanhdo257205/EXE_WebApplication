import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ExploreCardsComponent } from './components/explore-cards/explore-cards.component';
import { PageHeroComponent, PageTone } from './components/page-hero/page-hero.component';

/** Trang khung (hiện chỉ còn dùng cho 404): đầu trang chung + thẻ dẫn sang các khu vực đã hoạt động. */
@Component({
  selector: 'app-placeholder-page',
  imports: [RouterLink, ExploreCardsComponent, PageHeroComponent],
  templateUrl: './placeholder.page.html',
  styleUrl: './placeholder.page.css',
})
export class PlaceholderPage {
  readonly heading = input('Đang cập nhật');
  readonly description = input('Khu vực này đang được hoàn thiện.');
  // Route không khai báo khóa data nào thì input binding đặt input đó về undefined, nên các input tùy chọn có transform về mặc định.
  /** Nhãn khu vực hiển thị ở hàng meta. */
  readonly section = input('Căn nhà', { transform: (value: string | undefined) => value ?? 'Căn nhà' });
  /** Màu khu vực cho đầu trang. */
  readonly tone = input<PageTone, PageTone | undefined>('lime', { transform: value => value ?? 'lime' });
  readonly notFound = computed(() => this.heading().startsWith('404'));
}
