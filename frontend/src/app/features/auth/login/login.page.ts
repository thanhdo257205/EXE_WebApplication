import { Component, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AuthService } from '../../../core/auth/auth.service';
import { MorphIconComponent } from '../../../shared/components/morph-icon/morph-icon.component';
import { WikiCanvasComponent } from '../../../shared/components/wiki-canvas/wiki-canvas.component';
import { TurnstileComponent } from '../../../shared/components/turnstile/turnstile.component';
import { environment } from '../../../../environments/environment';
import { bcryptPasswordValidator } from '../../../core/auth/auth-form.validators';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [RouterLink, FormsModule, ReactiveFormsModule, MorphIconComponent, WikiCanvasComponent, TurnstileComponent],
  templateUrl: './login.page.html',
  styleUrl: './login.page.css',
})
export class LoginPage {
  private readonly fb = inject(FormBuilder);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.maxLength(72), bcryptPasswordValidator]],
  });

  readonly showPassword = signal(false);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly turnstileSiteKey = signal(environment.turnstileSiteKey);
  readonly challengeToken = signal('');
  private readonly challenge = viewChild(TurnstileComponent);

  togglePasswordVisibility(): void {
    this.showPassword.update(v => !v);
  }

  onSubmit(): void {
    if (this.loginForm.invalid || this.loading()) {
      this.loginForm.markAllAsTouched();
      return;
    }
    if (this.turnstileSiteKey() && !this.challengeToken()) {
      this.errorMessage.set('Vui lòng hoàn tất bước xác minh trước khi đăng nhập.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    const { email, password } = this.loginForm.getRawValue();

    this.auth.login(email!, password!, this.challengeToken()).subscribe({
      next: () => {
        this.loading.set(false);
        const candidate = this.route.snapshot.queryParams['returnUrl'];
        const returnUrl = typeof candidate === 'string' && candidate.startsWith('/') && !candidate.startsWith('//') ? candidate : '/';
        this.router.navigateByUrl(returnUrl);
      },
      error: err => {
        this.loading.set(false);
        this.challengeToken.set('');
        this.challenge()?.reset();
        if (err.status === 401) {
          this.errorMessage.set('Email hoặc mật khẩu không chính xác.');
        } else if (err.status === 403) {
          this.errorMessage.set('Phiên làm việc hết hạn hoặc yêu cầu bị từ chối.');
        } else if (err.status === 429) {
          this.errorMessage.set('Bạn đã thử quá nhiều lần. Vui lòng chờ một phút rồi thử lại.');
        } else {
          this.errorMessage.set('Có lỗi xảy ra khi đăng nhập. Vui lòng thử lại sau.');
        }
      },
    });
  }
}
