import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminUsersService, type AdminAccount } from '../../../core/admin/admin-users.service';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-admin-users',
  imports: [FormsModule, RouterLink],
  templateUrl: './admin-users.page.html',
  styleUrl: './admin-users.page.css',
})
export class AdminUsersPage {
  private readonly api = inject(AdminUsersService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private loadId = 0;
  private appliedQuery = '';
  query = '';
  readonly accounts = signal<AdminAccount[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly canManageRoles = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly page = signal(0);
  readonly totalPages = signal(0);
  readonly total = signal(0);
  readonly pending = signal<{ account: AdminAccount; role: 'ADMIN' | 'CUSTOMER' } | null>(null);
  readonly needsReload = signal(false);

  constructor() { this.load(); }

  search(): void {
    if (this.saving()) return;
    this.appliedQuery = this.query.trim();
    this.load(0);
  }

  load(page = this.page()): void {
    if (this.saving()) return;
    const request = ++this.loadId;
    this.pending.set(null);
    this.loading.set(true);
    this.error.set('');
    this.api.list(page, this.appliedQuery).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => {
        if (request !== this.loadId) return;
        this.accounts.set(result.items);
        this.canManageRoles.set(result.canManageRoles);
        this.page.set(result.page);
        this.totalPages.set(result.totalPages);
        this.total.set(result.totalElements);
        this.loading.set(false);
        this.needsReload.set(false);
      },
      error: error => {
        if (request !== this.loadId) return;
        this.loading.set(false);
        this.canManageRoles.set(false);
        this.accounts.set([]);
        this.handleError(error);
      },
    });
  }

  propose(account: AdminAccount): void {
    if (!this.canManageRoles() || this.loading() || this.saving() || this.needsReload() || account.adminLevel === 'OWNER') return;
    if (!account.enabled && account.role !== 'ADMIN') return;
    this.error.set('');
    this.notice.set('');
    this.pending.set({ account, role: account.role === 'ADMIN' ? 'CUSTOMER' : 'ADMIN' });
  }

  cancel(): void { if (!this.saving()) this.pending.set(null); }

  confirm(): void {
    const change = this.pending();
    if (!change || !this.canManageRoles() || this.saving() || this.loading() || this.needsReload() || change.account.adminLevel === 'OWNER') return;
    this.saving.set(true);
    this.error.set('');
    this.api.changeRole(change.account, change.role).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => {
        this.saving.set(false);
        this.pending.set(null);
        this.notice.set(result.changed
          ? `Đã ${change.role === 'ADMIN' ? 'cấp' : 'thu hồi'} quyền đồng quản trị cho ${change.account.email}. Tài khoản cần đăng nhập lại.`
          : 'Tài khoản đã có vai trò này; không có thay đổi.');
        this.load();
      },
      error: error => {
        this.saving.set(false);
        this.pending.set(null);
        this.needsReload.set(true);
        this.handleError(error);
      },
    });
  }

  roleLabel(account: AdminAccount): string {
    if (account.adminLevel === 'OWNER') return 'Admin chính';
    if (account.role === 'ADMIN') return 'Đồng quản trị';
    if (account.role === 'EDITOR') return 'Biên tập viên';
    return 'Thành viên';
  }

  private handleError(error: { status?: number; error?: { code?: string } }): void {
    if (error.status === 401) {
      this.auth.currentUser.set(null);
      void this.router.navigate(['/dang-nhap'], { queryParams: { returnUrl: '/admin/users' } });
      return;
    }
    const code = error.error?.code;
    if (error.status === 403) {
      this.canManageRoles.set(false);
      this.error.set(code === 'OWNER_PROTECTED' ? 'Không thể thay đổi quyền của admin chính.' : 'Chỉ admin chính được cấp hoặc thu hồi quyền đồng quản trị.');
    } else if (code === 'ACCOUNT_DISABLED') {
      this.error.set('Tài khoản đã bị khóa, không thể cấp quyền quản trị.');
    } else if (error.status === 409) {
      this.error.set('Quyền tài khoản đã thay đổi. Hãy tải lại danh sách và kiểm tra trước khi thao tác tiếp.');
    } else {
      this.error.set('Không thể hoàn tất yêu cầu. Hãy tải lại danh sách để kiểm tra trạng thái trước khi thử tiếp.');
    }
  }
}
