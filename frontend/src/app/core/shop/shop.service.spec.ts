import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { formatVnd, ShopService } from './shop.service';

describe('ShopService', () => {
  let service: ShopService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AuthService, useValue: { getCsrf: vi.fn(() => of({ headerName: 'X-CSRF', token: 'tok' })) } }],
    });
    service = TestBed.inject(ShopService);
    http = TestBed.inject(HttpTestingController);
  });

  it('formats VND amounts', () => { expect(formatVnd(2000).replace(/\s/g, ' ')).toMatch(/^2\.000 ₫$/); });

  it('loads the public catalog without sending credentials-only headers', () => {
    service.products().subscribe(list => expect(list[0].variants[0].priceAmount).toBe(2000));
    const req = http.expectOne('/api/v1/shop/products');
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 'p', slug: 's', name: 'n', description: null, imageUrl: null, variants: [{ id: 'v', sku: 'k', name: '1 lá', priceAmount: 2000, available: true }] }]);
  });

  it('posts checkout with CSRF, idempotency key and only the variant id/quantity (never a price)', () => {
    service.checkout('key-1234567890abcdef', 'variant-id', { recipientName: 'A', recipientPhone: '0900000000', addressLine: 'B', province: 'C', note: '' }).subscribe();
    const req = http.expectOne('/api/v1/checkout');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('X-CSRF')).toBe('tok');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.body).toEqual({ idempotencyKey: 'key-1234567890abcdef', items: [{ variantId: 'variant-id', quantity: 1 }], recipientName: 'A', recipientPhone: '0900000000', addressLine: 'B', province: 'C', note: null });
    req.flush({});
  });

  it('reads an order and requests a payment refresh with CSRF', () => {
    service.order('o/1').subscribe();
    http.expectOne('/api/v1/orders/o%2F1').flush({});
    service.refreshPayment('o1').subscribe();
    const refresh = http.expectOne('/api/v1/orders/o1/refresh-payment');
    expect(refresh.request.method).toBe('POST');
    expect(refresh.request.headers.get('X-CSRF')).toBe('tok');
    refresh.flush({});
  });
});
