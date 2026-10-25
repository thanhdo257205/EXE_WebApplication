import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
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

  afterEach(() => {
    fixture.destroy();
    TestBed.inject(HttpTestingController).verify({ ignoreCancelled: true });
  });

  it('warms the service on entry and waits for readiness before a single Google navigation', () => {
    const redirect = vi.spyOn(component, 'redirectToGoogle').mockImplementation(() => {});
    const event = new MouseEvent('click', { button: 0, cancelable: true });
    component.onGoogleLogin(event);
    component.onGoogleLogin(event);
    expect(event.defaultPrevented).toBe(true);
    expect(component.googleLoading()).toBe(true);
    expect(redirect).not.toHaveBeenCalled();
    TestBed.inject(HttpTestingController).expectOne('/api/v1/auth/config').flush({
      password: true, google: true, googleLoginUrl: '/api/v1/auth/oauth2/authorization/google',
    });
    expect(redirect).toHaveBeenCalledExactlyOnceWith('/api/v1/auth/oauth2/authorization/google');
    expect(component.connectionMessage()).toContain('chuyển đến Google');
  });

  it('keeps the user on the page when preparation is denied and allows another attempt', () => {
    const redirect = vi.spyOn(component, 'redirectToGoogle').mockImplementation(() => {});
    component.onGoogleLogin(new MouseEvent('click'));
    TestBed.inject(HttpTestingController).expectOne('/api/v1/auth/config').flush({}, { status: 403, statusText: 'Forbidden' });
    expect(component.googleLoading()).toBe(false);
    expect(component.errorMessage()).toContain('Chưa kết nối');
    expect(redirect).not.toHaveBeenCalled();
    component.onGoogleLogin(new MouseEvent('click'));
    TestBed.inject(HttpTestingController).expectOne('/api/v1/auth/config').flush({ password: true, google: true, googleLoginUrl: '/api/v1/auth/oauth2/authorization/google' });
    expect(redirect).toHaveBeenCalledOnce();
  });

  it('rejects disabled Google configuration or an unexpected redirect URL', () => {
    const redirect = vi.spyOn(component, 'redirectToGoogle').mockImplementation(() => {});
    component.onGoogleLogin(new MouseEvent('click'));
    TestBed.inject(HttpTestingController).expectOne('/api/v1/auth/config').flush({ password: true, google: true, googleLoginUrl: 'https://unexpected.example' });
    expect(redirect).not.toHaveBeenCalled();
    expect(component.googleLoading()).toBe(false);
    expect(component.errorMessage()).toContain('chưa sẵn sàng');
  });

  it('preserves modified link clicks instead of forcing same-tab navigation', () => {
    const event = new MouseEvent('click', { ctrlKey: true, cancelable: true });
    component.onGoogleLogin(event);
    expect(event.defaultPrevented).toBe(false);
    expect(component.googleLoading()).toBe(false);
  });

  it('unlocks Google login when the browser restores the page after going back', () => {
    component.googleLoading.set(true);
    component.connectionMessage.set('Đang chuyển đến Google…');
    component.restoreAfterBackNavigation({ persisted: true } as PageTransitionEvent);
    expect(component.googleLoading()).toBe(false);
    expect(component.connectionMessage()).toBeNull();
  });

  it('should create login component', () => {
    expect(component).toBeTruthy();
  });

  it('shows a login/register switch with login selected', () => {
    const links = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>('nav.auth-switch a');
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('href')).toBe('/dang-nhap');
    expect(links[0].getAttribute('aria-current')).toBe('page');
    expect(links[1].getAttribute('href')).toBe('/dang-ky');
    expect(links[1].getAttribute('aria-current')).toBeNull();
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
