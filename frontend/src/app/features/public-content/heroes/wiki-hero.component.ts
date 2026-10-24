import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WikiType } from '../../../core/content/public-content.service';
import { GAME } from '../../../shared/game-facts';

/**
 * Đầu trang Wiki theo kiểu Baseline: khối xanh navy bo góc lồng trong khung, tiêu đề in hoa khổng lồ hiện từng từ sau
 * mặt nạ cắt, chữ ma lớn, dải số liệu kính; tiếp theo là danh sách đánh số năm loại bài viết trên nền sáng.
 * Bấm một loại thì lọc danh sách bên dưới (bấm lại để bỏ lọc) và cuộn tới kết quả.
 */
@Component({
  selector: 'app-wiki-hero',
  imports: [RouterLink],
  templateUrl: './wiki-hero.component.html',
  styleUrl: './wiki-hero.component.css',
})
export class WikiHeroComponent {
  readonly heading = input('Sổ tay chung của căn nhà');
  readonly description = input('');
  readonly active = input<WikiType | ''>('');
  readonly pick = output<WikiType | ''>();
  readonly game = GAME;
  readonly words = computed(() => this.heading().split(' ').map((w, i) => ({ w, i })));
  readonly types: { value: WikiType; label: string; note: string }[] = [
    { value: 'RULE', label: 'Luật chơi', note: 'Quy tắc của ván chơi, đánh dấu đã xác nhận hay đang rà soát.' },
    { value: 'GUIDE', label: 'Hướng dẫn', note: `Từng bước cho người mới, mục tiêu học luật trong ${GAME.learnMinutes} phút.` },
    { value: 'FAQ', label: 'Hỏi đáp', note: 'Câu hỏi thường gặp khi chơi và khi tra thẻ.' },
    { value: 'STORY', label: 'Câu chuyện', note: 'Bối cảnh căn nhà và những người ở chung.' },
    { value: 'DEVLOG', label: 'Nhật ký phát triển', note: 'Thay đổi qua từng bản nội dung.' },
  ];

  choose(value: WikiType): void {
    this.pick.emit(this.active() === value ? '' : value);
    document.getElementById('noi-dung')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
