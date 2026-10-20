import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { catchError, map, Observable, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';

export interface DashboardReleases {
  draft: number;
  published: number;
  archived: number;
}

export interface AdminDashboardData {
  asOf: string;
  releases: DashboardReleases;
  feedbackNew: number;
  cardsNeedingReview: number;
}

export interface AdminRelease {
  id: string;
  versionLabel: string;
  title: string;
  releaseNotes: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  currentSlot: string | null;
  createdBy: string | null;
  createdAt: string;
  publishedAt: string | null;
  version: number;
}

export interface AdminReleasePage {
  items: AdminRelease[];
  totalItems: number;
  page: number;
  size: number;
  totalPages: number;
}

export interface AdminCard {
  id: string;
  revisionId: string;
  releaseId: string;
  code: string;
  slug: string;
  cardSetId: string;
  characterId: string | null;
  name: string;
  effectText: string;
  rulingNotes: string | null;
  ruleStatus: 'CONFIRMED' | 'NEEDS_REVIEW';
  copiesInDeck: number;
  artworkUrl: string | null;
  sortOrder: number;
}

export interface AdminCardSet {
  id: string;
  revisionId: string;
  releaseId: string;
  code: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
}

export interface AdminCharacter {
  id: string;
  revisionId: string;
  releaseId: string;
  code: string;
  slug: string;
  name: string;
  biography: string | null;
  abilityText: string | null;
  portraitUrl: string | null;
  sortOrder: number;
}

export interface AdminWikiPage {
  id: string;
  revisionId: string;
  releaseId: string;
  slug: string;
  pageType: 'STORY' | 'RULE' | 'GUIDE' | 'FAQ' | 'DEVLOG';
  title: string;
  summary: string | null;
  bodyMarkdown: string;
  ruleStatus: 'CONFIRMED' | 'NEEDS_REVIEW';
  sortOrder: number;
}

export interface AdminAuditEvent {
  id: string;
  actorId: string | null;
  actorDisplayName: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  releaseId: string | null;
  releaseVersion: number | null;
  createdAt: string;
}

export interface AdminAuditPage {
  items: AdminAuditEvent[];
  totalItems: number;
  page: number;
  size: number;
  totalPages: number;
}

export interface AdminRevisionPage<T> {
  items: T[];
  totalItems: number;
  page: number;
  size: number;
  totalPages: number;
  releaseVersion: number;
}

export interface CreateReleasePayload {
  versionLabel: string;
  title: string;
  releaseNotes?: string | null;
}

export interface AdminProblemDetail {
  status: number;
  title: string;
  detail?: string;
  code?: string;
  errors?: Array<{ field: string; message: string }>;
}

@Injectable({ providedIn: 'root' })
export class AdminContentService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private get base() {
    if (!environment.apiBaseUrl) throw new Error('API URL chưa được cấu hình.');
    return `${environment.apiBaseUrl}/v1/admin`;
  }

  /**
   * GET /api/v1/admin/dashboard
   */
  getDashboard(): Observable<AdminDashboardData> {
    return this.http.get<AdminDashboardData>(`${this.base}/dashboard`, {
      withCredentials: true,
      headers: new HttpHeaders({ 'Cache-Control': 'no-store' }),
    }).pipe(
      catchError(err => this.handleError(err))
    );
  }

  /**
   * GET /api/v1/admin/content/releases
   */
  getReleases(status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED', page = 0, size = 20): Observable<AdminReleasePage> {
    let params = new HttpParams().set('page', page.toString()).set('size', size.toString());
    if (status) {
      params = params.set('status', status);
    }
    return this.http.get<AdminReleasePage>(`${this.base}/content/releases`, {
      withCredentials: true,
      params,
      headers: new HttpHeaders({ 'Cache-Control': 'no-store' }),
    }).pipe(
      catchError(err => this.handleError(err))
    );
  }

  /**
   * POST /api/v1/admin/content/releases
   */
  createRelease(payload: CreateReleasePayload): Observable<AdminRelease> {
    return this.auth.getCsrf().pipe(
      switchMap(csrf =>
        this.http.post<AdminRelease>(`${this.base}/content/releases`, payload, {
          withCredentials: true,
          headers: new HttpHeaders({
            'Content-Type': 'application/json',
            [csrf.headerName]: csrf.token,
          }),
        })
      ),
      catchError(err => this.handleError(err))
    );
  }

  /**
   * GET /api/v1/admin/content/releases/{release}
   */
  getRelease(releaseId: string): Observable<AdminRelease> {
    return this.http.get<AdminRelease>(`${this.base}/content/releases/${releaseId}`, {
      withCredentials: true,
      headers: new HttpHeaders({ 'Cache-Control': 'no-store' }),
    }).pipe(
      catchError(err => this.handleError(err))
    );
  }

  /**
   * GET /api/v1/admin/content/releases/{release}/{kind}
   */
  getRevisions<T>(
    releaseId: string,
    kind: 'cards' | 'characters' | 'card-sets' | 'wiki-pages',
    page = 0,
    size = 20,
    q = ''
  ): Observable<AdminRevisionPage<T>> {
    let params = new HttpParams().set('page', page.toString()).set('size', size.toString());
    if (q) {
      params = params.set('q', q);
    }
    return this.http.get<AdminRevisionPage<T>>(`${this.base}/content/releases/${releaseId}/${kind}`, {
      withCredentials: true,
      params,
      headers: new HttpHeaders({ 'Cache-Control': 'no-store' }),
    }).pipe(
      catchError(err => this.handleError(err))
    );
  }

  /**
   * GET /api/v1/admin/content/audit-events
   */
  getAuditEvents(page = 0, size = 20, releaseId?: string): Observable<AdminAuditPage> {
    let params = new HttpParams().set('page', page.toString()).set('size', size.toString());
    if (releaseId) {
      params = params.set('releaseId', releaseId);
    }
    return this.http.get<AdminAuditPage>(`${this.base}/content/audit-events`, {
      withCredentials: true,
      params,
      headers: new HttpHeaders({ 'Cache-Control': 'no-store' }),
    }).pipe(
      catchError(err => this.handleError(err))
    );
  }

  private handleError(error: any): Observable<never> {
    const problem: AdminProblemDetail = {
      status: error?.status || 500,
      title: error?.error?.title || error?.statusText || 'Lỗi hệ thống',
      detail: error?.error?.detail || error?.message || 'Không thể kết nối đến máy chủ quản trị.',
      code: error?.error?.code,
      errors: error?.error?.errors,
    };
    return throwError(() => problem);
  }
}
