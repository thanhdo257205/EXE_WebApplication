import { Component, computed, signal } from '@angular/core';

export type FundStatus = 'thieu' | 'du' | 'thua';

/** Trạng thái quỹ khi đối chiếu tổng tiền góp với hóa đơn. */
export function fundStatus(total: number, bill: number): FundStatus {
  return total < bill ? 'thieu' : total === bill ? 'du' : 'thua';
}

/** Mô phỏng Quỹ Nhà Chung: 4 cư dân góp tiền, đối chiếu với Hóa đơn 8 Tiền (Thiếu · Đủ · Dư). */
@Component({
  selector: 'app-fund-calculator',
  templateUrl: './fund-calculator.component.html',
  styleUrl: './fund-calculator.component.css',
})
export class FundCalculatorComponent {
  readonly bill = 8;
  readonly max = 8;
  readonly residents = ['Cư dân 1', 'Cư dân 2', 'Cư dân 3', 'Cư dân 4'];
  readonly paid = signal([2, 2, 2, 2]);
  readonly coins = computed(() => this.paid().map(value => Array.from({ length: value }, (_, i) => i)));
  readonly total = computed(() => this.paid().reduce((sum, value) => sum + value, 0));
  readonly status = computed(() => fundStatus(this.total(), this.bill));
  readonly gap = computed(() => Math.abs(this.total() - this.bill));
  readonly label = computed(() => ({ thieu: 'Thiếu', du: 'Đủ', thua: 'Dư' })[this.status()]);
  readonly message = computed(() => {
    const gap = this.gap();
    switch (this.status()) {
      case 'thieu': return `Quỹ còn thiếu ${gap} Tiền để trả hóa đơn.`;
      case 'du': return 'Vừa khít! Cả nhà trả đủ hóa đơn.';
      default: return `Quỹ dư ${gap} Tiền sau khi trả hóa đơn.`;
    }
  });
  /** Tỷ lệ lấp đầy thanh tiến độ, tối đa 150% hóa đơn để vẫn thấy phần dư. */
  readonly fill = computed(() => Math.min(this.total() / this.bill, 1.5) / 1.5 * 100);
  readonly billMark = 100 / 1.5;

  change(index: number, delta: number): void {
    this.paid.update(values => values.map((value, i) => i === index ? Math.max(0, Math.min(this.max, value + delta)) : value));
  }
  reset(): void { this.paid.set([2, 2, 2, 2]); }
}
