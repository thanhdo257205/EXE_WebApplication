import { RiseHeadingDirective } from '../../../shared/motion/rise-heading.directive';
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  Validators,
} from '@angular/forms';
import { AuthService } from '../../../core/auth/auth.service';
import { MorphIconComponent } from '../../../shared/components/morph-icon/morph-icon.component';
import { WikiCanvasComponent } from '../../../shared/components/wiki-canvas/wiki-canvas.component';
import { bcryptPasswordValidator, matchingPasswordsValidator } from '../../../core/auth/auth-form.validators';

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [RiseHeadingDirective, RouterLink, FormsModule, ReactiveFormsModule, MorphIconComponent, WikiCanvasComponent],
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.css', './register.form.css'],
})
export class RegisterPage {
  private readonly fb = inject(FormBuilder);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly registerForm = this.fb.group(
    {
      displayName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
      password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(72), bcryptPasswordValidator]],
      confirmPassword: ['', [Validators.required]],
      agreeTerms: [false, [Validators.requiredTrue]],
    },
    { validators: matchingPasswordsValidator }
  );

  readonly showPassword = signal(false);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  togglePasswordVisibility(): void {
    this.showPassword.update(v => !v);
  }

  onSubmit(): void {
    if (this.registerForm.invalid || this.loading()) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    const { displayName, email, password } = this.registerForm.getRawValue();

    this.auth.register(displayName!.trim(), email!, password!).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigateByUrl('/');
      },
      error: err => {
        this.loading.set(false);
        if (err.status === 400 || err.status === 409) {
          this.errorMessage.set('Email này đã được sử dụng hoặc dữ liệu đăng ký không hợp lệ.');
        } else {
          this.errorMessage.set('Không thể hoàn tất đăng ký lúc này. Vui lòng kiểm tra kết nối.');
        }
      },
    });
  }
}
