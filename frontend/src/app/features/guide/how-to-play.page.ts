import { afterNextRender, Component, DestroyRef, ElementRef, inject, signal, viewChild, viewChildren } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GAME } from '../../shared/game-facts';

interface Chapter { kicker: string; title: string; lead: string; note: string; image: string; tint: string; link?: { label: string; path: string } }

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('vi', { granularity: 'grapheme' }) : null;
const letters = (word: string) => (segmenter ? Array.from(segmenter.segment(word), s => s.segment) : Array.from(word));

/**
 * Cách chơi theo kiểu "chương điện ảnh" (prompt Laocoön): mỗi cơ chế là một chương toàn màn hình, đoạn trang được ghim khi cuộn,
 * lưới 5 đường kẻ có chấm và thanh tiến độ dạng story. Không có JS / reduced motion thì các chương xếp chồng bình thường.
 */
@Component({
  selector: 'app-how-to-play-page',
  imports: [RouterLink],
  templateUrl: './how-to-play.page.html',
  styleUrls: ['./how-to-play.page.css', './how-to-play-frame.css', './how-to-play-spec.css'],
})
export class HowToPlayPage {
  readonly game = GAME;
  readonly chapters: readonly Chapter[] = [
    { kicker: 'Vào nhà', title: 'Bốn người, một nhà', lead: `Mỗi ván có ${GAME.players} người chơi, chọn từ ${GAME.characters} nhân vật (${GAME.male} nam, ${GAME.female} nữ). Mỗi nhân vật mang kỹ năng riêng.`, note: `Một ván kéo dài khoảng ${GAME.minutes} phút theo bản thiết kế. Bối cảnh là đời sống sinh viên Việt Nam lần đầu tự lập.`, image: '/assets/images/can-nha-ban-dem.webp', tint: '#dafa76', link: { label: 'Gặp các cư dân', path: '/cu-dan' } },
    { kicker: 'Mỗi tháng', title: 'Mục tiêu bí mật', lead: 'Mỗi tháng, mỗi người giữ một mục tiêu cá nhân bí mật. Có mục tiêu khuyến khích tích lũy, có mục tiêu khuyến khích đóng góp.', note: 'Bạn muốn thắng cho riêng mình — nhưng vẫn phải sống chung với chính những đối thủ đó.', image: '/assets/cards/card-04.svg', tint: '#ffacc9' },
    { kicker: 'Nguồn lực', title: 'Tiền và Sức', lead: 'Mọi lựa chọn đều có giá bằng Tiền hoặc Sức: tiền nhà, ăn uống, việc làm thêm, deadline.', note: 'Sự kiện theo mùa, nhiệm vụ và drama khiến không tháng nào giống tháng nào.', image: '/assets/cards/card-03.svg', tint: '#b7cfff', link: { label: 'Xem thư viện thẻ', path: '/thu-vien' } },
    { kicker: 'Cuối tháng', title: 'Quỹ Chung góp kín', lead: `Cả nhà trả hóa đơn bằng Quỹ Chung. Mỗi người góp kín 0–${GAME.maxContribution} Tiền và không bắt buộc phải góp; hóa đơn cơ bản là ${GAME.bill} Tiền.`, note: 'Được thương lượng, mặc cả, hứa hẹn — nhưng hứa suông thì luật không bảo vệ.', image: '/assets/cards/card-01.svg', tint: '#ffa55c', link: { label: 'Thử góp quỹ', path: '/quy-nha' } },
    { kicker: 'Hậu quả', title: 'Tim của Nhà Chung', lead: 'Thiếu quỹ, Nhà Chung mất Tim — điểm ổn định của cả nhà.', note: 'Nhà càng yếu, chi phí các tháng sau càng có thể tăng. Giữ tiền cho riêng mình luôn kèm rủi ro chung.', image: '/assets/cards/card-08.svg', tint: '#dafa76', link: { label: 'Đọc wiki luật', path: '/wiki' } },
  ];
  /** Tiêu đề tách từ → ký tự, kèm chỉ số ký tự toàn câu để so le hiệu ứng (30 ms/ký tự). */
  readonly titles = this.chapters.map(c => {
    let k = 0;
    return c.title.split(' ').map(word => letters(word).map(ch => ({ ch, k: k++ })));
  });
  readonly active = signal(0);
  /** Chỉ bật chế độ ghim khi chạy trên trình duyệt và không reduced motion; mặc định các chương xếp chồng (đọc được cả khi thiếu JS). */
  readonly pinned = signal(false);
  private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');
  private readonly dashes = viewChildren<ElementRef<HTMLElement>>('dash');

  pad(n: number): string { return String(n).padStart(2, '0'); }

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      this.pinned.set(true);
      let raf = 0, top = 0, range = 1;
      const measure = () => {
        const box = this.track().nativeElement.getBoundingClientRect();
        top = box.top + scrollY; range = Math.max(1, box.height - innerHeight);
      };
      const update = () => {
        raf = 0;
        const n = this.chapters.length, p = Math.min(1, Math.max(0, (scrollY - top) / range)) * n;
        const index = Math.min(n - 1, Math.floor(p));
        if (index !== this.active()) this.active.set(index);
        this.dashes().forEach((dash, i) => { dash.nativeElement.style.transform = `scaleY(${i < index ? 1 : i === index ? p - index : 0})`; });
      };
      const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
      const onResize = () => { measure(); onScroll(); };
      requestAnimationFrame(() => { measure(); update(); });
      addEventListener('scroll', onScroll, { passive: true });
      addEventListener('resize', onResize);
      destroyRef.onDestroy(() => { cancelAnimationFrame(raf); removeEventListener('scroll', onScroll); removeEventListener('resize', onResize); });
    });
  }
}
