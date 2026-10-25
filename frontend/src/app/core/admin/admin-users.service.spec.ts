import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { of } from 'rxjs';
import { AdminUsersService, type AdminAccount } from './admin-users.service';
import { AuthService } from '../auth/auth.service';

describe('AdminUsersService', () => {
  let api: AdminUsersService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), {
      provide: AuthService, useValue: { getCsrf: () => of({headerName:'X-XSRF-TOKEN',token:'test-csrf'}) },
    }] });
    api = TestBed.inject(AdminUsersService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('lists accounts with encoded search, paging and session credentials', () => {
    api.list(2, 'name+tag@example.test').subscribe();
    const req = http.expectOne(r => r.url === '/api/v1/admin/users');
    expect(req.request.params.get('q')).toBe('name+tag@example.test');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.withCredentials).toBe(true);
    req.flush({items:[],totalElements:0,totalPages:0,page:2,size:20,canManageRoles:false});
  });

  it('changes only the requested role with target version and CSRF, never an owner level', () => {
    api.changeRole({id:'target',version:7} as AdminAccount, 'ADMIN').subscribe();
    const req = http.expectOne('/api/v1/admin/users/target/role');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({role:'ADMIN',expectedVersion:7});
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.headers.get('X-XSRF-TOKEN')).toBe('test-csrf');
    req.flush({item:{id:'target',role:'ADMIN',version:8},changed:true});
  });

  it('lists pending invites with session credentials', () => {
    api.listInvites().subscribe();
    const req = http.expectOne('/api/v1/admin/users/invites');
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush({items:[],canManageRoles:true});
  });

  it('invites by email only, with CSRF', () => {
    api.invite('future@example.test').subscribe();
    const req = http.expectOne('/api/v1/admin/users/invites');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({email:'future@example.test'});
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.headers.get('X-XSRF-TOKEN')).toBe('test-csrf');
    req.flush({status:'INVITED',invite:{id:'invite-1',email:'future@example.test',invitedByName:null,createdAt:''}});
  });

  it('revokes a pending invite by id with CSRF', () => {
    api.revokeInvite('invite-1').subscribe();
    const req = http.expectOne('/api/v1/admin/users/invites/invite-1');
    expect(req.request.method).toBe('DELETE');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.headers.get('X-XSRF-TOKEN')).toBe('test-csrf');
    req.flush({removed:true});
  });
});
