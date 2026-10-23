import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { FundCalculatorComponent, fundStatus } from './fund-calculator.component';

describe('Quỹ Nhà Chung', () => {
  it('phân loại Thiếu / Đủ / Dư so với hóa đơn', () => {
    expect(fundStatus(7, 8)).toBe('thieu');
    expect(fundStatus(8, 8)).toBe('du');
    expect(fundStatus(9, 8)).toBe('thua');
  });

  it('cập nhật tổng, kết quả và giới hạn 0..8 khi bấm nút', async () => {
    await TestBed.configureTestingModule({ imports: [FundCalculatorComponent] }).compileComponents();
    const fixture = TestBed.createComponent(FundCalculatorComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const verdict = () => el.querySelector('.verdict')?.textContent?.trim();
    expect(verdict()).toBe('Đủ');
    el.querySelector<HTMLButtonElement>('[aria-label="Bớt 1 Tiền của Cư dân 1"]')!.click(); fixture.detectChanges();
    expect(verdict()).toBe('Thiếu');
    expect(el.querySelector('.result p')?.textContent).toContain('thiếu 1 Tiền');
    for (let i = 0; i < 10; i++) el.querySelector<HTMLButtonElement>('[aria-label="Thêm 1 Tiền cho Cư dân 2"]')!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.paid()[1]).toBe(8);
    expect(verdict()).toBe('Dư');
    expect(fixture.componentInstance.total()).toBe(13);
    fixture.componentInstance.reset(); fixture.detectChanges();
    expect(verdict()).toBe('Đủ');
  });
});
