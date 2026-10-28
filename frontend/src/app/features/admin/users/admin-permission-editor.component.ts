import { Component, input, OnInit, output, signal } from '@angular/core';
import { type AdminAccount } from '../../../core/admin/admin-users.service';
import {
  ALL_PERMISSION_KEYS, DEFAULT_DELEGATED_PERMISSIONS, OWNER_ONLY_PERMISSIONS, PERMISSION_GROUPS, permissionLabel,
} from '../../../core/admin/permission-catalog';

/**
 * Presentational grid of grantable permissions. The parent page owns the PUT call,
 * so this component never deals with CSRF, error mapping or list reloading.
 * The parent recreates the element per target account, so the draft is seeded once in ngOnInit.
 */
@Component({
  selector: 'app-admin-permission-editor',
  template: `
    <section class="editor" role="group" [attr.aria-label]="'Phân quyền cho ' + account().email">
      <div class="heading">
        <h2>Phân quyền chi tiết</h2>
        <p class="muted">
          {{ account().displayName }} · {{ account().email }} ·
          {{ account().customPermissions ? 'bộ tùy chỉnh' : 'bộ mặc định' }} (phiên bản {{ account().permissionsVersion ?? 0 }})
        </p>
      </div>

      <div class="toolbar">
        <span class="counter">{{ selected().length }}/{{ allKeys.length }} quyền đã chọn</span>
        <button type="button" (click)="useDefault()" [disabled]="saving()">Dùng bộ mặc định</button>
        <button type="button" (click)="clearAll()" [disabled]="saving()">Bỏ hết</button>
      </div>

      @for (group of groups; track group.id) {
        <fieldset class="group">
          <legend>{{ group.label }} <span class="muted">({{ checkedInGroup(group) }}/{{ group.items.length }})</span></legend>
          @if (group.note) { <p class="note">{{ group.note }}</p> }
          <ul>
            @for (item of group.items; track item.key) {
              <li>
                <label>
                  <input #box type="checkbox" [checked]="isChecked(item.key)" [disabled]="saving()"
                    (change)="toggle(item.key, box.checked)" />
                  <span>{{ item.label }}</span>
                </label>
                @if (item.hint) { <small>{{ item.hint }}</small> }
              </li>
            }
          </ul>
        </fieldset>
      }

      <p class="owner-only">
        <span>Admin chính luôn giữ lại:</span>
        @for (item of ownerOnly; track item.key) { <span class="lock">{{ item.label }}</span> }
      </p>

      @if (implied().length) {
        <p class="implied" role="status">Máy chủ sẽ tự thêm khi lưu: {{ impliedLabels() }}</p>
      }

      <div class="actions">
        <button type="button" (click)="cancelled.emit()" [disabled]="saving()">Đóng</button>
        <button type="button" class="primary" (click)="save()" [disabled]="saving() || !dirty()">
          {{ saving() ? 'Đang lưu…' : 'Lưu phân quyền' }}
        </button>
      </div>
    </section>
  `,
  styles: `
    :host { display:block; color:#f3f1ea; }
    .editor { display:grid; gap:1rem; padding:1.2rem; background:#121415; border:1px solid #30352b; border-left:3px solid #dafa76; border-radius:.75rem; }
    h2 { font-size:1.05rem; margin:0; }
    .muted, .note, small { color:#a6aaa3; }
    .heading p, .note, small, .owner-only, .implied { font-size:.78rem; line-height:1.5; }
    .heading { display:grid; gap:.3rem; overflow-wrap:anywhere; }
    .toolbar { display:flex; align-items:center; gap:.75rem; flex-wrap:wrap; }
    .counter { font-size:.8rem; font-weight:600; color:#dafa76; margin-right:auto; }
    button { min-height:44px; padding:.6rem 1rem; background:#242a20; color:#dafa76; border:1px solid #465337; border-radius:.4rem; cursor:pointer; font-size:.8rem; font-weight:600; }
    button.primary { background:#dafa76; color:#18200e; }
    button:disabled { opacity:.5; cursor:not-allowed; }
    button:focus-visible, input:focus-visible { outline:2px solid #dafa76; outline-offset:3px; }
    .group { border:1px solid #292d25; border-radius:.6rem; padding:.9rem 1rem; display:grid; gap:.6rem; min-width:0; }
    legend { font-size:.85rem; font-weight:700; padding:0 .4rem; }
    ul { list-style:none; margin:0; padding:0; display:grid; gap:.45rem; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); }
    li { display:grid; gap:.15rem; min-width:0; }
    li label { display:flex; gap:.5rem; align-items:flex-start; font-size:.82rem; cursor:pointer; }
    li input { margin-top:.15rem; flex:0 0 auto; width:auto; }
    .owner-only { margin:0; display:flex; gap:.4rem; flex-wrap:wrap; align-items:center; }
    .lock { border:1px dashed #48533b; border-radius:2rem; padding:.2rem .55rem; color:#a6aaa3; white-space:nowrap; }
    .implied { margin:0; color:#fde68a; }
    .actions { display:flex; gap:.75rem; flex-wrap:wrap; }
    @media (max-width:600px) { .editor { padding:.85rem; } .actions button { width:100%; } ul { grid-template-columns:1fr; } }
  `,
})
export class AdminPermissionEditorComponent implements OnInit {
  readonly account = input.required<AdminAccount>();
  readonly saving = input(false);
  readonly saved = output<string[]>();
  readonly cancelled = output<void>();

