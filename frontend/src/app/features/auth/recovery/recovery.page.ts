import { Component, DestroyRef, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { WikiCanvasComponent } from '../../../shared/components/wiki-canvas/wiki-canvas.component';

@Component({
  selector: 'app-recovery-page',
  imports: [RouterLink, ReactiveFormsModule, WikiCanvasComponent],
  templateUrl: './recovery.page.html',
  styleUrls: ['../login/login.page.css', './recovery.page.css'],
})
export class RecoveryPage {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  readonly isReset = this.route.snapshot.data['resetPassword'] === true;
  readonly loading = signal(false);
  readonly completed = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  private token = '';
  readonly emailForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
  });
  readonly passwordForm = this.fb.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
    confirmPassword: ['', Validators.required],
  }, { validators: control => control.get('password')?.value === control.get('confirmPassword')?.value ? null : { mismatch: true } });

  constructor() {
    if (this.isReset) {
      // URL fragments never reach the server/Referer. Remove the token from browser history immediately.
      const fragment = this.route.snapshot.fragment ?? '';
      this.token = new URLSearchParams(fragment).get('token') ?? '';
      const win = this.document.defaultView;
      if (win && fragment) win.history.replaceState(win.history.state, '', win.location.pathname);
      if (!/^[A-Za-z0-9_-]{43}$/.test(this.token)) {
        this.error.set('Liên kết khôi phục không hợp lệ. Hãy yêu cầu một liên kết mới.');
      }
    }
  }

  submit() {
    if (this.loading() || this.completed()) return;
    const form = this.isReset ? this.passwordForm : this.emailForm;
    if (form.invalid) { form.markAllAsTouched(); return; }
    this.error.set('');
    if (this.isReset && !/^[A-Za-z0-9_-]{43}$/.test(this.token)) {
      this.error.set('Liên kết không hợp lệ. Hãy yêu cầu một liên kết mới.'); return;
    }
    const { password } = this.passwordForm.getRawValue();
    if (this.isReset && (password.trim().length === 0 || new TextEncoder().encode(password).length > 72)) {
      this.error.set('Mật khẩu cần có ít nhất 8 ký tự và tối đa 72 byte UTF-8.'); return;
    }
    this.loading.set(true);
    const request: Observable<unknown> = this.isReset
      ? this.auth.resetPassword(this.token, password)
      : this.auth.forgotPassword(this.emailForm.getRawValue().email.trim());
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.loading.set(false);
        this.completed.set(true);
        this.token = '';
        this.passwordForm.reset();
        this.message.set(this.isReset
          ? 'Đã đổi mật khẩu và đăng xuất các phiên cũ. Hãy đăng nhập bằng mật khẩu mới.'
          : 'Nếu email thuộc tài khoản dùng mật khẩu, bạn sẽ nhận được liên kết khôi phục có hạn 15 phút. Hãy kiểm tra cả thư rác. Có thể yêu cầu lại sau một phút.');
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err.status === 429 ? 'Bạn đã thử quá nhiều lần. Vui lòng chờ một phút rồi thử lại.'
          : err.status === 400 && this.isReset ? 'Liên kết không hợp lệ, đã dùng hoặc hết hạn. Hãy yêu cầu liên kết mới.'
          : err.status === 503 ? 'Dịch vụ khôi phục đang tạm ngưng. Vui lòng thử lại sau hoặc liên hệ hỗ trợ.'
          : 'Chưa hoàn tất yêu cầu. Vui lòng kiểm tra kết nối và thử lại.');
      },
    });
  }
}
