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
});
