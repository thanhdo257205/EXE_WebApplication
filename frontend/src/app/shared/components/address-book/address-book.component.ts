import { Component, effect, inject, input, output, signal, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { Address, AddressInput, AddressService } from '../../../core/shop/address.service';

/**
 * Sổ địa chỉ giao hàng: xem/thêm/sửa/xóa/đặt mặc định. Ở chế độ `selectable` (trang thanh toán) cho chọn một địa chỉ;
 * chưa có địa chỉ nào thì mở sẵn form nhập để người dùng nhập xong là mua được ngay.
 */
@Component({
  selector: 'app-address-book',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './address-book.component.html',
  styleUrl: './address-book.component.css',
})
export class AddressBookComponent {
  private readonly service = inject(AddressService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly selectable = input(false);
  /** Địa chỉ đang được chọn (null khi chưa có địa chỉ). */
  readonly selection = output<Address | null>();

  readonly addresses = signal<Address[] | null>(null);
  readonly selectedId = signal<string | null>(null);
  readonly editing = signal<'new' | string | null>(null);
  readonly saving = signal(false);
  readonly loadFailed = signal(false);
  readonly error = signal<string | null>(null);
  readonly confirmDelete = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    label: ['', [Validators.maxLength(60)]],
    recipientName: ['', [Validators.required, Validators.maxLength(120), Validators.pattern(/\S/)]],
    phone: ['', [Validators.required, Validators.pattern(/^[+0-9 ()-]{8,32}$/)]],
    addressLine: ['', [Validators.required, Validators.maxLength(500), Validators.pattern(/\S/)]],
    ward: ['', [Validators.maxLength(120)]],
    district: ['', [Validators.maxLength(120)]],
    province: ['', [Validators.required, Validators.maxLength(120), Validators.pattern(/\S/)]],
    isDefault: [false],
  });

  constructor() {
    effect(() => { if (this.auth.currentUser()) this.load(); });
  }

  load() {
    this.loadFailed.set(false);
    this.service.list().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: list => this.apply(list, this.selectedId()),
      error: () => this.loadFailed.set(true),
    });
  }

  private apply(list: Address[], prefer: string | null) {
    this.addresses.set(list);
    const pick = list.find(a => a.id === prefer) ?? list.find(a => a.isDefault) ?? list[0] ?? null;
    this.selectedId.set(pick?.id ?? null);
    this.selection.emit(this.selectable() ? pick : null);
    if (!list.length) this.openNew();   // chưa có địa chỉ: vào thẳng phần nhập
  }

  select(address: Address) {
    if (!this.selectable()) return;
    this.selectedId.set(address.id); this.selection.emit(address);
  }

  openNew() {
    this.form.reset({ label: '', recipientName: this.auth.currentUser()?.displayName ?? '', phone: '', addressLine: '', ward: '', district: '', province: '', isDefault: false });
    this.error.set(null); this.editing.set('new');
  }

  edit(address: Address) {
    this.form.reset({ label: address.label ?? '', recipientName: address.recipientName, phone: address.phone, addressLine: address.addressLine, ward: address.ward ?? '', district: address.district ?? '', province: address.province, isDefault: address.isDefault });
    this.error.set(null); this.editing.set(address.id);
  }

  cancel() { this.editing.set(null); this.error.set(null); }

  save() {
    if (this.saving()) return;
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    const input: AddressInput = { label: v.label.trim() || null, recipientName: v.recipientName.trim(), phone: v.phone.trim(), addressLine: v.addressLine.trim(), ward: v.ward.trim() || null, district: v.district.trim() || null, province: v.province.trim(), isDefault: v.isDefault };
    const id = this.editing();
    this.saving.set(true); this.error.set(null);
    const call = id && id !== 'new' ? this.service.update(id, input) : this.service.create(input);
    call.pipe(finalize(() => this.saving.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: saved => { this.editing.set(null); this.form.markAsPristine(); this.service.list().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: list => this.apply(list, saved.id), error: () => this.loadFailed.set(true) }); },
      error: err => this.error.set(err?.status === 409 ? 'Bạn đã có tối đa 10 địa chỉ. Hãy xóa bớt trước khi thêm.' : err?.status === 400 ? 'Thông tin chưa hợp lệ. Hãy kiểm tra lại các ô.' : 'Chưa lưu được địa chỉ. Vui lòng thử lại.'),
    });
  }

  makeDefault(address: Address) {
    this.service.setDefault(address.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: list => this.apply(list, this.selectedId()), error: () => this.error.set('Chưa đặt được địa chỉ mặc định.') });
  }

  askRemove(address: Address) { this.confirmDelete.set(this.confirmDelete() === address.id ? null : address.id); }

  remove(address: Address) {
    this.confirmDelete.set(null);
    this.service.remove(address.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: list => this.apply(list, this.selectedId() === address.id ? null : this.selectedId()),
      error: () => this.error.set('Chưa xóa được địa chỉ. Vui lòng thử lại.'),
    });
  }
}
