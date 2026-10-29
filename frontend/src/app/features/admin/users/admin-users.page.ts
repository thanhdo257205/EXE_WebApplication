import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminUsersService, type AdminAccount, type AdminInvite } from '../../../core/admin/admin-users.service';
import { AuthService } from '../../../core/auth/auth.service';
import { AdminPermissionEditorComponent } from './admin-permission-editor.component';

@Component({
  selector: 'app-admin-users',
  imports: [FormsModule, RouterLink, AdminPermissionEditorComponent],
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
  readonly canManagePermissions = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly page = signal(0);
  readonly totalPages = signal(0);
  readonly total = signal(0);
  readonly pending = signal<{ account: AdminAccount; role: 'ADMIN' | 'CUSTOMER' } | null>(null);
  /** Track by id so switching target rebuilds the editor and re-seeds its draft. */
  readonly editing = signal<AdminAccount[]>([]);
  readonly needsReload = signal(false);
  inviteEmail = '';
  readonly invites = signal<AdminInvite[]>([]);
  readonly invitesLoading = signal(false);
  readonly inviteSaving = signal(false);
  readonly pendingRevoke = signal<AdminInvite | null>(null);
  filterLevel: 'ALL' | 'DELEGATED' | 'CUSTOMER' = 'ALL';
  readonly searchQuery = signal('');
  readonly filteredAccounts = computed(() => {
    const list = this.accounts();
    const search = this.searchQuery().toLowerCase().trim();
    return list.filter(a => {
      if (this.filterLevel === 'ALL') return true;
      if (this.filterLevel === 'DELEGATED') return a.adminLevel !== 'OWNER';
      if (this.filterLevel === 'CUSTOMER') return a.role !== 'ADMIN';
      return true;
    }).filter(a => !search || a.email.toLowerCase().includes(search) || (a.displayName?.toLowerCase() ?? '').includes(search));
  });

  constructor() { this.load(); }

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
        this.canManagePermissions.set(result.canManagePermissions);
        this.page.set(result.page);
        this.totalPages.set(result.totalPages);
        this.total.set(result.totalElements);
        this.loading.set(false);
        this.needsReload.set(false);
        this.closeEditorIfGone(result.items);
        if (result.canManageRoles) this.loadInvites();
        else { this.invites.set([]); this.pendingRevoke.set(null); }
      },
      error: error => {
        if (request !== this.loadId) return;
        this.loading.set(false);
        this.notice.set('');
        if (error.status === 401) {
          this.canManageRoles.set(false);
          this.canManagePermissions.set(false);
          this.editing.set([]);
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
    this.editing.set([]);
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

  reload(): void { this.load(); }

  openPermissions(account: AdminAccount): void {
    // Every reader of the list may open the grid; the server decides who may write, and the grid mirrors that.
    if (account.role !== 'ADMIN' || account.adminLevel === 'OWNER' || account.permissions === undefined
      || this.loading() || this.saving() || this.inviteSaving() || this.needsReload()) return;
    this.error.set('');
    this.notice.set('');
    this.pending.set(null);
    this.pendingRevoke.set(null);
    this.editing.set([account]);
  }

  /** The server answers per account; the page-level flag keeps a stale row from offering a write after a denial. */
  canEdit(account: AdminAccount): boolean { return this.canManagePermissions() && account.permissionsEditable === true; }

  permissionActionLabel(account: AdminAccount): string {
    const open = this.editing()[0]?.id === account.id;
    if (this.canEdit(account)) return open ? 'Đang phân quyền' : 'Phân quyền chi tiết';
    return open ? 'Đang xem quyền' : 'Xem quyền';
  }

  closePermissions(): void { if (!this.saving()) this.editing.set([]); }

  savePermissions(permissions: string[]): void {
    const account = this.editing()[0];
    if (!account || !this.canEdit(account) || this.saving() || this.loading() || this.needsReload()) return;
    this.saving.set(true);
    this.error.set('');
    this.notice.set('');
    this.api.updatePermissions(account, permissions).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => {
        this.saving.set(false);
        // The stored set is normalized server-side, so show exactly what the account now holds.
        this.accounts.update(items => items.map(item => item.id === result.account.id ? result.account : item));
        this.editing.set([result.account]);
        this.notice.set(result.changed
          ? `Đã cập nhật ${result.account.permissions?.length ?? 0} quyền cho ${result.account.email}. Thay đổi có hiệu lực từ yêu cầu kế tiếp; họ không cần đăng xuất.`
          : 'Bộ quyền trùng với giá trị đang lưu nên không có thay đổi nào.');
      },
      error: error => {
        this.saving.set(false);
        // Close the editor so a retry always starts from freshly loaded versions.
        this.editing.set([]);
        if (error.status === 409) this.needsReload.set(true);
        this.handleError(error);
      },
    });
  }

  permissionSummary(account: AdminAccount): string {
    if (account.adminLevel === 'OWNER') return 'Toàn quyền — được bảo vệ';
    if (account.role !== 'ADMIN' || account.permissions === undefined) return '—';
    const count = `${account.permissions.length} quyền`;
    if (!account.customPermissions) return `${count} (bộ mặc định)`;
    // A custom set always has an author, so naming it answers "ai đã cấp bộ quyền này".
    return `${count} (bộ tùy chỉnh) · do ${account.permissionsGrantedBy ?? 'admin chính'} cấp`;
  }

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
          ? `Đã thêm lời mời cho ${result.invite.email}. Quyền đồng quản trị sẽ tự áp dụng khi người này đăng ký bằng Google với email đã xác minh; đăng ký bằng mật khẩu cần bạn cấp quyền thủ công.`
          : `Đã cấp quyền đồng quản trị cho ${result.account.email}. Tài khoản cần đăng nhập lại.`);
        this.load();
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

  private closeEditorIfGone(items: AdminAccount[]): void {
    const open = this.editing()[0];
    if (!open) return;
    const fresh = items.find(account => account.id === open.id);
    this.editing.set(fresh ? [fresh] : []);
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
      this.canManagePermissions.set(false);
      this.editing.set([]);
      this.error.set(code === 'OWNER_PROTECTED' ? 'Không thể thay đổi quyền của admin chính.'
        : code === 'SELF_GRANT_FORBIDDEN' ? 'Bạn không tự sửa bộ quyền của mình được; hãy nhờ admin chính hoặc người đã cấp quyền cho bạn.'
        : code === 'GRANTOR_PROTECTED' ? 'Không sửa được quyền của người đã cấp quyền phân quyền cho bạn.'
        : code === 'PERMISSION_REQUIRED' ? 'Bạn không còn quyền này. Chỉ admin chính hoặc người được cấp quyền phân quyền mới sửa được.'
        : 'Bạn không được cấp, thu hồi hoặc phân quyền cho tài khoản này.');
    } else if (code === 'ACCOUNT_DISABLED') {
      this.error.set('Tài khoản đã bị khóa, không thể cấp quyền quản trị.');
    } else if (code === 'TARGET_NOT_ADMIN') {
      this.editing.set([]);
      this.error.set('Tài khoản này không còn là đồng quản trị, không phân quyền chi tiết được. Hãy tải lại danh sách.');
    } else if (code === 'PERMISSION_NOT_GRANTABLE') {
      this.error.set('Quyền vừa chọn chỉ admin chính được giữ, không cấp cho người khác được.');
    } else if (error.status === 409) {
      this.error.set('Quyền tài khoản đã thay đổi. Hãy tải lại danh sách và kiểm tra trước khi thao tác tiếp.');
    } else if (error.status === 400) {
      this.error.set('Danh sách quyền không hợp lệ. Hãy tải lại danh sách rồi thử lại.');
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
