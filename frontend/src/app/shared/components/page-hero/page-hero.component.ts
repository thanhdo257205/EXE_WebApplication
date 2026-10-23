import { Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RiseHeadingDirective } from '../../motion/rise-heading.directive';

export type PageTone = 'lime' | 'pink' | 'blue' | 'orange';
const TONES: Record<PageTone, { color: string; ink: string; cards: [number, number, number] }> = {
  lime: { color: '#dafa76', ink: '#183c2b', cards: [1, 5, 9] },
  pink: { color: '#ffacc9', ink: '#4f203c', cards: [2, 6, 10] },
  blue: { color: '#b7cfff', ink: '#1d3760', cards: [3, 7, 11] },
  orange: { color: '#ffa55c', ink: '#4a2410', cards: [4, 8, 12] },
};
/** Bong bóng cố định (không ngẫu nhiên lúc chạy) để SSR và trình duyệt khớp nhau. */
const BUBBLES = Array.from({ length: 16 }, (_, i) => ({ x: (i * 37 + 11) % 100, size: 8 + ((i * 13) % 22), dur: 7 + ((i * 7) % 9), delay: -((i * 5) % 11) }));

/**
 * Đầu trang chung cho các trang con theo ngôn ngữ hero trang chủ: nền gradient theo màu khu vực, bong bóng bay,
 * ba lá thẻ nổi nghiêng theo con trỏ, chữ ma khổng lồ. Nội dung phụ (hàng meta, ghi chú phiên bản) đưa vào qua ng-content.
 */
@Component({
  selector: 'app-page-hero',
  imports: [RouterLink, RiseHeadingDirective],
  templateUrl: './page-hero.component.html',
  styleUrl: './page-hero.component.css',
  host: {
    '[style.--tone]': 'palette().color', '[style.--tone-ink]': 'palette().ink',
    '[style.--mx]': 'mx()', '[style.--my]': 'my()',
    '(pointermove)': 'onMove($event)', '(pointerleave)': 'mx.set(0); my.set(0)',
  },
})
export class PageHeroComponent {
  readonly heading = input.required<string>();
  readonly description = input('');
  readonly eyebrow = input('');
  readonly tone = input<PageTone>('lime');
  /** Đường dẫn quay lại; null để ẩn. */
  readonly backLink = input<string | readonly unknown[] | null>('/');
  readonly backLabel = input('← Về căn nhà');
  /** Chữ nền khổng lồ; mặc định dùng nhãn eyebrow. */
  readonly ghost = input('');
  readonly palette = computed(() => TONES[this.tone()] ?? TONES.lime);
  readonly cards = computed(() => this.palette().cards.map(n => `/assets/cards/card-${String(n).padStart(2, '0')}.svg`));
  readonly bubbles = BUBBLES;
  readonly mx = signal(0);
  readonly my = signal(0);

  onMove(event: PointerEvent): void {
    if (event.pointerType !== 'mouse') return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.mx.set(Math.round(((event.clientX - rect.left) / rect.width - 0.5) * 100) / 100);
    this.my.set(Math.round(((event.clientY - rect.top) / rect.height - 0.5) * 100) / 100);
  }
}
