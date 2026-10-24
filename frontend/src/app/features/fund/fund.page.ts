import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../shared/motion/reveal.directive';
import { GAME } from '../../shared/game-facts';

export type FundStatus = 'thieu' | 'du' | 'thua';

/** Trạng thái quỹ khi đối chiếu tổng tiền góp với hóa đơn. */
export function fundStatus(total: number, bill: number): FundStatus {
  return total < bill ? 'thieu' : total === bill ? 'du' : 'thua';
}

const RESIDENTS = 4;
const EVEN = Array.from({ length: RESIDENTS }, () => GAME.bill / RESIDENTS);

/**
 * Quỹ Nhà Chung theo kiểu bảng điều khiển kính (prompt Ascend): đầu trang nổi trên một "đồng xu hành tinh" phát sáng,
 * lưới luật quỹ, bảng góp quỹ có chế độ góp kín và ba kết cục cuối tháng. Chỉ mô phỏng phép cộng 4 × (0–4) Tiền so với hóa đơn.
 */
@Component({
  selector: 'app-fund-page',
  imports: [RouterLink, RevealDirective],
  templateUrl: './fund.page.html',
  styleUrls: ['./fund.page.css', './fund-sections.css', './fund-dashboard.css'],
})
export class FundPage {
  readonly game = GAME;
  readonly bill = GAME.bill;
  readonly max = GAME.maxContribution;
  /** Tổng tối đa nếu cả 4 người góp kịch 4 Tiền: thang của thanh tiến độ. */
  readonly ceiling = RESIDENTS * GAME.maxContribution;
  readonly residents = Array.from({ length: RESIDENTS }, (_, i) => `Cư dân ${i + 1}`);
  readonly rules = [
    { icon: 'lock', title: 'Góp kín', text: `Cuối tháng, mỗi cư dân góp kín từ 0 đến ${GAME.maxContribution} Tiền vào Quỹ Chung.` },
    { icon: 'hand', title: 'Không bắt buộc', text: 'Không ai bị buộc phải góp. Giữ Tiền lại có thể giúp mục tiêu bí mật của bạn, còn cả nhà gánh rủi ro.' },
    { icon: 'bill', title: `Hóa đơn ${GAME.bill} Tiền`, text: `Hóa đơn cơ bản mỗi tháng là ${GAME.bill} Tiền và được trả bằng Quỹ Chung.` },
    { icon: 'talk', title: 'Thương lượng', text: 'Được bàn bạc, mặc cả, hứa hẹn trước khi góp. Hứa suông thì luật không bảo vệ.' },
    { icon: 'heart', title: 'Mất Tim', text: 'Quỹ không đủ trả hóa đơn thì Nhà Chung mất Tim, tức điểm ổn định của cả nhà.' },
    { icon: 'trend', title: 'Nhà yếu, giá lên', text: 'Nhà càng yếu, chi phí các tháng sau càng có thể tăng.' },
  ] as const;
  readonly presets = [
    { label: 'Chia đều', values: EVEN },
    { label: 'Hai người gánh', values: [4, 4, 0, 0] },
    { label: 'Hụt một chút', values: [2, 2, 2, 1] },
    { label: 'Hào phóng', values: [4, 3, 2, 1] },
  ] as const;
  readonly outcomes = [
    { key: 'thieu', label: 'Thiếu', title: 'Nhà Chung mất Tim', text: 'Quỹ không đủ hóa đơn. Điểm ổn định của cả nhà giảm và các tháng sau có thể đắt hơn.' },
    { key: 'du', label: 'Đủ', title: 'Hóa đơn trả đủ', text: 'Quỹ vừa khít hóa đơn. Nhà giữ được ổn định, không ai phải góp thêm.' },
    { key: 'thua', label: 'Dư', title: 'Quỹ còn dư', text: 'Hóa đơn được trả đủ. Phần dư xử lý thế nào theo bộ luật chính thức.' },
  ] as const;
  readonly stats = [
    { value: String(RESIDENTS), label: 'cư dân góp chung một quỹ' },
    { value: `0–${GAME.maxContribution}`, label: 'Tiền mỗi người góp mỗi tháng' },
    { value: String(GAME.bill), label: 'Tiền hóa đơn cơ bản' },
    { value: String(RESIDENTS * GAME.maxContribution), label: 'Tiền tối đa nếu ai cũng góp đủ' },
  ];

  readonly paid = signal<readonly number[]>(EVEN);
  /** Chế độ góp kín: số góp từng người và kết quả bị che tới khi bấm "Lật quỹ". */
  readonly secret = signal(false);
  readonly revealed = signal(true);
  readonly total = computed(() => this.paid().reduce((sum, value) => sum + value, 0));
  readonly status = computed(() => fundStatus(this.total(), this.bill));
  readonly hidden = computed(() => this.secret() && !this.revealed());
  readonly label = computed(() => ({ thieu: 'Thiếu', du: 'Đủ', thua: 'Dư' })[this.status()]);
  readonly message = computed(() => {
    if (this.hidden()) return 'Mọi người đã úp Tiền. Bấm "Lật quỹ" để xem quỹ có đủ trả hóa đơn không.';
    const gap = Math.abs(this.total() - this.bill);
    switch (this.status()) {
      case 'thieu': return `Quỹ thiếu ${gap} Tiền: Nhà Chung mất Tim.`;
      case 'du': return 'Vừa khít! Cả nhà trả đủ hóa đơn.';
      default: return `Quỹ dư ${gap} Tiền sau khi trả hóa đơn.`;
    }
  });

  change(index: number, delta: number): void {
    this.paid.update(values => values.map((value, i) => (i === index ? Math.max(0, Math.min(this.max, value + delta)) : value)));
    this.revealed.set(!this.secret());
  }
  apply(values: readonly number[]): void {
    this.paid.set(values);
    this.revealed.set(!this.secret());
  }
  toggleSecret(): void {
    this.secret.update(on => !on);
    this.revealed.set(!this.secret());
  }
  flip(): void { this.revealed.set(true); }
  reset(): void { this.secret.set(false); this.apply(EVEN); }
  same(values: readonly number[]): boolean { return values.every((value, i) => value === this.paid()[i]); }
  scrollToBoard(): void { document.getElementById('bang-quy')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}
