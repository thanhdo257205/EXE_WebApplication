import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { AdminSectionPage } from './admin-section.page';
import { AdminContentService } from '../../../core/admin/admin-content.service';

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
          totalItems: 1,
          page: 0,
          size: 20,
          totalPages: 1,
        }),
      getRevisions: () =>
        of({
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
          totalItems: 1,
          page: 0,
          size: 50,
          totalPages: 1,
          releaseVersion: 1,
        }),
      getAuditEvents: () =>
        of({
          items: [
            {
              id: 'aud-1',
              action: 'CONTENT_REVISION_UPSERT',
              targetType: 'CARD',
              actorDisplayName: 'Admin Đô Thành',
              createdAt: '2026-10-20T12:00:00Z',
            },
          ],
          totalItems: 1,
          page: 0,
          size: 10,
          totalPages: 1,
        }),
    };

    await TestBed.configureTestingModule({
      imports: [AdminSectionPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: { section: 'cards' },
            },
          },
        },
        { provide: AdminContentService, useValue: adminApiSpy },
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

  it('loads releases and cards for cards section', () => {
    expect(component.releases().length).toBe(1);
    expect(component.activeRelease()?.versionLabel).toBe('v2.0-draft');
    expect(component.cards().length).toBe(1);
    expect(component.cards()[0].code).toBe('CARD-001');
  });
});
