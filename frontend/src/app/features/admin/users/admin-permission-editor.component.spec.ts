import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { AdminPermissionEditorComponent } from './admin-permission-editor.component';
import { ALL_PERMISSION_KEYS, DEFAULT_DELEGATED_PERMISSIONS, permissionLabel } from '../../../core/admin/permission-catalog';
import { type AdminAccount } from '../../../core/admin/admin-users.service';

describe('AdminPermissionEditorComponent', () => {
  const coAdmin: AdminAccount = {
    id: 'admin', email: 'admin@example.test', displayName: 'Đồng quản trị', role: 'ADMIN',
    adminLevel: 'DELEGATED', enabled: true, version: 1, createdAt: '',
    permissions: ['content:read', 'cards:update'], permissionsVersion: 4, customPermissions: true,
  };
  let saved: Mock<(value: string[]) => void>;
  let cancelled: Mock<() => void>;

  const render = (account = coAdmin, saving = false, readOnly = false) => {
    const fixture = TestBed.createComponent(AdminPermissionEditorComponent);
    fixture.componentRef.setInput('account', account);
    fixture.componentRef.setInput('saving', saving);
    fixture.componentRef.setInput('readOnly', readOnly);
    fixture.componentInstance.saved.subscribe(saved);
    fixture.componentInstance.cancelled.subscribe(cancelled);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  const boxes = (el: HTMLElement) => Array.from(el.querySelectorAll('input[type=checkbox]')) as HTMLInputElement[];
  const toggle = (el: HTMLElement, key: string, value: boolean) => {
    const box = boxes(el)[ALL_PERMISSION_KEYS.indexOf(key)];
    box.checked = value;
    box.dispatchEvent(new Event('change'));
  };

  beforeEach(() => {
    saved = vi.fn();
    cancelled = vi.fn();
    TestBed.configureTestingModule({ imports: [AdminPermissionEditorComponent] });
  });

  it('renders one labelled checkbox per grantable permission and starts clean', () => {
    const { el } = render();
    expect(boxes(el)).toHaveLength(ALL_PERMISSION_KEYS.length);
    expect(el.textContent).toContain(`2/${ALL_PERMISSION_KEYS.length} quyền đã chọn`);
    expect(el.textContent).toContain('bộ tùy chỉnh (phiên bản 4)');
    const checked = boxes(el).filter(box => box.checked).length;
    expect(checked).toBe(2);
    expect((el.querySelector('.actions .primary') as HTMLButtonElement).disabled).toBe(true);
    expect(el.textContent).toContain('Admin chính luôn giữ lại');
    expect(el.textContent).toContain(permissionLabel('permissions:manage'));
    expect(el.textContent).not.toContain('users:manage-roles');
  });

  it('ignores keys the catalog no longer knows about', () => {
    const { el } = render({ ...coAdmin, permissions: ['content:read', 'wiki:archive', 'users:manage-roles'] });
    expect(el.textContent).toContain(`1/${ALL_PERMISSION_KEYS.length} quyền đã chọn`);
    expect(boxes(el).filter(box => box.checked)).toHaveLength(1);
  });

  it('enables saving with a catalog-ordered selection after a checkbox change', () => {
    const { fixture, el } = render();
    toggle(el, 'cards:delete', true);
    fixture.detectChanges();
    const save = el.querySelector('.actions .primary') as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    save.click();
    expect(saved).toHaveBeenCalledWith(['content:read', 'cards:update', 'cards:delete']);
  });

  it('announces the read rights the server adds so the stored set is never a surprise', () => {
    const { fixture, el } = render({ ...coAdmin, permissions: DEFAULT_DELEGATED_PERMISSIONS });
    toggle(el, 'content:read', false);
    toggle(el, 'assistant:read', false);
    fixture.detectChanges();
    const implied = el.querySelector('.implied')!.textContent!;
    expect(implied).toContain(permissionLabel('content:read'));
    expect(implied).toContain(permissionLabel('assistant:read'));
    expect(implied).not.toContain(permissionLabel('cards:update'));
  });

  it('shows supervisor implications when the all-keys right is picked', () => {
    const { fixture, el } = render({ ...coAdmin, permissions: ['assistant:keys:read'] });
    toggle(el, 'assistant:keys:manage', true);
    fixture.detectChanges();
    const implied = el.querySelector('.implied')!.textContent!;
    for (const key of ['assistant:keys:reveal', 'assistant:keys:test', 'assistant:keys:revoke', 'assistant:read']) {
      expect(implied).toContain(permissionLabel(key));
    }
  });

  it('restores the default set and clears it, then reports the change back to the page', () => {
    const { fixture, el } = render();
    const [useDefault, clearAll] = Array.from(el.querySelectorAll('.toolbar button')) as HTMLButtonElement[];
    clearAll.click();
    fixture.detectChanges();
    expect(el.textContent).toContain(`0/${ALL_PERMISSION_KEYS.length} quyền đã chọn`);
    expect(boxes(el).every(box => !box.checked)).toBe(true);
    useDefault.click();
    fixture.detectChanges();
    expect(el.textContent).toContain(`${DEFAULT_DELEGATED_PERMISSIONS.length}/${ALL_PERMISSION_KEYS.length} quyền đã chọn`);
    expect(boxes(el).filter(box => box.checked)).toHaveLength(DEFAULT_DELEGATED_PERMISSIONS.length);
    (el.querySelector('.actions .primary') as HTMLButtonElement).click();
    expect(saved).toHaveBeenCalledWith(DEFAULT_DELEGATED_PERMISSIONS);
  });

  it('announces the account-read right that the manage right drags in', () => {
    const { fixture, el } = render();
    toggle(el, 'permissions:manage', true);
    fixture.detectChanges();
    expect(el.querySelector('.implied')!.textContent).toContain(permissionLabel('users:read'));
  });

  it('shows the same grid read-only, with no way to change or save the set', () => {
    const font = render({ ...coAdmin, permissionsGrantedBy: 'Chị Quản Trị' }, false, true);
    expect(font.el.textContent).toContain('Quyền đang cấp');
    expect(font.el.textContent).toContain('Bộ này do Chị Quản Trị cấp');
    expect(font.el.textContent).toContain('Chỉ admin chính hoặc người có quyền phân quyền mới sửa được');
    expect(font.el.querySelector('.toolbar')).toBeNull();
    expect(font.el.querySelector('.implied')).toBeNull();
    expect(font.el.querySelector('.actions .primary')).toBeNull();
    expect(font.el.querySelector('.actions button')!.textContent).toContain('Đóng');
    expect(boxes(font.el).every(box => box.disabled)).toBe(true);
    expect(boxes(font.el).filter(box => box.checked)).toHaveLength(2);
    const component = font.fixture.componentInstance;
    toggle(font.el, 'cards:delete', true);
    component.toggle('cards:delete', true);
    component.useDefault();
    component.clearAll();
    component.save();
    font.fixture.detectChanges();
    expect(component.selected()).toEqual(component.account().permissions);
    expect(saved).not.toHaveBeenCalled();
  });

  it('explains the manager case when the set has no delegated author', () => {
    const { el } = render({ ...coAdmin, permissionsGrantedBy: null }, false, true);
    expect(el.textContent).not.toContain('Bộ này do');
    expect(el.textContent).toContain('Chỉ admin chính hoặc người có quyền phân quyền mới sửa được.');
  });

  it('closes through the cancel button', () => {
    const { el } = render();
    (el.querySelector('.actions button') as HTMLButtonElement).click();
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it('locks every control while the page is writing', () => {
    const { el } = render(coAdmin, true);
    expect(boxes(el).every(box => box.disabled)).toBe(true);
    expect(Array.from(el.querySelectorAll('button')).every(button => button.disabled)).toBe(true);
    (el.querySelector('.actions .primary') as HTMLButtonElement).click();
    expect(saved).not.toHaveBeenCalled();
    expect(cancelled).not.toHaveBeenCalled();
  });
});
