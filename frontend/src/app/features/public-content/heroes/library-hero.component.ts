import { afterNextRender, Component, DestroyRef, ElementRef, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GAME } from '../../../shared/game-facts';

/**
 * Đầu trang Thư viện thẻ theo kiểu KIMI: tờ giấy sáng kẻ lưới, chữ đen đậm cô đặc, một màu nhấn cyan, hàng meta in hoa
 * và hai khung có góc ngoặc. Trang cha ghim khối này và cho danh sách trượt đè lên (khối bị che lùi lại, tối dần).
 * Chiều cao được ghi vào `--h` để vị trí ghim luôn cho đọc hết khối, kể cả khi khối cao hơn màn hình.
 */
@Component({
  selector: 'app-library-hero',
  imports: [RouterLink],
  templateUrl: './library-hero.component.html',
  styleUrl: './library-hero.component.css',
})
export class LibraryHeroComponent {
  readonly heading = input('Tủ thẻ trong nhà');
  readonly description = input('');
  readonly game = GAME;
  /** Các trường của một lá thẻ đã xuất bản (theo dữ liệu trang chi tiết hiển thị). */
  readonly anatomy = [
    { field: 'Mã thẻ', note: 'Tìm nhanh bằng mã hoặc tên' },
    { field: 'Tên & bộ thẻ', note: `Thuộc một trong ${GAME.sets} bộ` },
    { field: 'Hiệu ứng', note: 'Điều lá thẻ làm khi được dùng' },
    { field: 'Ghi chú luật', note: 'Giải thích tình huống đặc biệt' },
    { field: 'Trạng thái luật', note: 'Đã xác nhận hoặc đang rà soát' },
    { field: 'Số lá trong bộ', note: 'Số bản của lá đó trong hộp' },
  ];

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof ResizeObserver !== 'function') return;
      const observer = new ResizeObserver(() => host.style.setProperty('--h', `${host.offsetHeight}px`));
      observer.observe(host);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
