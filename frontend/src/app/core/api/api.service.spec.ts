import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ApiService } from './api.service';

describe('API integration contract', () => {
  it('requests the versioned backend info endpoint', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const service = TestBed.inject(ApiService);
    const http = TestBed.inject(HttpTestingController);
    service.getInfo().subscribe(info => expect(info.application).toBe('EXE_WebApplication'));
    http.expectOne('/api/v1/info').flush({ application: 'EXE_WebApplication', version: '0.0.1', stage: 'scaffold' });
    http.verify();
  });
});
