import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { FundPage, fundStatus } from './fund.page';

describe('Quỹ Nhà Chung', () => {
  async function render() {
    await TestBed.configureTestingModule({ imports: [FundPage], providers: [provideRouter([])] }).compileComponents();
    const fixture = TestBed.createComponent(FundPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const click = (selector: string) => { el.querySelector<HTMLButtonElement>(selector)!.click(); fixture.detectChanges(); };
    return { fixture, el, click, verdict: () => el.querySelector('.verdict')?.textContent?.trim() };
  }

  it('phân loại Thiếu / Đủ / Dư so với hóa đơn', () => {
    expect(fundStatus(7, 8)).toBe('thieu');
    expect(fundStatus(8, 8)).toBe('du');
    expect(fundStatus(9, 8)).toBe('thua');
  });

  it('giới hạn 0..4 Tiền mỗi cư dân và cập nhật kết quả, kết cục đang áp dụng', async () => {
    const { fixture, el, click, verdict } = await render();
    expect(verdict()).toBe('Đủ');
    click('[aria-label="Bớt 1 Tiền của Cư dân 1"]');
    expect(verdict()).toBe('Thiếu');
    expect(el.querySelector('.message')?.textContent).toContain('thiếu 1 Tiền');
    expect(el.querySelector('.outcome.now')?.getAttribute('data-key')).toBe('thieu');
    for (let i = 0; i < 10; i++) click('[aria-label="Thêm 1 Tiền cho Cư dân 2"]');
    expect(fixture.componentInstance.paid()[1]).toBe(4);
    expect(fixture.componentInstance.total()).toBe(9);
    expect(verdict()).toBe('Dư');
  });

  it('chọn kịch bản có sẵn và đánh dấu chip đang chọn', async () => {
    const { el, click, verdict } = await render();
    const chips = [...el.querySelectorAll<HTMLButtonElement>('.chip')];
    expect(chips[0].getAttribute('aria-pressed')).toBe('true');
    click('.chip:nth-child(2)');
    expect(verdict()).toBe('Đủ');
    expect(chips[1].getAttribute('aria-pressed')).toBe('true');
    click('.chip:nth-child(3)');
    expect(verdict()).toBe('Thiếu');
  });

  it('góp kín che tổng và kết quả tới khi lật quỹ; đổi số góp thì úp lại', async () => {
    const { el, click, verdict } = await render();
    click('.switch');
    expect(el.querySelector('.switch')?.getAttribute('aria-checked')).toBe('true');
    expect(verdict()).toBe('Đang úp');
    expect(el.querySelector('.total dd')?.textContent).toContain('??');
    expect(el.querySelector('.outcome.now')).toBeNull();
    click('.flip');
    expect(verdict()).toBe('Đủ');
    expect(el.querySelector('.flip')).toBeNull();
    click('[aria-label="Thêm 1 Tiền cho Cư dân 3"]');
    expect(verdict()).toBe('Đang úp');
    click('.flip');
    expect(verdict()).toBe('Dư');
    click('.reset');
    expect(el.querySelector('.switch')?.getAttribute('aria-checked')).toBe('false');
    expect(verdict()).toBe('Đủ');
  });
});
