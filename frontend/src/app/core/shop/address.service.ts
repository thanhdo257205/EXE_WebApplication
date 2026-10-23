import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { switchMap, type Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';

export interface Address {
  id: string; label: string | null; recipientName: string; phone: string; addressLine: string;
  ward: string | null; district: string | null; province: string; isDefault: boolean; createdAt: string;
}
export interface AddressInput {
  label: string | null; recipientName: string; phone: string; addressLine: string;
  ward: string | null; district: string | null; province: string; isDefault: boolean;
}

/** Dòng địa chỉ đầy đủ gửi kèm đơn hàng (đơn lưu bản chụp, sửa sổ địa chỉ sau đó không đổi đơn cũ). */
export const fullAddressLine = (a: Pick<Address, 'addressLine' | 'ward' | 'district'>) =>
  [a.addressLine, a.ward, a.district].filter((part): part is string => !!part && !!part.trim()).join(', ');

/** Sổ địa chỉ giao hàng của người dùng đã đăng nhập (API /v1/addresses). */
@Injectable({ providedIn: 'root' })
export class AddressService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private get base() {
    if (!environment.apiBaseUrl) throw new Error('API URL chưa được cấu hình.');
    return `${environment.apiBaseUrl}/v1/addresses`;
  }
  private write<T>(call: (headers: HttpHeaders) => Observable<T>) {
    return this.auth.getCsrf().pipe(switchMap(csrf => call(new HttpHeaders({ [csrf.headerName]: csrf.token }))));
  }

  list() { return this.http.get<Address[]>(this.base, { withCredentials: true }); }
  create(input: AddressInput) { return this.write<Address>(headers => this.http.post<Address>(this.base, input, { withCredentials: true, headers })); }
  update(id: string, input: AddressInput) { return this.write<Address>(headers => this.http.put<Address>(`${this.base}/${encodeURIComponent(id)}`, input, { withCredentials: true, headers })); }
  setDefault(id: string) { return this.write<Address[]>(headers => this.http.post<Address[]>(`${this.base}/${encodeURIComponent(id)}/default`, null, { withCredentials: true, headers })); }
  remove(id: string) { return this.write<Address[]>(headers => this.http.delete<Address[]>(`${this.base}/${encodeURIComponent(id)}`, { withCredentials: true, headers })); }
}
