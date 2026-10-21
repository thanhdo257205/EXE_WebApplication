import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { ShopOrder, ShopService } from '../../core/shop/shop.service';
import { CheckoutPage, checkoutErrorMessage } from './checkout.page';

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,QR') } }));

const VARIANT = 'variant-1';
const product = { id: 'p', slug: 's', name: 'Pokémon Hoàng Nam', description: null, imageUrl: null, variants: [{ id: VARIANT, sku: 'k', name: '1 lá', priceAmount: 2000, available: true }] };
const order: ShopOrder = { id: 'o1', number: 'EXE-1', status: 'PENDING_PAYMENT', paymentStatus: 'UNPAID', total: 2000, received: 0, paymentState: 'PENDING', checkoutUrl: 'https://pay.payos.vn/x', qrCode: 'qr-payload' };

describe('CheckoutPage', () => {
  let shop: { products: ReturnType<typeof vi.fn>; checkout: ReturnType<typeof vi.fn>; order: ReturnType<typeof vi.fn>; refreshPayment: ReturnType<typeof vi.fn> };
  const user = signal<unknown>({ id: 'u', email: 'a@b.c', displayName: 'Hoàng Nam', role: 'CUSTOMER' });
  beforeEach(() => {
    shop = { products: vi.fn(() => of([product])), checkout: vi.fn(() => of(order)), order: vi.fn(() => of(order)), refreshPayment: vi.fn(() => of(order)) };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ShopService, useValue: shop }, { provide: AuthService, useValue: { currentUser: user, checkingSession: signal(false) } }] });
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

  it('validates the delivery form before calling checkout', async () => {
    const fixture = await create();
    fixture.componentInstance.submit();
    expect(shop.checkout).not.toHaveBeenCalled();
    expect(fixture.componentInstance.form.invalid).toBe(true);
  });

  it('submits delivery info, reuses the idempotency key on retry and renders the QR', async () => {
    const fixture = await create();
    const page = fixture.componentInstance;
    expect(page.form.controls.recipientName.value).toBe('Hoàng Nam');
    page.form.patchValue({ recipientPhone: '0900000000', addressLine: '12 Đường Thử', province: 'TP. Hồ Chí Minh' });
    shop.checkout.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 503 })));
    page.submit();
    expect(page.error()).toContain('tạm thời không khả dụng');
    page.submit();
    await vi.waitFor(() => expect(page.qrImage()).toBe('data:image/png;base64,QR'));
    const [firstKey, , input] = [shop.checkout.mock.calls[0][0], shop.checkout.mock.calls[0][1], shop.checkout.mock.calls[0][2]];
    expect(shop.checkout.mock.calls[1][0]).toBe(firstKey);
    expect(shop.checkout.mock.calls[0][1]).toBe(VARIANT);
    expect(input).toMatchObject({ recipientPhone: '0900000000', note: null });
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
