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
        { path: 'san-dau', component: Stub },
        { path: 'dang-soan', component: PlaceholderPage, data: { heading: 'Khu vực mới', description: 'Mô tả' } },
        { path: '**', component: PlaceholderPage, data: { heading: '404 - Không tìm thấy trang', description: 'Mô tả', section: 'Lạc đường', tone: 'blue' } },
      ], withComponentInputBinding())],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return harness.routeNativeElement as HTMLElement;
  }

  it('trang 404 báo không có trang và dẫn sang các khu vực đã hoạt động', async () => {
    const el = await open('/khong-co');
    expect(el.querySelector('.meta')?.textContent).toContain('Không có trang này');
    expect(el.querySelector('.meta')?.textContent).toContain('Lạc đường');
    expect(el.querySelectorAll('app-explore-cards .kit-card').length).toBe(4);
    expect(el.querySelector('app-explore-cards a[href="/san-dau"]')).toBeTruthy();
  });

  it('không lỗi khi route thiếu section/tone', async () => {
    const el = await open('/dang-soan');
    expect(el.querySelector('.meta')?.textContent).toContain('Căn nhà');
    expect(el.querySelector('.meta')?.textContent).toContain('Đang biên soạn');
  });
});
