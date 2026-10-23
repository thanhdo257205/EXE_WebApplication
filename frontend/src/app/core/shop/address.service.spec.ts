import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { AddressInput, AddressService } from './address.service';

const input: AddressInput = { label: null, recipientName: 'A', phone: '0900000000', addressLine: 'B', ward: null, district: null, province: 'C', isDefault: false };

describe('AddressService', () => {
  let service: AddressService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AuthService, useValue: { getCsrf: vi.fn(() => of({ headerName: 'X-CSRF', token: 'tok' })) } }] });
    service = TestBed.inject(AddressService); http = TestBed.inject(HttpTestingController);
  });

  it('lists addresses with credentials and no CSRF header', () => {
    service.list().subscribe();
    const req = http.expectOne('/api/v1/addresses');
    expect(req.request.method).toBe('GET'); expect(req.request.withCredentials).toBe(true); expect(req.request.headers.has('X-CSRF')).toBe(false);
    req.flush([]);
  });

  it('sends CSRF with every write and encodes ids', () => {
    service.create(input).subscribe(); service.update('a/b', input).subscribe(); service.setDefault('a1').subscribe(); service.remove('a1').subscribe();
    const calls = [['POST', '/api/v1/addresses'], ['PUT', '/api/v1/addresses/a%2Fb'], ['POST', '/api/v1/addresses/a1/default'], ['DELETE', '/api/v1/addresses/a1']] as const;
    for (const [method, url] of calls) {
      const req = http.expectOne(url);
      expect(req.request.method).toBe(method); expect(req.request.headers.get('X-CSRF')).toBe('tok'); expect(req.request.withCredentials).toBe(true);
      req.flush({});
    }
  });
});
