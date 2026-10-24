import { afterNextRender, Component, DestroyRef, ElementRef, inject, PLATFORM_ID, signal, viewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../shared/motion/reveal.directive';
import { BOOT_EVENT } from '../../shared/utils/boot';
import { GAME } from '../../shared/game-facts';
import { startInk } from './story-ink';

const words = (text: string) => text.split(' ').map((w, i) => ({ w, i }));

/**
 * Câu chuyện căn nhà theo kiểu Flowstate: đầu trang toàn màn hình với mực loang WebGL, huy hiệu kính, tiêu đề và dòng phụ
 * hiện từng chữ, thanh kính dẫn sang Quỹ nhà; tiếp theo là ba hồi bối cảnh, bảng "đời thật → luật chơi" và ý nghĩa thương hiệu.
 * Nội dung chỉ dựa trên bối cảnh trong tài liệu dự án; cốt truyện chi tiết công bố cùng bản nội dung chính thức.
 */
@Component({
  selector: 'app-story-page',
  imports: [RouterLink, RevealDirective],
  templateUrl: './story.page.html',
  styleUrls: ['./story.page.css', './story-acts.css'],
  host: { '[class.anim]': 'animate', '[class.in]': 'entered()' },
})
export class StoryPage {
  readonly game = GAME;
  readonly title = 'Sống chung khi chưa kịp giàu.';
  readonly subline = `${GAME.players} người trẻ, một căn nhà, một quỹ chung: tiền nhà, điện nước, deadline, việc làm thêm và những lời hứa góp quỹ cuối tháng.`;
  readonly titleWords = words(this.title);
  readonly sublineWords = words(this.subline);
  readonly acts = [
    { title: 'Lần đầu tập sống chung', text: 'Rời vòng tay gia đình để vào ký túc xá, phòng trọ hay căn hộ ở ghép. Chia tiền phòng, chia việc nhà, giữ hòa khí với người ở cùng: mọi thứ đều lần đầu tự lo.', tags: ['Tiền phòng', 'Việc nhà', 'Người ở cùng'] },
    { title: 'Bão hóa đơn', text: 'Tiền nhà, điện nước, ăn uống, lịch học và việc làm thêm dồn về cùng lúc. Hết tiền trước cuối tháng là chuyện thường, nhưng hóa đơn chung vẫn phải trả.', tags: ['Điện nước', 'Ăn uống', 'Làm thêm'] },
    { title: 'Những tình huống dở khóc dở cười', text: 'Tranh luận chia tiền phòng, hứa góp quỹ rồi quên, áp lực khi thấy bạn bè đi nhanh hơn mình. Trò chơi kể lại những chuyện đó bằng giọng hài hước để cả nhóm cùng nhận ra mình.', tags: ['Chia tiền', 'Lời hứa', 'So sánh'] },
  ].map(act => ({ ...act, words: words(act.title) }));
  readonly mirror = [
    { life: 'Hết tiền trước cuối tháng', game: 'Tiền và Sức đều có hạn; lựa chọn nào cũng có giá.' },
    { life: 'Chia tiền nhà, điện nước', game: `Quỹ Chung trả hóa đơn cơ bản ${GAME.bill} Tiền mỗi tháng.` },
    { life: 'Ai cũng có kế hoạch riêng', game: 'Mỗi tháng, mỗi người giữ một mục tiêu cá nhân bí mật.' },
    { life: 'Hứa góp rồi… quên', game: 'Được thương lượng, nhưng hứa suông không được luật bảo vệ.' },
    { life: 'Nhà lục đục, ở không yên', game: 'Thiếu quỹ thì Nhà Chung mất Tim; nhà yếu, chi phí tăng.' },
  ];

  /** Chỉ ẩn chữ để chạy hiệu ứng khi ở trình duyệt và không reduced motion; bản dựng sẵn (SSR) luôn hiện đủ nội dung. */
  readonly animate = isPlatformBrowser(inject(PLATFORM_ID)) && typeof matchMedia === 'function' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  readonly entered = signal(false);
  readonly inkOn = signal(false);
  private readonly ink = viewChild.required<ElementRef<HTMLCanvasElement>>('ink');

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const abort = new AbortController();
      destroyRef.onDestroy(() => abort.abort());
      try { startInk(this.ink().nativeElement, abort.signal, () => this.inkOn.set(true)); } catch { /* giữ nền CSS */ }
      if (!this.animate) return;
      // Chờ màn mở trang (boot curtain) rút xong rồi mới cho chữ hiện, như các reveal khác.
      const enter = () => requestAnimationFrame(() => this.entered.set(true));
      if (document.documentElement.dataset['boot'] === 'pending') addEventListener(BOOT_EVENT, enter, { once: true, signal: abort.signal });
      else enter();
    });
  }
}
