import { AbstractControl, ValidationErrors } from '@angular/forms';

export function bcryptPasswordValidator(control: AbstractControl): ValidationErrors | null {
  return typeof control.value === 'string' && new TextEncoder().encode(control.value).length > 72
    ? { utf8Length: true } : null;
}

export function matchingPasswordsValidator(control: AbstractControl): ValidationErrors | null {
  return control.get('password')?.value === control.get('confirmPassword')?.value ? null : { mismatch: true };
}
