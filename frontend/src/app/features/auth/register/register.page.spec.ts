import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { RegisterPage } from './register.page';

describe('RegisterPage', () => {
  let component: RegisterPage;
  let fixture: ComponentFixture<RegisterPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegisterPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(RegisterPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create register component', () => {
    expect(component).toBeTruthy();
  });

  it('should validate form and detect password mismatch', () => {
    expect(component.registerForm.valid).toBe(false);
    component.registerForm.controls.displayName.setValue('Thủ quỹ');
    component.registerForm.controls.email.setValue('resident@example.com');
    component.registerForm.controls.password.setValue('password123');
    component.registerForm.controls.confirmPassword.setValue('different123');
    component.registerForm.controls.agreeTerms.setValue(true);

    expect(component.registerForm.hasError('mismatch')).toBe(true);

    component.registerForm.controls.confirmPassword.setValue('password123');
    expect(component.registerForm.valid).toBe(true);
  });

  it('clears mismatch when the original password changes to match confirmation', () => {
    component.registerForm.setValue({ displayName: 'Resident', email: 'resident@example.test',
      password: 'password123', confirmPassword: 'different123', agreeTerms: true });
    component.registerForm.controls.confirmPassword.markAsTouched();
    component.registerForm.controls.password.setValue('different123');
    expect(component.registerForm.valid).toBe(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Mật khẩu xác nhận không trùng khớp.');
  });

  it('retains the required error for empty confirmation and enforces UTF-8 password length', () => {
    component.registerForm.controls.password.setValue('界'.repeat(25));
    expect(component.registerForm.controls.password.hasError('utf8Length')).toBe(true);
    expect(component.registerForm.controls.confirmPassword.hasError('required')).toBe(true);
    component.registerForm.controls.password.setValue('valid-password');
    expect(component.registerForm.controls.password.valid).toBe(true);
  });
});
