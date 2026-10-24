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
  const result = (canManageRoles = true, items = [owner, customer, delegated]) => ({items,canManageRoles,page:0,size:20,totalPages:1,totalElements:items.length});
  let api: {list: ReturnType<typeof vi.fn>; changeRole: ReturnType<typeof vi.fn>};
  const auth = {currentUser:{set:vi.fn()}};
  beforeEach(() => {
    auth.currentUser.set.mockClear();
    api = {list:vi.fn(() => of(result())), changeRole:vi.fn()};
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
});
