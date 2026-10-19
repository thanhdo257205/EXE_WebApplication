import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { timeout } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ApplicationInfo { application: string; version: string; stage: string; }

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  readonly configured = environment.apiBaseUrl !== null;
  getInfo() {
    if (!environment.apiBaseUrl) throw new Error('API URL chưa được cấu hình.');
    return this.http.get<ApplicationInfo>(`${environment.apiBaseUrl}/v1/info`).pipe(timeout(15000));
  }
}
