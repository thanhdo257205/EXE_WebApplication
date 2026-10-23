import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AddressBookComponent } from '../../shared/components/address-book/address-book.component';

/** Trang "Sổ địa chỉ": người dùng nhập/sửa địa chỉ giao hàng trước, để lúc mua chỉ cần chọn. */
@Component({
  selector: 'app-addresses-page',
  standalone: true,
  imports: [RouterLink, AddressBookComponent],
  template: `
    <section class="addresses">
      <a routerLink="/cua-hang" class="back-link">← Về cửa hàng</a>
      <p class="eyebrow">Tài khoản</p>
      <h1 class="display">Sổ địa chỉ</h1>
      <p class="lead">Lưu địa chỉ giao hàng của bạn. Khi mua hàng bạn chỉ cần chọn một địa chỉ đã lưu.</p>
      @if (auth.currentUser()) { <app-address-book /> }
      @else if (auth.checkingSession()) { <p class="state">Đang kiểm tra phiên đăng nhập…</p> }
      @else { <div class="state"><p>Bạn cần đăng nhập để quản lý địa chỉ.</p><a class="cta" routerLink="/dang-nhap" [queryParams]="{ returnUrl: '/dia-chi' }">Đăng nhập</a></div> }
    </section>`,
  styles: [`
    :host{display:block;background:#0b0c0d;color:#f3f1ea;min-height:70vh}
    .addresses{max-width:760px;margin:0 auto;padding:clamp(28px,5vw,64px) var(--gutter,24px) 96px}
    .back-link{font-size:12px;font-weight:500;letter-spacing:.22em;text-transform:uppercase;color:#8f9289}.back-link:hover{color:#f3f1ea}
    .eyebrow{margin:40px 0 0}h1{margin:20px 0 0;font-size:clamp(44px,8vw,96px);line-height:1}
    .lead{max-width:56ch;margin:20px 0 32px;color:#8f9289;line-height:1.6}
    .state{display:grid;gap:16px;justify-items:start;color:#8f9289}
    .cta{display:inline-flex;padding:14px 24px;border-radius:999px;background:#dafa76;color:#183c2b;font-weight:700;font-size:14px}`],
})
export class AddressesPage {
  readonly auth = inject(AuthService);
}
