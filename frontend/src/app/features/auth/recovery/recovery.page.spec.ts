import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { DOCUMENT } from '@angular/common';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { RecoveryPage } from './recovery.page';

describe('RecoveryPage', () => {
  const auth = { forgotPassword: vi.fn(), resetPassword: vi.fn() };
  function create(reset = false, fragment: string | null = null) {
    TestBed.configureTestingModule({
      imports: [RecoveryPage],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth },
        { provide: ActivatedRoute, useValue: { snapshot: { data: { resetPassword: reset }, fragment } } }],
    });
    return TestBed.createComponent(RecoveryPage).componentInstance;
  }
  beforeEach(() => { vi.resetAllMocks(); });

  it('validates email, submits once and shows generic acknowledgement', () => {
    const page = create();
    page.submit();
    expect(auth.forgotPassword).not.toHaveBeenCalled();
    auth.forgotPassword.mockReturnValue(of({ message: 'Generic acknowledgement' }));
    page.emailForm.setValue({ email: 'member@example.test' });
    page.submit(); page.submit();
    expect(auth.forgotPassword).toHaveBeenCalledTimes(1);
    expect(page.completed()).toBe(true);
    expect(page.message()).toContain('Nếu email');
  });

  it('reads token from fragment, removes it from history and checks matching passwords', () => {
    const token = 'a'.repeat(43);
    // Create the environment before observing its browser history.
    const page = create(true, `token=${token}`);
    expect(TestBed.inject(DOCUMENT).defaultView?.location.hash).toBe('');
    page.passwordForm.setValue({ password: 'New-password-123!', confirmPassword: 'different' });
    page.submit(); expect(auth.resetPassword).not.toHaveBeenCalled();
    auth.resetPassword.mockReturnValue(of(undefined));
    page.passwordForm.controls.confirmPassword.setValue('New-password-123!');
    page.submit();
    expect(auth.resetPassword).toHaveBeenCalledWith(token, 'New-password-123!');
    expect(page.completed()).toBe(true);
    expect(page.passwordForm.controls.password.value).toBe('');
  });

  it('rejects missing token and passwords exceeding BCrypt UTF-8 limit', () => {
    const page = create(true, 'token=invalid');
    page.passwordForm.setValue({ password: 'Valid-password', confirmPassword: 'Valid-password' });
    page.submit();
    expect(auth.resetPassword).not.toHaveBeenCalled();
    expect(page.error()).toContain('Liên kết');
  });

  it('rejects more than 72 UTF-8 bytes and displays expired link response', () => {
    const page = create(true, `token=${'b'.repeat(43)}`);
    page.passwordForm.setValue({ password: '界'.repeat(25), confirmPassword: '界'.repeat(25) });
    page.submit(); expect(auth.resetPassword).not.toHaveBeenCalled();
    page.passwordForm.setValue({ password: 'Valid-password', confirmPassword: 'Valid-password' });
    auth.resetPassword.mockReturnValue(throwError(() => ({ status: 400 })));
    page.submit();
    expect(page.error()).toContain('hết hạn');
    expect(page.loading()).toBe(false);
    expect(page.completed()).toBe(false);
  });

  it('shows rate limit and mail service unavailable responses without claiming mail was sent', () => {
    const page = create();
    page.emailForm.setValue({ email: 'member@example.test' });
    auth.forgotPassword.mockReturnValue(throwError(() => ({ status: 429 })));
    page.submit(); expect(page.error()).toContain('một phút');
    auth.forgotPassword.mockReturnValue(throwError(() => ({ status: 503 })));
    page.submit(); expect(page.error()).toContain('tạm ngưng');
    expect(page.completed()).toBe(false);
  });
});
