import { Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize, timer } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { formatVnd, ShopOrder, ShopProduct, ShopService, ShopVariant } from '../../core/shop/shop.service';
import { RiseHeadingDirective } from '../../shared/motion/rise-heading.directive';

const POLL_MS = 5_000;

export function checkoutErrorMessage(error: unknown): string {
  const status = error instanceof HttpErrorResponse ? error.status : 0;
  if (status === 401) return 'Phiên đăng nhập đã hết. Vui lòng đăng nhập lại rồi thử thanh toán.';
  if (status === 400) return 'Thông tin chưa hợp lệ. Hãy kiểm tra họ tên, số điện thoại và địa chỉ.';
  if (status === 409) return 'Sản phẩm vừa hết hàng, đơn đang chờ khác, hoặc thông tin đơn bị thay đổi. Vui lòng tải lại trang và thử lại.';
  if (status === 429) return 'Bạn thao tác quá nhanh. Vui lòng đợi một chút rồi thử lại.';
  if (status === 503) return 'Cổng thanh toán đang tạm thời không khả dụng. Vui lòng thử lại sau.';
  return 'Chưa tạo được đơn thanh toán. Vui lòng thử lại.';
}

@Component({
  selector: 'app-checkout-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, RiseHeadingDirective],
  templateUrl: './checkout.page.html',
  styleUrl: './checkout.page.css',
})
export class CheckoutPage {
  private readonly fb = inject(FormBuilder);
  private readonly shop = inject(ShopService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);
  /** Query param `variant` (component input binding). */
  readonly variant = input<string | undefined>(undefined);

  readonly product = signal<ShopProduct | null>(null);
  readonly selected = signal<ShopVariant | null>(null);
  readonly loadState = signal<'loading' | 'ready' | 'missing' | 'failed'>('loading');
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly order = signal<ShopOrder | null>(null);
  readonly qrImage = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly price = formatVnd;

  readonly form = this.fb.nonNullable.group({
    recipientName: ['', [Validators.required, Validators.maxLength(120)]],
    recipientPhone: ['', [Validators.required, Validators.pattern(/^[+0-9 ()-]{8,32}$/)]],
    addressLine: ['', [Validators.required, Validators.maxLength(500)]],
    province: ['', [Validators.required, Validators.maxLength(120)]],
    note: ['', [Validators.maxLength(1000)]],
  });

  private idempotency: { fingerprint: string; key: string } | null = null;
  private polling = false;

  constructor() {
    effect(() => this.loadProduct(this.variant()));
    effect(() => {
      const user = this.auth.currentUser();
      if (user && !this.form.controls.recipientName.value) this.form.controls.recipientName.setValue(user.displayName);
    });
    this.destroyRef.onDestroy(() => { this.polling = false; });
  }

  private loadProduct(variantId: string | undefined) {
    this.order.set(null); this.qrImage.set(null);
    if (!variantId) { this.loadState.set('missing'); return; }
    this.loadState.set('loading');
    this.shop.products().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: products => {
        for (const product of products) {
          const found = product.variants.find(v => v.id === variantId);
          if (found) { this.product.set(product); this.selected.set(found); this.loadState.set(found.available ? 'ready' : 'missing'); return; }
        }
        this.loadState.set('missing');
      },
      error: () => this.loadState.set('failed'),
    });
  }

  get loginLink() { return ['/dang-nhap']; }
  get loginQuery() { return { returnUrl: `/gio-hang?variant=${this.variant() ?? ''}` }; }

  submit() {
    const variant = this.selected();
    if (!variant || this.submitting()) return;
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const value = this.form.getRawValue();
    const input = { ...value, note: value.note.trim() || null };
    const fingerprint = JSON.stringify([variant.id, input]);
    // Giữ nguyên khóa khi thử lại cùng dữ liệu (tránh tạo đơn trùng); đổi dữ liệu thì cần khóa mới.
    if (this.idempotency?.fingerprint !== fingerprint) this.idempotency = { fingerprint, key: crypto.randomUUID() };
    this.submitting.set(true); this.error.set(null);
    this.shop.checkout(this.idempotency.key, variant.id, input).pipe(finalize(() => this.submitting.set(false))).subscribe({
      next: order => this.showOrder(order),
      error: err => this.error.set(checkoutErrorMessage(err)),
    });
  }

  private async showOrder(order: ShopOrder) {
    this.order.set(order);
    this.notice.set(order.qrCode ? null : 'Mã QR chưa sẵn sàng. Hãy bấm “Kiểm tra thanh toán” sau ít phút.');
    if (order.qrCode) {
      try {
        const { default: QRCode } = await import('qrcode');
        this.qrImage.set(await QRCode.toDataURL(order.qrCode, { margin: 1, width: 320, errorCorrectionLevel: 'M' }));
      } catch { this.notice.set('Không tạo được ảnh QR. Hãy dùng nút “Mở trang thanh toán PayOS”.'); }
    }
    this.poll(order.id);
  }

  private poll(id: string) {
    if (this.polling) return;
    this.polling = true;
    const step = () => {
      if (!this.polling) return;
      timer(POLL_MS).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        if (!this.polling) return;
        if (document.hidden) { step(); return; }
        this.shop.order(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: next => { this.order.set(next); if (this.finished(next)) this.polling = false; else step(); },
          error: () => step(),
        });
      });
    };
    step();
  }

  finished(order: ShopOrder | null) { return !order || order.paymentStatus === 'PAID' || !order.checkoutUrl; }
  paid(order: ShopOrder | null) { return order?.paymentStatus === 'PAID'; }

  check() {
    const order = this.order();
    if (!order) return;
    this.notice.set(null);
    this.shop.refreshPayment(order.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: next => { this.order.set(next); if (!this.finished(next) && !this.polling) this.poll(next.id); },
      error: err => this.notice.set(err instanceof HttpErrorResponse && err.status === 429
        ? 'Vui lòng đợi vài giây trước khi kiểm tra lại.' : 'Chưa kiểm tra được thanh toán. Thử lại sau.'),
    });
  }
}
