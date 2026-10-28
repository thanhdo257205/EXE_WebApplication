import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminUsersPage } from './admin-users.page';
import { AdminUsersService, type AdminAccount } from '../../../core/admin/admin-users.service';
import { AuthService } from '../../../core/auth/auth.service';

describe('RBAC users page', () => {
  const owner: AdminAccount = {id:'owner',email:'owner@example.test',displayName:'Admin chính',role:'ADMIN',adminLevel:'OWNER',enabled:true,version:0,createdAt:''};
  const customer: AdminAccount = {id:'customer',email:'customer@example.test',displayName:'Thành viên',role:'CUSTOMER',adminLevel:null,enabled:true,version:3,createdAt:''};
  const delegated: AdminAccount = {...customer,id:'admin',email:'admin@example.test',role:'ADMIN',adminLevel:'DELEGATED'};
  const result = (canManageRoles = true, items = [owner, customer, delegated], canManagePermissions = false) => ({items,canManageRoles,canManagePermissions,page:0,size:20,totalPages:1,totalElements:items.length});
  const pendingInvite = {id:'invite-1',email:'future@example.test',invitedByName:'Admin chính',createdAt:'2026-10-25T10:00:00.000Z'};
  const inviteResult = (items: any[] = [], canManageRoles = true) => ({items,canManageRoles});
  let api: {list: ReturnType<typeof vi.fn>; changeRole: ReturnType<typeof vi.fn>; updatePermissions: ReturnType<typeof vi.fn>; listInvites: ReturnType<typeof vi.fn>; invite: ReturnType<typeof vi.fn>; revokeInvite: ReturnType<typeof vi.fn>};
  const auth = {currentUser:{set:vi.fn()}};
  beforeEach(() => {
    auth.currentUser.set.mockClear();
    api = {list:vi.fn(() => of(result())), changeRole:vi.fn(), updatePermissions:vi.fn(), listInvites:vi.fn(() => of(inviteResult())), invite:vi.fn(), revokeInvite:vi.fn()};
    TestBed.configureTestingModule({imports:[AdminUsersPage],providers:[provideRouter([]),{provide:AdminUsersService,useValue:api},{provide:AuthService,useValue:auth}]});
  });
  const setup = () => {
    const fixture = TestBed.createComponent(AdminUsersPage); fixture.detectChanges();
    return {fixture,page:fixture.componentInstance,el:fixture.nativeElement as HTMLElement};
  };

  it('protects the owner and renders grant and revoke actions for the owner only', () => {
    const {page,el} = setup();
    expect(el.textContent).toContain('Được bảo vệ');
    expect(el.querySelectorAll('tbody button').length).toBe(2);
    page.propose(owner); expect(page.pending()).toBeNull();
    expect(api.changeRole).not.toHaveBeenCalled();
  });

  it('delegated admins see accounts but cannot grant or revoke, even through page methods', () => {
    api.list.mockReturnValue(of(result(false)));
    api.listInvites.mockReturnValue(of(inviteResult([], false)));
    const {page,el} = setup();
    expect(el.querySelectorAll('tbody button').length).toBe(0);
    page.propose(customer); page.confirm();
    expect(page.pending()).toBeNull(); expect(api.changeRole).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation and prevents duplicate saves while refreshing after success', () => {
    const pending = new Subject<any>(); api.changeRole.mockReturnValue(pending);
    const {page,fixture} = setup();
    page.propose(customer); fixture.detectChanges();
    expect(api.changeRole).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.confirmation').textContent).toContain(customer.email);
    page.confirm(); page.confirm();
    expect(api.changeRole).toHaveBeenCalledExactlyOnceWith(customer,'ADMIN');
    page.load(1); expect(api.list).toHaveBeenCalledTimes(1);
    pending.next({changed:true,item:{...customer,role:'ADMIN',version:4}});
    expect(page.pending()).toBeNull(); expect(api.list).toHaveBeenCalledTimes(2);
    expect(page.notice()).toContain('đăng nhập lại');
  });

  it('can cancel without a request and uses CUSTOMER to revoke a delegated admin', () => {
    const {page} = setup();
    page.propose(customer); page.cancel(); page.confirm();
    expect(api.changeRole).not.toHaveBeenCalled();
    api.changeRole.mockReturnValue(of({changed:true,item:{...delegated,role:'CUSTOMER'}}));
    page.propose(delegated); page.confirm();
    expect(api.changeRole).toHaveBeenCalledWith(delegated,'CUSTOMER');
  });

  it('requires a reload after a stale-version conflict or ambiguous network failure', () => {
    api.changeRole.mockReturnValue(throwError(() => ({status:409,error:{code:'VERSION_CONFLICT'}})));
    const {page} = setup();
    page.propose(customer); page.confirm();
    expect(page.error()).toContain('tải lại');
    page.propose(customer); page.confirm();
    expect(api.changeRole).toHaveBeenCalledTimes(1);
    page.load(); expect(page.needsReload()).toBe(false);
    api.changeRole.mockReturnValue(throwError(() => ({status:0})));
    page.propose(customer); page.confirm();
    expect(page.needsReload()).toBe(true);
    expect(page.error()).toContain('kiểm tra trạng thái');
  });

  it('removes management actions after a backend permission denial', () => {
    api.changeRole.mockReturnValue(throwError(() => ({status:403,error:{code:'OWNER_REQUIRED'}})));
    const {page,fixture,el} = setup();
    page.propose(customer); page.confirm(); fixture.detectChanges();
    expect(page.canManageRoles()).toBe(false);
    expect(el.querySelectorAll('tbody button').length).toBe(0);
  });

  it('redirects expired sessions to login and clears stale account state', () => {
    api.list.mockReturnValue(throwError(() => ({status:401})));
    const router = TestBed.inject(Router); const navigate = vi.spyOn(router,'navigate').mockResolvedValue(true);
    const {page} = setup();
    expect(auth.currentUser.set).toHaveBeenCalledWith(null);
    expect(navigate).toHaveBeenCalledWith(['/dang-nhap'],{queryParams:{returnUrl:'/admin/users'}});
    expect(page.accounts()).toEqual([]);
  });

  it('ignores stale account lists when a newer search has finished', () => {
    const old = new Subject<any>(); api.list.mockReturnValueOnce(old);
    const {page} = setup();
    page.query = 'customer'; api.list.mockReturnValueOnce(of(result(true,[customer]))); page.search();
    old.next(result(false));
    expect(page.accounts()).toEqual([customer]); expect(page.canManageRoles()).toBe(true);
    expect(api.list).toHaveBeenLastCalledWith(0,'customer');
  });

  it('shows the email invite form to the owner', () => {
    const {el} = setup();
    expect(el.querySelector('#invite-email')).not.toBeNull();
    expect(el.textContent).toContain('Thêm đồng quản trị bằng email');
  });

  it('hides the invite form from delegated admins', () => {
    api.list.mockReturnValue(of(result(false)));
    api.listInvites.mockReturnValue(of(inviteResult([], false)));
    const {el} = setup();
    expect(el.querySelector('#invite-email')).toBeNull();
  });

  it('adds an invite by email, trims it and explains automatic activation only via verified Google', () => {
    api.invite.mockReturnValue(of({status:'INVITED',invite:pendingInvite}));
    const {page} = setup();
    page.inviteEmail = '  future@example.test  ';
    page.sendInvite();
    expect(api.invite).toHaveBeenCalledExactlyOnceWith('future@example.test');
    expect(page.inviteEmail).toBe('');
    expect(page.notice()).toContain('đăng ký bằng Google');
    expect(page.notice()).toContain('cấp quyền thủ công');
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.listInvites).toHaveBeenCalledTimes(2);
  });

  it('does not submit an empty or whitespace-only invite email', () => {
    const {page,fixture,el} = setup();
    const button = el.querySelector('.invite-panel button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    page.sendInvite();
    page.inviteEmail = '   ';
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
    page.sendInvite();
    expect(api.invite).not.toHaveBeenCalled();
  });

  it('keeps the last loaded state and clears an old notice when a refresh fails', () => {
    api.invite.mockReturnValue(of({status:'INVITED',invite:pendingInvite}));
    const {page,fixture} = setup();
    page.inviteEmail = 'future@example.test';
    page.sendInvite();
    expect(page.notice()).toContain('lời mời');
    api.list.mockReturnValue(throwError(() => ({status:0})));
    page.reload();
    fixture.detectChanges();
    expect(page.notice()).toBe('');
    expect(page.error()).toContain('tải lại');
    expect(page.accounts().length).toBe(3);
    expect(page.canManageRoles()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('#invite-email')).not.toBeNull();
  });

  it('reports an immediate promotion when the invited email already has an account', () => {
    api.invite.mockReturnValue(of({status:'PROMOTED',account:{...customer,role:'ADMIN',adminLevel:'DELEGATED',version:4}}));
    const {page} = setup();
    page.inviteEmail = 'customer@example.test';
    page.sendInvite();
    expect(page.notice()).toContain('đăng nhập lại');
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it('requires confirmation before revoking a pending invite', () => {
    api.listInvites.mockReturnValue(of(inviteResult([pendingInvite])));
    api.revokeInvite.mockReturnValue(of({removed:true}));
    const {page,fixture} = setup();
    page.proposeRevoke(pendingInvite); fixture.detectChanges();
    expect(api.revokeInvite).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).querySelector('.confirmation')?.textContent).toContain(pendingInvite.email);
    page.cancelRevoke(); page.confirmRevoke();
    expect(api.revokeInvite).not.toHaveBeenCalled();
    page.proposeRevoke(pendingInvite); page.confirmRevoke();
    expect(api.revokeInvite).toHaveBeenCalledExactlyOnceWith(pendingInvite.id);
    expect(page.pendingRevoke()).toBeNull();
    expect(page.notice()).toContain('Đã thu hồi lời mời');
    expect(api.listInvites).toHaveBeenCalledTimes(2);
  });

  it('never requests the owner-only invite list for delegated admins', () => {
    api.list.mockReturnValue(of(result(false)));
    const {el} = setup();
    expect(api.listInvites).not.toHaveBeenCalled();
    expect(el.textContent).not.toContain(pendingInvite.email);
    expect(el.textContent).toContain('Chỉ admin chính được thay đổi quyền');
  });

  it('maps invite conflicts and keeps the email for correction', () => {
    api.invite.mockReturnValue(throwError(() => ({status:409,error:{code:'ALREADY_ADMIN'}})));
    const {page} = setup();
    page.inviteEmail = 'admin@example.test';
    page.sendInvite();
    expect(page.error()).toContain('đã có quyền đồng quản trị');
    expect(page.inviteEmail).toBe('admin@example.test');
    api.invite.mockReturnValue(throwError(() => ({status:400})));
    page.sendInvite();
    expect(page.error()).toContain('Email không hợp lệ');
    expect(api.list).toHaveBeenCalledTimes(1);
  });

  it('redirects to login when an invite request loses its session', () => {
    api.invite.mockReturnValue(throwError(() => ({status:401})));
    const router = TestBed.inject(Router); const navigate = vi.spyOn(router,'navigate').mockResolvedValue(true);
    const {page} = setup();
    page.inviteEmail = 'future@example.test';
    page.sendInvite();
    expect(auth.currentUser.set).toHaveBeenCalledWith(null);
    expect(navigate).toHaveBeenCalledWith(['/dang-nhap'],{queryParams:{returnUrl:'/admin/users'}});
  });

  it('keeps the permission column read-only for co-admins', () => {
    const {el} = setup();
    expect(el.textContent).toContain('Chỉ admin chính mới phân quyền được');
    expect(el.querySelector('app-admin-permission-editor')).toBeNull();
  });

  it('offers the permission editor only for active co-admins and never for the owner or members', () => {
    api.list.mockReturnValue(of(result(true,[owner,customer,delegated],true)));
    const {page,el} = setup();
    expect(el.textContent).toContain('Toàn quyền — được bảo vệ');
    expect(el.textContent).toContain('0 quyền (bộ mặc định)');
    const labels = [...el.querySelectorAll('tbody button')].map(button => button.textContent?.trim());
    expect(labels.filter(label => label === 'Phân quyền chi tiết')).toHaveLength(1);
    page.openPermissions(owner); expect(page.editing()).toEqual([]);
    page.openPermissions(customer); expect(page.editing()).toEqual([]);
    page.openPermissions(delegated); expect(page.editing()).toEqual([delegated]);
  });

  it('writes the chosen set with the permission version and adopts the normalized response', () => {
    const granted: AdminAccount = {...delegated,permissions:['content:read','cards:update'],permissionsVersion:4,customPermissions:true};
    const stored: AdminAccount = {...granted,permissions:['content:read','cards:update','media:upload'],permissionsVersion:5};
    api.list.mockReturnValue(of(result(true,[granted],true)));
    api.updatePermissions.mockReturnValue(of({changed:true,account:stored}));
    const {page,fixture,el} = setup();
    page.openPermissions(granted); fixture.detectChanges();
    expect(el.querySelector('app-admin-permission-editor')).not.toBeNull();
    page.savePermissions(['content:read','cards:update','media:upload']);
    expect(api.updatePermissions).toHaveBeenCalledExactlyOnceWith(granted,['content:read','cards:update','media:upload']);
    expect(page.accounts()).toEqual([stored]);
    expect(page.editing()).toEqual([stored]);
    expect(page.notice()).toContain('hiệu lực từ yêu cầu kế tiếp');
  });

  it('says so when the server reports the set was already stored', () => {
    const granted: AdminAccount = {...delegated,permissions:['content:read'],permissionsVersion:2,customPermissions:true};
    api.list.mockReturnValue(of(result(true,[granted],true)));
    api.updatePermissions.mockReturnValue(of({changed:false,account:granted}));
    const {page} = setup();
    page.openPermissions(granted);
    page.savePermissions(['content:read']);
    expect(page.notice()).toContain('không có thay đổi');
    expect(page.editing()).toEqual([granted]);
  });

  it('closes the editor and forces a reload when the permission version is stale', () => {
    api.list.mockReturnValue(of(result(true,[owner,customer,delegated],true)));
    api.updatePermissions.mockReturnValue(throwError(() => ({status:409,error:{code:'VERSION_CONFLICT'}})));
    const {page,fixture,el} = setup();
    page.openPermissions(delegated); fixture.detectChanges();
    page.savePermissions(['content:read']);
    fixture.detectChanges();
    expect(page.editing()).toEqual([]);
    expect(page.needsReload()).toBe(true);
    expect(page.error()).toContain('tải lại');
    expect(el.querySelector('app-admin-permission-editor')).toBeNull();
  });

  it('drops the permission editor when the account turns out not to be assignable', () => {
    api.list.mockReturnValue(of(result(true,[owner,customer,delegated],true)));
    api.updatePermissions.mockReturnValue(throwError(() => ({status:403,error:{code:'OWNER_REQUIRED'}})));
    const {page,fixture,el} = setup();
    page.openPermissions(delegated); fixture.detectChanges();
    page.savePermissions(['content:read']); fixture.detectChanges();
    expect(page.canManagePermissions()).toBe(false);
    expect(page.error()).toContain('Chỉ admin chính');
    expect(el.querySelectorAll('tbody button').length).toBe(0);
  });

  it('closes the editor when a refresh no longer returns that account', () => {
    api.list.mockReturnValue(of(result(true,[owner,customer,delegated],true)));
    const {page,fixture} = setup();
    page.openPermissions(delegated); fixture.detectChanges();
    expect(page.editing()).toEqual([delegated]);
    api.list.mockReturnValue(of(result(true,[customer],true)));
    page.load();
    expect(page.editing()).toEqual([]);
  });

  it('switches modes instead of stacking a role confirmation over the editor, and blocks writes while saving', () => {
    const inflight = new Subject<any>();
    api.list.mockReturnValue(of(result(true,[owner,customer,delegated],true)));
    api.updatePermissions.mockReturnValue(inflight);
    const {page} = setup();
    page.propose(delegated);
    page.openPermissions(delegated);
    expect(page.pending()).toBeNull();
    expect(page.editing()).toEqual([delegated]);
    page.savePermissions(['content:read']);
    expect(api.updatePermissions).toHaveBeenCalledOnce();
    page.openPermissions(delegated);
    expect(page.editing()).toEqual([delegated]);
    page.savePermissions(['users:read']);
    expect(api.updatePermissions).toHaveBeenCalledOnce();
    page.closePermissions();
    expect(page.editing()).toEqual([delegated]);
    inflight.next({changed:true,account:{...delegated,permissions:['content:read'],permissionsVersion:1}});
    expect(page.editing()).toHaveLength(1);
    page.closePermissions();
    expect(page.editing()).toEqual([]);
  });
});
