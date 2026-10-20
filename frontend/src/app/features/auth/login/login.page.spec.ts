import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { LoginPage } from './login.page';
import { AuthService } from '../../../core/auth/auth.service';
import { throwError } from 'rxjs';

describe('LoginPage', () => {
  let component: LoginPage;
  let fixture: ComponentFixture<LoginPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create login component', () => {
    expect(component).toBeTruthy();
  });

  it('should validate email and password fields', () => {
    expect(component.loginForm.valid).toBe(false);
    component.loginForm.controls.email.setValue('test@example.com');
    component.loginForm.controls.password.setValue('password123');
    expect(component.loginForm.valid).toBe(true);
  });

  it('should toggle password visibility', () => {
    expect(component.showPassword()).toBe(false);
    component.togglePasswordVisibility();
    expect(component.showPassword()).toBe(true);
  });

  it('requires a challenge in production, sends its token and discards it after a failed login', () => {
    const auth = TestBed.inject(AuthService);
    const login = vi.spyOn(auth, 'login').mockReturnValue(throwError(() => ({ status: 401 })));
    component.turnstileSiteKey.set('public-test-key');
    component.loginForm.setValue({ email: 'member@example.test', password: 'password123' });
    component.onSubmit();
    expect(login).not.toHaveBeenCalled();
    expect(component.errorMessage()).toContain('xác minh');
    component.challengeToken.set('single-use-challenge');
    component.onSubmit();
    expect(login).toHaveBeenCalledWith('member@example.test', 'password123', 'single-use-challenge');
    expect(component.challengeToken()).toBe('');
    expect(component.errorMessage()).toContain('không chính xác');
  });

  it('rejects more than 72 UTF-8 bytes before making a request', () => {
    component.loginForm.setValue({ email: 'member@example.test', password: '界'.repeat(25) });
    expect(component.loginForm.controls.password.hasError('utf8Length')).toBe(true);
  });
});
