import { RevealDirective } from './motion/reveal.directive';
import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ColumnSpreadComponent } from './components/column-spread/column-spread.component';
import { FundCalculatorComponent } from './components/fund-calculator/fund-calculator.component';
import { ExploreCardsComponent } from './components/explore-cards/explore-cards.component';
import { PageHeroComponent, PageTone } from './components/page-hero/page-hero.component';

@Component({
  selector: 'app-placeholder-page',
  imports: [RevealDirective, RouterLink, ColumnSpreadComponent, FundCalculatorComponent, ExploreCardsComponent, PageHeroComponent],
  templateUrl: './placeholder.page.html',
  styleUrl: './placeholder.page.css',
})
export class PlaceholderPage {
  readonly heading = input('Đang cập nhật');
  readonly description = input('Khu vực này đang được hoàn thiện.');
  // Route không khai báo khóa data nào thì input binding đặt input đó về undefined, nên các input tùy chọn có transform về mặc định.
  /** Nhãn khu vực hiển thị ở hàng meta. */
  readonly section = input('Căn nhà', { transform: (value: string | undefined) => value ?? 'Căn nhà' });
  /** Các chương sẽ có (chỉ là mục lục, nội dung đang biên soạn). */
  readonly chapters = input<readonly string[], readonly string[] | undefined>([], { transform: value => value ?? [] });
  /** Công cụ tương tác nhúng trong trang (hiện có `fund`). */
  readonly tool = input('', { transform: (value: string | undefined) => value ?? '' });
  /** Màu khu vực cho đầu trang. */
  readonly tone = input<PageTone, PageTone | undefined>('lime', { transform: value => value ?? 'lime' });
  readonly notFound = computed(() => this.heading().startsWith('404'));
}
