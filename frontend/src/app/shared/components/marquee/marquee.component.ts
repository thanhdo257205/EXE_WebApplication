import { Component, input } from '@angular/core';

/** Dải chữ chạy ngang vô hạn, chỉ dùng transform CSS (compositor). Bản lặp thứ hai ẩn khỏi trình đọc màn hình. */
@Component({
  selector: 'app-marquee',
  standalone: true,
  template: `
    <div class="marquee" role="presentation">
      <div class="track">
        @for (copy of copies; track copy) {
          <ul [attr.aria-hidden]="copy ? 'true' : null">
            @for (item of items(); track item.text; let i = $index) {
              <li [class.outline]="i % 3 === 1" [class.accent]="i % 3 === 2">{{ item.text }}<span aria-hidden="true">·</span></li>
            }
          </ul>
        }
      </div>
    </div>
  `,
  styles: `
    :host { display: block; }
    .marquee { overflow: hidden; border-block: 1px solid #f3f1ea1a; padding: clamp(18px, 2.4vw, 32px) 0; }
    .track { display: flex; width: max-content; animation: marquee 22s linear infinite; will-change: transform; }
    ul { display: flex; flex: none; margin: 0; padding: 0; list-style: none; }
    li { display: flex; align-items: center; gap: clamp(18px, 3vw, 44px); padding-right: clamp(18px, 3vw, 44px); font-family: var(--font-display, 'Anton', Impact, sans-serif); font-size: clamp(36px, 5.2vw, 80px); font-weight: 400; line-height: 1; letter-spacing: -.01em; text-transform: uppercase; white-space: nowrap; color: #f3f1ea; }
    li.outline { color: transparent; -webkit-text-stroke: 1.5px #f3f1ea; }
    li.accent { color: #dafa76; }
    li span { flex: none; width: .625rem; height: .625rem; border-radius: 999px; background: #dafa76; font-size: 0; }
    @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
    @media (prefers-reduced-motion: reduce) { .track { animation: none; } }
    :host-context(html[data-perf='low']) .track { will-change: auto; }
  `,
})
export class MarqueeComponent {
  readonly items = input.required<readonly { text: string }[]>();
  readonly copies = [0, 1];
}
