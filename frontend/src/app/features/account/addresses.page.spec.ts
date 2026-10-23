import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { AddressService } from '../../core/shop/address.service';
import { AddressesPage } from './addresses.page';

describe('AddressesPage', () => {
  const setup = (user: unknown, checking = false) => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AddressService, useValue: { list: vi.fn(() => of([])) } }, { provide: AuthService, useValue: { currentUser: signal(user), checkingSession: signal(checking) } }] });
    const fixture = TestBed.createComponent(AddressesPage); fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };
  it('asks visitors to sign in and returns here afterwards', () => {
    const root = setup(null);
    expect(root.textContent).toContain('Bạn cần đăng nhập'); expect(root.querySelector('app-address-book')).toBeNull();
    expect(root.querySelector('a[href*="dang-nhap"]')?.getAttribute('href')).toContain('returnUrl=%2Fdia-chi');
  });
  it('shows the address book for signed-in users', () => {
    expect(setup({ id: 'u', email: 'a@b.c', displayName: 'A', role: 'CUSTOMER' }).querySelector('app-address-book')).toBeTruthy();
  });
});