  readonly groups = PERMISSION_GROUPS;
  readonly ownerOnly = OWNER_ONLY_PERMISSIONS;
  readonly allKeys = ALL_PERMISSION_KEYS;
  readonly checked = signal<Record<string, boolean>>({});

  private baseline: string[] = [];

  /** Input signals are only readable after the constructor, so seeding happens in ngOnInit. */
  ngOnInit(): void {
    this.baseline = this.knownKeys(this.account().permissions ?? []);
    this.setDraft(this.baseline);
  }

  /** Keys the server adds automatically, shown so the owner is never surprised by the stored set. */
  implied(): string[] {
    const picked = this.selected();
    const granted = new Set<string>(picked);
    for (const key of picked) {
      if (/^(releases|cards|card-sets|characters|wiki|media):/.test(key)) granted.add('content:read');
      if (key.startsWith('assistant:')) granted.add('assistant:read');
      if (/^assistant:keys:(create|reveal|test|revoke|manage)$/.test(key)) granted.add('assistant:keys:read');
      if (key === 'assistant:keys:manage') {
        granted.add('assistant:keys:reveal');
        granted.add('assistant:keys:test');
        granted.add('assistant:keys:revoke');
      }
    }
    return [...granted].filter(key => !picked.includes(key));
  }

  impliedLabels(): string { return this.implied().map(permissionLabel).join(', '); }

  isChecked(key: string): boolean { return Boolean(this.checked()[key]); }

  selected(): string[] { return ALL_PERMISSION_KEYS.filter(key => this.isChecked(key)); }

  checkedInGroup(group: { items: { key: string }[] }): number {
    return group.items.filter(item => this.isChecked(item.key)).length;
  }

  dirty(): boolean {
    const current = this.selected();
    return current.length !== this.baseline.length || current.some(key => !this.baseline.includes(key));
  }

  toggle(key: string, value: boolean): void {
    this.checked.update(state => ({ ...state, [key]: value }));
  }

  useDefault(): void { this.setDraft(DEFAULT_DELEGATED_PERMISSIONS); }

  clearAll(): void { this.setDraft([]); }

  save(): void { this.saved.emit(this.selected()); }

  private knownKeys(keys: readonly string[]): string[] {
    return ALL_PERMISSION_KEYS.filter(key => keys.includes(key));
  }

  private setDraft(keys: readonly string[]): void {
    const map: Record<string, boolean> = {};
    for (const key of this.knownKeys(keys)) map[key] = true;
    this.checked.set(map);
  }
}
