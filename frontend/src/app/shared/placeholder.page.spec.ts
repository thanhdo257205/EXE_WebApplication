import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, it } from 'vitest';
import { PlaceholderPage } from './placeholder.page';

@Component({ template: '' })
class Stub {}

describe('Trang khung', () => {
  async function open(url: string) {
    TestBed.configureTestingModule({
      providers: [provideRouter([
        { path: 'quy-nha', component: PlaceholderPage, data: { heading: 'Mô phỏng Quỹ Nhà Chung', description: 'Mô tả', section: 'Quỹ nhà', tool: 'fund' } },
        { path: 'cach-choi', component: PlaceholderPage, data: { heading: 'Hướng dẫn cách chơi', description: 'Mô tả', chapters: ['Thiết lập bàn chơi', 'Giai đoạn Sự Kiện'] } },
        { path: 'san-dau', component: Stub },
      ], withComponentInputBinding())],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return harness.routeNativeElement as HTMLElement;
  }

  it('không lỗi khi route thiếu chapters và hiện công cụ tương tác', async () => {
    const el = await open('/quy-nha');
    expect(el.querySelector('app-fund-calculator')).toBeTruthy();
    expect(el.querySelector('.kit-rows')).toBeNull();
    expect(el.querySelectorAll('app-explore-cards .kit-card').length).toBe(4);
    expect(el.querySelector('app-explore-cards a[href="/quy-nha"]')).toBeNull();
  });

  it('liệt kê mục lục và dẫn sang các khu vực đã hoạt động', async () => {
    const el = await open('/cach-choi');
    expect([...el.querySelectorAll('.kit-row h3')].map(h => h.textContent?.trim())).toEqual(['Thiết lập bàn chơi', 'Giai đoạn Sự Kiện']);
    expect(el.querySelector('app-explore-cards a[href="/san-dau"]')).toBeTruthy();
  });
});
