import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';

export interface ShopVariant { id: string; sku: string; name: string; priceAmount: number; available: boolean; }
export interface ShopProduct { id: string; slug: string; name: string; description: string | null; imageUrl: string | null; variants: ShopVariant[]; }
export interface CheckoutInput { recipientName: string; recipientPhone: string; addressLine: string; province: string; note: string | null; }
export interface ShopOrder {
  id: string; number: string; status: string; paymentStatus: string; total: number; received: number;
  paymentState: string; checkoutUrl: string | null; qrCode: string | null;
}

export const formatVnd = (amount: number) => `${new Intl.NumberFormat('vi-VN').format(amount)} ₫`;

/** Cửa hàng: giá và tồn kho luôn do backend quyết định; client chỉ gửi variantId và thông tin giao hàng. */
@Injectable({ providedIn: 'root' })
export class ShopService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private get base() {
    if (!environment.apiBaseUrl) throw new Error('API URL chưa được cấu hình.');
    return `${environment.apiBaseUrl}/v1`;
  }

  products() { return this.http.get<ShopProduct[]>(`${this.base}/shop/products`, { withCredentials: true }); }

  checkout(idempotencyKey: string, variantId: string, input: CheckoutInput) {
    return this.auth.getCsrf().pipe(switchMap(csrf => this.http.post<ShopOrder>(
      `${this.base}/checkout`,
      { idempotencyKey, items: [{ variantId, quantity: 1 }], ...input, note: input.note || null },
      { withCredentials: true, headers: new HttpHeaders({ [csrf.headerName]: csrf.token }) },
    )));
  }

  order(id: string) { return this.http.get<ShopOrder>(`${this.base}/orders/${encodeURIComponent(id)}`, { withCredentials: true }); }

  refreshPayment(id: string) {
    return this.auth.getCsrf().pipe(switchMap(csrf => this.http.post<ShopOrder>(
      `${this.base}/orders/${encodeURIComponent(id)}/refresh-payment`, null,
      { withCredentials: true, headers: new HttpHeaders({ [csrf.headerName]: csrf.token }) },
    )));
  }
}
