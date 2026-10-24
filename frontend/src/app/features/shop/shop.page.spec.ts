import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ShopProduct, ShopService } from '../../core/shop/shop.service';
import { ShopPage } from './shop.page';

describe('Cửa hàng', () => {
  async function render(products: ReturnType<ShopService['products']>) {
    await TestBed.configureTestingModule({
      imports: [ShopPage],
      providers: [provideRouter([]), { provide: ShopService, useValue: { products: () => products } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(ShopPage);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('hiện thông số trò chơi ở đầu trang và giá lấy từ API cho biến thể còn hàng', async () => {
    const el = await render(of([{ id: 'p', slug: 's', name: 'Bản Standard', description: 'Hộp game', imageUrl: null, variants: [
      { id: 'v1', sku: 'a', name: '1 hộp', priceAmount: 2000, available: true },
      { id: 'v2', sku: 'b', name: '2 hộp', priceAmount: 4000, available: false },
    ] }] as unknown as ShopProduct[]));
    expect(el.querySelector('h1')?.textContent).toContain('bốn người chơi');
    expect(el.querySelector('.facts')?.textContent).toContain('148');
    expect(el.querySelectorAll('.product').length).toBe(2);
    expect(el.querySelector('.buy')?.getAttribute('href')).toBe('/gio-hang?variant=v1');
    expect(el.querySelector('.sold-out')?.textContent).toContain('Tạm hết hàng');
    expect(el.querySelector('.meta strong')?.textContent).toMatch(/2\.000/);
  });

  it('báo lỗi và cho tải lại khi API lỗi', async () => {
    const el = await render(throwError(() => new Error('down')));
    expect(el.querySelector('.state[role="alert"]')?.textContent).toContain('Chưa tải được');
  });
});
