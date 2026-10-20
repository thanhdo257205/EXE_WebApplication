import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { AdminSectionPage } from './admin-section.page';
import { AdminContentService } from '../../../core/admin/admin-content.service';
import { AuthService } from '../../../core/auth/auth.service';

describe('AdminSectionPage', () => {
  let component: AdminSectionPage;
  let fixture: ComponentFixture<AdminSectionPage>;
  let adminApiSpy: any;

  beforeEach(async () => {
    adminApiSpy = {
      getReleases: () =>
        of({
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
        }),
      getRevisions: () =>
        of({
          releaseVersion: 1,
          result: {
            items: [
              {
                id: 'c-1',
                code: 'CARD-001',
                name: 'Ăn mì gói đêm khuya',
                copiesInDeck: 2,
                ruleStatus: 'CONFIRMED',
                effectText: 'Tiết kiệm 50k nhưng mất 1 máu',
              },
            ],
            totalElements: 1,
            page: 0,
            size: 50,
            totalPages: 1,
          },
        }),
      getAuditEvents: () =>
        of({
          items: [
            {
              id: 'aud-1',
              action: 'CONTENT_REVISION_UPSERT',
              entityType: 'CARD',
              entityId: 'card-1',
              actorId: 'admin-1',
              outcome: 'SUCCESS',
              detailsRedacted: 'releaseId=rel-1;version=1',
              createdAt: '2026-10-20T12:00:00Z',
            },
          ],
          totalElements: 1,
          page: 0,
          size: 10,
          totalPages: 1,
        }),
    };

    await TestBed.configureTestingModule({
      imports: [AdminSectionPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: { section: 'cards' },
            },
          },
        },
        { provide: AdminContentService, useValue: adminApiSpy },
        {
          provide: AuthService,
          useValue: {
            currentUser: () => ({ id: 'admin-1', email: 'admin@nhanayhoibao.vn', displayName: 'Admin Đô Thành', role: 'ADMIN' }),
            getCsrf: () => of({ headerName: 'X-XSRF-TOKEN', token: 'test' }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminSectionPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create admin section page', () => {
    expect(component).toBeTruthy();
  });

  it('should compute cards meta correctly', () => {
    const meta = component.meta();
    expect(meta.key).toBe('cards');
    expect(meta.badge).toBe('148 THẺ BÀI');
  });

  it('correctly loads revisions from res.result.items and totalElements', () => {
    expect(component.releases().length).toBe(1);
    expect(component.activeRelease()?.versionLabel).toBe('v2.0-draft');
    expect(component.cards().length).toBe(1);
    expect(component.cards()[0].code).toBe('CARD-001');
    expect(component.totalCardsCount()).toBe(1);
  });

  it('handles 401 session expired in section gracefully', () => {
    adminApiSpy.getReleases = () => throwError(() => ({ status: 401, code: 'SESSION_EXPIRED' }));
    component.loadSectionData();
    expect(component.isSessionExpired()).toBe(true);
    expect(component.errorMsg()).toContain('hết hạn');
  });
});
