import { afterNextRender, Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CountUpDirective } from '../../shared/motion/count-up.directive';
import { RevealDirective } from '../../shared/motion/reveal.directive';
import { GAME } from '../../shared/game-facts';
import { formatVnd, ShopProduct, ShopService } from '../../core/shop/shop.service';
import { startLiquidReveal } from './liquid-reveal';

const HERO_IMAGE = '/assets/images/can-nha-ban-dem.webp';

/**
 * Cửa hàng theo kiểu Lumora: nền sáng, ảnh căn nhà toàn khung bo góc dưới được làm nhạt và con trỏ quét ra bản màu,
 * chữ ma lớn, thẻ thông tin xoay vòng, hàng trạng thái; sản phẩm trên thẻ sáng, cách mua và số liệu trong một khối đen.
 * Giá và tên sản phẩm luôn lấy từ API, trang không tự đặt giá.
 */
@Component({
  selector: 'app-shop-page',
  standalone: true,
  imports: [RouterLink, CountUpDirective, RevealDirective],
  templateUrl: './shop.page.html',
  styleUrls: ['./shop.page.css', './shop-hero.css'],
})
export class ShopPage {
  private readonly shop = inject(ShopService);
  readonly game = GAME;
  readonly heroImage = HERO_IMAGE;
  readonly products = signal<ShopProduct[] | null>(null);
  readonly failed = signal(false);
  readonly price = formatVnd;
  readonly lines = ['Một hộp game,', `${['một', 'hai', 'ba', 'bốn'][GAME.players - 1]} người chơi,`, 'một tháng sống chung.'];
  readonly slides = [
    { caption: 'Trong hộp', title: `${GAME.cards} lá thẻ, ${GAME.sets} bộ.` },
    { caption: 'Nhân vật', title: `${GAME.characters} cư dân, ${GAME.male} nam ${GAME.female} nữ.` },
    { caption: 'Học luật', title: `Quick Start, mục tiêu ≤${GAME.learnMinutes} phút.` },
  ];
  readonly slide = signal(0);
  readonly services = [
    { label: 'Thanh toán', value: 'Mã QR PayOS' },
    { label: 'Giao hàng', value: 'Theo sổ địa chỉ' },
    { label: 'Trạng thái', value: 'Bản thử nghiệm' },
  ];
  readonly steps = [
    { title: 'Chọn sản phẩm', text: 'Bấm “Mua ngay” ở sản phẩm muốn đặt để chuyển sang giỏ hàng và thanh toán.' },
    { title: 'Chọn địa chỉ giao', text: 'Chọn một địa chỉ trong sổ địa chỉ; nếu chưa có, trang sẽ mở phần nhập địa chỉ trước khi đặt.' },
    { title: 'Quét mã QR PayOS', text: 'Quét mã bằng ứng dụng ngân hàng; đơn được xác nhận khi PayOS báo đã nhận tiền.' },
  ];
  readonly stats = [
    { value: GAME.players, label: 'người chơi mỗi ván' },
    { value: GAME.characters, label: 'nhân vật để chọn' },
    { value: GAME.cards, label: 'lá thẻ trong hộp' },
    { value: GAME.sets, label: 'bộ thẻ' },
  ];
  private readonly hero = viewChild.required<ElementRef<HTMLElement>>('hero');
  private readonly reveal = viewChild.required<ElementRef<HTMLCanvasElement>>('reveal');

  constructor() {
    this.load();
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const abort = new AbortController();
      destroyRef.onDestroy(() => abort.abort());
      try { startLiquidReveal(this.hero().nativeElement, this.reveal().nativeElement, HERO_IMAGE, abort.signal); } catch { /* giữ ảnh tĩnh */ }
      if (typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const timer = setInterval(() => this.slide.update(i => (i + 1) % this.slides.length), 3800);
      abort.signal.addEventListener('abort', () => clearInterval(timer));
    });
  }

  load(): void {
    this.failed.set(false);
    this.products.set(null);
    this.shop.products().subscribe({ next: list => this.products.set(list), error: () => this.failed.set(true) });
  }
  scrollTo(id: string): void { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}
