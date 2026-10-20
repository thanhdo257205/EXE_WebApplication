import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import {
  AdminContentService,
  AdminDashboardData,
  AdminReleasePage,
  AdminRevisionPage,
  AdminCard,
  AdminAuditPage,
} from './admin-content.service';
import { AuthService } from '../auth/auth.service';

describe('AdminContentService', () => {
  let service: AdminContentService;
  let httpMock: HttpTestingController;
  let authServiceSpy: any;

  beforeEach(() => {
    authServiceSpy = {
      currentUser: { set: vi.fn() },
      getCsrf: () => of({ headerName: 'X-XSRF-TOKEN', token: 'mock-csrf-token' }),
    };

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authServiceSpy },
      ],
    });

    service = TestBed.inject(AdminContentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('fetches admin dashboard counts correctly', () => {
    const mockDashboard: AdminDashboardData = {
      asOf: '2026-10-20T12:00:00Z',
      releases: { draft: 2, published: 1, archived: 0 },
      feedbackNew: 3,
      cardsNeedingReview: 5,
    };

    service.getDashboard().subscribe(data => {
      expect(data).toEqual(mockDashboard);
      expect(data.releases.draft).toBe(2);
      expect(data.cardsNeedingReview).toBe(5);
    });

    const req = httpMock.expectOne('/api/v1/admin/dashboard');
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.headers.get('Cache-Control')).toBe('no-store');
    req.flush(mockDashboard);
  });

  it('fetches content releases with pagination and filter', () => {
    const mockPage: AdminReleasePage = {
      items: [
        {
          id: 'rel-1',
          versionLabel: 'v2.0-draft',
          title: 'Bản thảo V2',
          releaseNotes: null,
          status: 'DRAFT',
          currentSlot: null,
          createdBy: 'admin-1',
          createdAt: '2026-10-20T10:00:00Z',
          publishedAt: null,
          version: 1,
        },
      ],
      totalElements: 1,
      page: 0,
      size: 20,
      totalPages: 1,
    };

    service.getReleases('DRAFT', 0, 10).subscribe(data => {
      expect(data.items.length).toBe(1);
      expect(data.totalElements).toBe(1);
      expect(data.items[0].versionLabel).toBe('v2.0-draft');
    });

    const req = httpMock.expectOne('/api/v1/admin/content/releases?page=0&size=10&status=DRAFT');
    expect(req.request.method).toBe('GET');
    req.flush(mockPage);
  });

  it('fetches revisions wrapped inside RevisionPage result object', () => {
    const mockRevisionPage: AdminRevisionPage<AdminCard> = {
      releaseVersion: 2,
      result: {
        items: [
          {
            id: 'card-1',
            revisionId: 'rev-1',
            releaseId: 'rel-1',
            code: 'BASE-01',
            slug: 'an-mi-goi',
            cardSetId: 'set-1',
            characterId: null,
            name: 'Ăn mì gói',
            effectText: 'Hồi phục năng lượng',
            rulingNotes: null,
            ruleStatus: 'CONFIRMED',
            copiesInDeck: 2,
            artworkUrl: null,
            sortOrder: 0,
          },
        ],
        totalElements: 148,
        page: 0,
        size: 50,
        totalPages: 3,
      },
    };

    service.getRevisions<AdminCard>('rel-1', 'cards', 0, 50, '').subscribe(data => {
      expect(data.releaseVersion).toBe(2);
      expect(data.result.items.length).toBe(1);
      expect(data.result.totalElements).toBe(148);
      expect(data.result.items[0].code).toBe('BASE-01');
    });

    const req = httpMock.expectOne('/api/v1/admin/content/releases/rel-1/cards?page=0&size=50');
    expect(req.request.method).toBe('GET');
    req.flush(mockRevisionPage);
  });

  it('fetches audit events with totalElements pagination', () => {
    const mockAuditPage: AdminAuditPage = {
      items: [
        {
          id: 'aud-1',
          actorId: 'admin-1',
          action: 'CONTENT_REVISION_UPSERT',
          entityType: 'CARD',
          entityId: 'card-1',
          outcome: 'SUCCESS',
          detailsRedacted: 'releaseId=rel-1;version=2',
          createdAt: '2026-10-20T12:00:00Z',
        },
      ],
      totalElements: 1,
      page: 0,
      size: 20,
      totalPages: 1,
    };

    service.getAuditEvents(0, 20).subscribe(data => {
      expect(data.items.length).toBe(1);
      expect(data.items[0].entityType).toBe('CARD');
      expect(data.totalElements).toBe(1);
    });

    const req = httpMock.expectOne('/api/v1/admin/content/audit-events?page=0&size=20');
    expect(req.request.method).toBe('GET');
    req.flush(mockAuditPage);
  });

  it('handles 401 unauthorized by clearing currentUser and reporting SESSION_EXPIRED', () => {
    service.getDashboard().subscribe({
      next: () => {
        throw new Error('should not succeed');
      },
      error: (problem) => {
        expect(problem.status).toBe(401);
        expect(problem.code).toBe('SESSION_EXPIRED');
        expect(authServiceSpy.currentUser.set).toHaveBeenCalledWith(null);
      },
    });

    const req = httpMock.expectOne('/api/v1/admin/dashboard');
    req.flush({ detail: 'Token expired' }, { status: 401, statusText: 'Unauthorized' });
  });

  it('creates a new draft release with CSRF token attached', () => {
    const newRelease = {
      id: 'rel-2',
      versionLabel: 'v2.1-draft',
      title: 'Bản cập nhật cân bằng',
      releaseNotes: 'Điều chỉnh hiệu ứng',
      status: 'DRAFT' as const,
      currentSlot: null,
      createdBy: 'admin-1',
      createdAt: '2026-10-20T12:00:00Z',
      publishedAt: null,
      version: 0,
    };

    service.createRelease({ versionLabel: 'v2.1-draft', title: 'Bản cập nhật cân bằng' }).subscribe(res => {
      expect(res.id).toBe('rel-2');
      expect(res.version).toBe(0);
    });

    const req = httpMock.expectOne('/api/v1/admin/content/releases');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('X-XSRF-TOKEN')).toBe('mock-csrf-token');
    req.flush(newRelease);
  });
});
