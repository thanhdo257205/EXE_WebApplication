import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminUsersService, type AdminAccount, type AdminInvite } from '../../../core/admin/admin-users.service';
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
  private inviteLoadId = 0;
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
  inviteEmail = '';
  readonly invites = signal<AdminInvite[]>([]);
  readonly invitesLoading = signal(false);
  readonly inviteSaving = signal(false);
  readonly pendingRevoke = signal<AdminInvite | null>(null);

  constructor() { this.load(); this.loadInvites(); }

  search(): void {
    if (this.saving() || this.inviteSaving()) return;
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
        this.notice.set('');
        if (error.status === 401) {
          this.canManageRoles.set(false);
          this.accounts.set([]);
          this.total.set(0);
          this.totalPages.set(0);
        }
        this.handleError(error);
      },
    });
  }

  propose(account: AdminAccount): void {
    if (!this.canManageRoles() || this.loading() || this.saving() || this.inviteSaving() || this.needsReload() || account.adminLevel === 'OWNER') return;
    if (!account.enabled && account.role !== 'ADMIN') return;
    this.error.set('');
    this.notice.set('');
    this.pendingRevoke.set(null);
    this.pending.set({ account, role: account.role === 'ADMIN' ? 'CUSTOMER' : 'ADMIN' });
  }

  cancel(): void { if (!this.saving()) this.pending.set(null); }

  confirm(): void {
    const change = this.pending();
    if (!change || !this.canManageRoles() || this.saving() || this.inviteSaving() || this.loading() || this.needsReload() || change.account.adminLevel === 'OWNER') return;
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

  reload(): void { this.load(); this.loadInvites(); }

  loadInvites(): void {
    const request = ++this.inviteLoadId;
    this.invitesLoading.set(true);
    this.api.listInvites().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => {
        if (request !== this.inviteLoadId) return;
        this.invites.set(result.items);
        this.canManageRoles.set(result.canManageRoles);
        this.invitesLoading.set(false);
      },
      error: error => {
        if (request !== this.inviteLoadId) return;
        this.invitesLoading.set(false);
        this.notice.set('');
        if (error.status === 401) {
          this.canManageRoles.set(false);
          this.invites.set([]);
        }
        this.handleError(error);
      },
    });
  }

  sendInvite(): void {
    const email = this.inviteEmail.trim();
    if (!this.canManageRoles() || !email || this.inviteSaving() || this.saving() || this.loading()) return;
    this.inviteSaving.set(true);
    this.error.set('');
    this.notice.set('');
    this.api.invite(email).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => {
        this.inviteSaving.set(false);
        this.inviteEmail = '';
        this.notice.set(result.status === 'INVITED'
          ? `Đã thêm lời mời cho ${result.invite.email}. Quyền đồng quản trị sẽ được áp dụng khi người này đăng ký bằng đúng email.`
          : `Đã cấp quyền đồng quản trị cho ${result.account.email}. Tài khoản cần đăng nhập lại.`);
        this.load();
        this.loadInvites();
      },
      error: error => {
        this.inviteSaving.set(false);
        this.handleInviteError(error);
      },
    });
  }

  proposeRevoke(invite: AdminInvite): void {
    if (!this.canManageRoles() || this.inviteSaving() || this.invitesLoading()) return;
    this.error.set('');
    this.notice.set('');
    this.pending.set(null);
    this.pendingRevoke.set(invite);
  }

  cancelRevoke(): void { if (!this.inviteSaving()) this.pendingRevoke.set(null); }

  confirmRevoke(): void {
    const invite = this.pendingRevoke();
    if (!invite || !this.canManageRoles() || this.inviteSaving()) return;
    this.inviteSaving.set(true);
    this.error.set('');
    this.api.revokeInvite(invite.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.inviteSaving.set(false);
        this.pendingRevoke.set(null);
        this.notice.set(`Đã thu hồi lời mời cho ${invite.email}.`);
        this.loadInvites();
      },
      error: error => {
        this.inviteSaving.set(false);
        this.pendingRevoke.set(null);
        this.handleInviteError(error);
      },
    });
  }

  createdOn(invite: AdminInvite): string { return invite.createdAt.slice(0, 10); }

  roleLabel(account: AdminAccount): string {
    if (account.adminLevel === 'OWNER') return 'Admin chính';
    if (account.role === 'ADMIN') return 'Đồng quản trị';
    if (account.role === 'EDITOR') return 'Biên tập viên';
    return 'Thành viên';
  }

  private redirectToLogin(): void {
    this.auth.currentUser.set(null);
    void this.router.navigate(['/dang-nhap'], { queryParams: { returnUrl: '/admin/users' } });
  }

  private handleError(error: { status?: number; error?: { code?: string } }): void {
    if (error.status === 401) { this.redirectToLogin(); return; }
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

  private handleInviteError(error: { status?: number; error?: { code?: string } }): void {
    if (error.status === 401) { this.redirectToLogin(); return; }
    const code = error.error?.code;
    if (error.status === 403) {
      this.canManageRoles.set(false);
      this.error.set('Chỉ admin chính được thêm hoặc thu hồi lời mời đồng quản trị.');
    } else if (code === 'ALREADY_OWNER') {
      this.error.set('Email này thuộc admin chính và luôn được bảo vệ.');
    } else if (code === 'ALREADY_ADMIN') {
      this.error.set('Email này đã có quyền đồng quản trị.');
    } else if (code === 'ACCOUNT_DISABLED') {
      this.error.set('Tài khoản dùng email này đã bị khóa, không thể cấp quyền quản trị.');
    } else if (code === 'INVITE_EXISTS') {
      this.error.set('Email này đã có lời mời đang chờ đăng ký.');
    } else if (code === 'INVITE_NOT_FOUND') {
      this.error.set('Lời mời không còn tồn tại. Danh sách đã được làm mới.');
      this.loadInvites();
    } else if (error.status === 400) {
      this.error.set('Email không hợp lệ.');
    } else {
      this.error.set('Không thể hoàn tất yêu cầu. Hãy kiểm tra kết nối và thử lại.');
    }
  }
}
