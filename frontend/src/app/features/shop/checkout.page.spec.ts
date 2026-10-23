import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { ShopOrder, ShopService } from '../../core/shop/shop.service';
import { Address, AddressService } from '../../core/shop/address.service';
import { CheckoutPage, checkoutErrorMessage } from './checkout.page';

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,QR') } }));

const VARIANT = 'variant-1';
const product = { id: 'p', slug: 's', name: 'Pokémon Hoàng Nam', description: null, imageUrl: null, variants: [{ id: VARIANT, sku: 'k', name: '1 lá', priceAmount: 2000, available: true }] };
const saved: Address = { id: 'a1', label: 'Nhà', recipientName: 'Hoàng Nam', phone: '0900000000', addressLine: '12 Đường Thử', ward: 'Phường 1', district: 'Quận 1', province: 'TP. Hồ Chí Minh', isDefault: true, createdAt: '2026-10-23T00:00:00.000000Z' };
const order: ShopOrder = { id: 'o1', number: 'EXE-1', status: 'PENDING_PAYMENT', paymentStatus: 'UNPAID', total: 2000, received: 0, paymentState: 'PENDING', checkoutUrl: 'https://pay.payos.vn/x', qrCode: 'qr-payload' };

describe('CheckoutPage', () => {
  let addresses: { list: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  let shop: { products: ReturnType<typeof vi.fn>; checkout: ReturnType<typeof vi.fn>; order: ReturnType<typeof vi.fn>; refreshPayment: ReturnType<typeof vi.fn> };
  const user = signal<unknown>({ id: 'u', email: 'a@b.c', displayName: 'Hoàng Nam', role: 'CUSTOMER' });
  beforeEach(() => {
    shop = { products: vi.fn(() => of([product])), checkout: vi.fn(() => of(order)), order: vi.fn(() => of(order)), refreshPayment: vi.fn(() => of(order)) };
    addresses = { list: vi.fn(() => of([saved])), create: vi.fn(() => of(saved)) };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ShopService, useValue: shop }, { provide: AddressService, useValue: addresses }, { provide: AuthService, useValue: { currentUser: user, checkingSession: signal(false) } }] });
  });
  const create = async (variant: string | null = VARIANT) => {
    const fixture = TestBed.createComponent(CheckoutPage);
    fixture.componentRef.setInput('variant', variant ?? undefined);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    return fixture;
  };

  it('shows an empty state without a variant', async () => {
    const fixture = await create(null);
    expect(fixture.componentInstance.loadState()).toBe('missing');
  });

  it('asks signed-out visitors to log in and keeps the return URL', async () => {
    user.set(null);
    const fixture = await create();
    expect(fixture.nativeElement.textContent).toContain('Đăng nhập để mua');
    expect(fixture.componentInstance.loginQuery).toEqual({ returnUrl: '/gio-hang?variant=variant-1' });
    user.set({ id: 'u', email: 'a@b.c', displayName: 'Hoàng Nam', role: 'CUSTOMER' });
  });

  it('does not call checkout until a delivery address exists', async () => {
    addresses.list.mockReturnValue(of([]));
    const fixture = await create();
    fixture.componentInstance.submit();
    expect(shop.checkout).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error()).toContain('địa chỉ');
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Bạn chưa có địa chỉ giao hàng');           // vào thẳng phần nhập địa chỉ
    expect(root.querySelector('.cta.submit')?.hasAttribute('disabled')).toBe(true);
    expect(root.querySelector('.cta.submit')?.textContent).toContain('Nhập địa chỉ');
  });

  it('adds the first address inline, then pays with it', async () => {
    addresses.list.mockReturnValueOnce(of([])).mockReturnValue(of([saved]));
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;
    const set = (name: string, value: string) => { const input = root.querySelector<HTMLInputElement>(`input[formcontrolname="${name}"]`)!; input.value = value; input.dispatchEvent(new Event('input')); };
    set('recipientName', 'Hoàng Nam'); set('phone', '0900000000'); set('addressLine', '12 Đường Thử'); set('province', 'TP. Hồ Chí Minh');
    (root.querySelector('app-address-book form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await vi.waitFor(() => expect(addresses.create).toHaveBeenCalled());
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.componentInstance.address()?.id).toBe('a1');
    fixture.componentInstance.submit();
    expect(shop.checkout).toHaveBeenCalledTimes(1);
  });

  it('pre-selects the saved default address and submits its snapshot, reusing the idempotency key on retry', async () => {
    const fixture = await create();
    const page = fixture.componentInstance;
    expect(page.address()?.id).toBe('a1');
    shop.checkout.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 503 })));
    page.submit();
    expect(page.error()).toContain('tạm thời không khả dụng');
    page.submit();
    await vi.waitFor(() => expect(page.qrImage()).toBe('data:image/png;base64,QR'));
    const [firstKey, variantId, input] = shop.checkout.mock.calls[0];
    expect(shop.checkout.mock.calls[1][0]).toBe(firstKey);
    expect(variantId).toBe(VARIANT);
    expect(input).toEqual({ recipientName: 'Hoàng Nam', recipientPhone: '0900000000', addressLine: '12 Đường Thử, Phường 1, Quận 1', province: 'TP. Hồ Chí Minh', note: null });
    expect(page.order()?.id).toBe('o1');
  });

  it('maps API failures to readable messages', () => {
    const err = (status: number) => new HttpErrorResponse({ status });
    expect(checkoutErrorMessage(err(401))).toContain('đăng nhập');
    expect(checkoutErrorMessage(err(409))).toContain('hết hàng');
    expect(checkoutErrorMessage(err(429))).toContain('quá nhanh');
    expect(checkoutErrorMessage(err(0))).toContain('Chưa tạo được');
  });
});
