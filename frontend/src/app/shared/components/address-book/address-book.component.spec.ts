import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { Address, AddressService, fullAddressLine } from '../../../core/shop/address.service';
import { AddressBookComponent } from './address-book.component';

const make = (id: string, over: Partial<Address> = {}): Address => ({ id, label: null, recipientName: 'Khách ' + id, phone: '0900000000', addressLine: id + ' Đường Thử', ward: null, district: null, province: 'Hà Nội', isDefault: false, createdAt: '', ...over });

describe('fullAddressLine', () => {
  it('joins street, ward and district and skips blanks', () => {
    expect(fullAddressLine({ addressLine: '12 A', ward: 'P1', district: 'Q1' })).toBe('12 A, P1, Q1');
    expect(fullAddressLine({ addressLine: '12 A', ward: null, district: '  ' })).toBe('12 A');
  });
});

describe('AddressBookComponent', () => {
  let service: Record<'list' | 'create' | 'update' | 'setDefault' | 'remove', ReturnType<typeof vi.fn>>;
  beforeEach(() => {
    service = { list: vi.fn(() => of([make('a', { isDefault: true }), make('b')])), create: vi.fn(), update: vi.fn(), setDefault: vi.fn(), remove: vi.fn() };
    TestBed.configureTestingModule({ providers: [{ provide: AddressService, useValue: service }, { provide: AuthService, useValue: { currentUser: signal({ id: 'u', email: 'a@b.c', displayName: 'Hoàng Nam', role: 'CUSTOMER' }) } }] });
  });
  const create = async (selectable = true) => {
    const fixture = TestBed.createComponent(AddressBookComponent);
    fixture.componentRef.setInput('selectable', selectable);
    const picked: (Address | null)[] = [];
    fixture.componentInstance.selection.subscribe(value => picked.push(value));
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    return { fixture, picked, c: fixture.componentInstance, root: fixture.nativeElement as HTMLElement };
  };

  it('selects the default address first and lets the user pick another', async () => {
    const { fixture, picked, c, root } = await create();
    expect(picked.at(-1)?.id).toBe('a'); expect(root.querySelectorAll('.card')).toHaveLength(2);
    expect(root.textContent).toContain('Mặc định');
    c.select(c.addresses()![1]); fixture.detectChanges();
    expect(picked.at(-1)?.id).toBe('b'); expect(root.querySelectorAll('.card.on')).toHaveLength(1);
  });

  it('opens the entry form when there is no address and prefills the recipient name', async () => {
    service.list.mockReturnValue(of([]));
    const { picked, c, root } = await create();
    expect(picked.at(-1)).toBeNull(); expect(c.editing()).toBe('new');
    expect(root.textContent).toContain('Bạn chưa có địa chỉ giao hàng');
    expect(c.form.controls.recipientName.value).toBe('Hoàng Nam');
  });

  it('validates before saving, then creates and selects the new address', async () => {
    service.list.mockReturnValue(of([]));
    const { c, picked } = await create();
    c.save(); expect(service.create).not.toHaveBeenCalled(); expect(c.form.invalid).toBe(true);
    c.form.patchValue({ phone: '0912345678', addressLine: '9 Đường Mới', province: 'Đà Nẵng', ward: ' ', label: '' });
    const created = make('n', { isDefault: true });
    service.create.mockReturnValue(of(created)); service.list.mockReturnValue(of([created]));
    c.save();
    expect(service.create).toHaveBeenCalledWith({ label: null, recipientName: 'Hoàng Nam', phone: '0912345678', addressLine: '9 Đường Mới', ward: null, district: null, province: 'Đà Nẵng', isDefault: false });
    await vi.waitFor(() => expect(picked.at(-1)?.id).toBe('n'));
    expect(c.editing()).toBeNull();
  });

  it('edits, sets default and deletes with confirmation; shows readable errors', async () => {
    const { c } = await create();
    c.edit(c.addresses()![1]); expect(c.editing()).toBe('b'); expect(c.form.controls.addressLine.value).toBe('b Đường Thử');
    service.update.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    c.save(); expect(c.error()).toContain('tối đa 10');
    service.update.mockReturnValue(of(make('b'))); c.save(); expect(service.update).toHaveBeenLastCalledWith('b', expect.objectContaining({ province: 'Hà Nội' }));

    service.setDefault.mockReturnValue(of([make('a'), make('b', { isDefault: true })]));
    c.makeDefault(c.addresses()![1]); expect(service.setDefault).toHaveBeenCalledWith('b');

    c.askRemove(c.addresses()![0]); expect(c.confirmDelete()).toBe(c.addresses()![0].id);
    service.remove.mockReturnValue(of([make('b', { isDefault: true })]));
    c.remove(c.addresses()![0]); expect(service.remove).toHaveBeenCalledTimes(1); expect(c.addresses()).toHaveLength(1);
  });

  it('shows a retry when loading fails and does not select in manage mode', async () => {
    service.list.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));
    const { fixture, root, c } = await create(false);
    expect(c.loadFailed()).toBe(true); expect(root.textContent).toContain('Thử lại');
    service.list.mockReturnValue(of([make('a', { isDefault: true })])); c.load(); fixture.detectChanges();
    expect(root.querySelector('input[type=radio]')).toBeNull();
  });
});
