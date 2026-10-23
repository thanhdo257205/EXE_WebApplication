import { Component, output } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Màn chắn "xoay ngang điện thoại" của sân đấu (chỉ hiện khi điện thoại cầm dọc). */
@Component({
  selector: 'app-rotate-gate',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="rotate-gate" role="dialog" aria-modal="true" aria-labelledby="rotate-title">
      <svg class="rotate-icon" viewBox="0 0 64 64" aria-hidden="true"><rect x="22" y="6" width="20" height="36" rx="4" fill="none" stroke="#dafa76" stroke-width="3"/><circle cx="32" cy="36" r="1.8" fill="#dafa76"/><path d="M12 50a22 22 0 0 0 40 0" fill="none" stroke="#dafa76" stroke-width="3" stroke-linecap="round"/><path d="M52 44v7h-7" fill="none" stroke="#dafa76" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <h2 id="rotate-title">Hãy xoay ngang điện thoại</h2>
      <p>Sân đấu cần màn hình ngang để thấy đủ bàn chơi và các nút. Xoay máy sang ngang là chơi được ngay, ván đấu không bị mất.</p>
      <button type="button" class="primary" (click)="enter.emit()">Toàn màn hình &amp; xoay ngang</button>
      <p class="note">Nếu máy không tự xoay, hãy bật "Xoay màn hình" trong cài đặt nhanh của điện thoại.</p>
      <a routerLink="/" class="link">Về trang chủ</a>
    </div>`,
  styles: [`
    :host{color:#f3f1ea}
    .rotate-gate{position:fixed;inset:0;z-index:2000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:28px;text-align:center;background:#0b0c0d}
    h2{margin:0;font-size:26px}p{margin:0;max-width:34ch;color:#c9ccc0;line-height:1.6;font-size:14.5px}.note{font-size:12.5px;color:#8f9289}
    .primary{padding:14px 24px;min-height:44px;border:0;border-radius:999px;background:#dafa76;color:#183c2b;font-weight:700;font-size:14px}
    .link{display:inline-flex;align-items:center;min-height:44px;color:#8f9289;text-decoration:underline;font-size:13px}
    .rotate-icon{width:96px;height:96px;animation:turn 2.4s ease-in-out infinite}
    @keyframes turn{0%,25%{transform:rotate(0)}60%,100%{transform:rotate(-90deg)}}
    @media(prefers-reduced-motion:reduce){.rotate-icon{animation:none;transform:rotate(-90deg)}}`],
})
export class RotateGateComponent {
  readonly enter = output<void>();
}
