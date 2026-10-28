import { RiseHeadingDirective } from '../../../shared/motion/rise-heading.directive';
import { Component, DestroyRef, HostListener, inject, OnInit, PLATFORM_ID, signal, viewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, timer } from 'rxjs';
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
  imports: [RiseHeadingDirective, RouterLink, FormsModule, ReactiveFormsModule, MorphIconComponent, WikiCanvasComponent, TurnstileComponent],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.css', './login.form.css'],
})
export class LoginPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);

  readonly loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.maxLength(72), bcryptPasswordValidator]],
  });

  readonly showPassword = signal(false);
  readonly loading = signal(false);
  readonly googleLoading = signal(false);
  readonly connectionMessage = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly turnstileSiteKey = signal(environment.turnstileSiteKey);
  readonly challengeToken = signal('');
  private readonly challenge = viewChild(TurnstileComponent);

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.prepareConnection().subscribe({
      next: () => { if (!this.googleLoading()) this.connectionMessage.set(null); },
      error: () => {
        this.connectionMessage.set('Chưa kết nối được dịch vụ đăng nhập. Bạn có thể bấm đăng nhập để thử lại.');
      },
    });
  }

  private prepareConnection() {
    const waiting = timer(8_000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.connectionMessage.set('Đang kết nối dịch vụ đăng nhập. Lần truy cập đầu có thể mất một lúc, vui lòng chờ.');
    });
    return this.auth.prepareLogin().pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => waiting.unsubscribe())
    );
  }

  onGoogleLogin(event: MouseEvent): void {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (this.googleLoading() || this.loading()) return;
    this.googleLoading.set(true);
    this.errorMessage.set(null);
    this.connectionMessage.set('Đang kết nối để đăng nhập bằng Google…');
    this.prepareConnection().subscribe({
      next: config => {
        if (!config.google || config.googleLoginUrl !== '/api/v1/auth/oauth2/authorization/google') {
          this.googleLoading.set(false);
          this.connectionMessage.set(null);
          this.errorMessage.set('Đăng nhập Google hiện chưa sẵn sàng. Vui lòng thử lại sau.');
          return;
        }
        this.connectionMessage.set('Đang chuyển đến Google…');
        this.redirectToGoogle(config.googleLoginUrl);
      },
      error: () => {
        this.googleLoading.set(false);
        this.connectionMessage.set(null);
        this.errorMessage.set('Chưa kết nối được dịch vụ đăng nhập. Vui lòng thử lại sau ít phút.');
      },
    });
  }

  redirectToGoogle(url: string): void {
    window.location.assign(url);
  }

  @HostListener('window:pageshow', ['$event'])
  restoreAfterBackNavigation(event: PageTransitionEvent): void {
    if (event.persisted) {
      this.googleLoading.set(false);
      this.connectionMessage.set(null);
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword.update(v => !v);
  }

  onSubmit(): void {
    if (this.loginForm.invalid || this.loading() || this.googleLoading()) {
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
