import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError, Subject } from 'rxjs';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { AdminSectionPage } from './admin-section.page';
import { AdminContentService, AdminCard, AdminCardSet, AdminCharacter, AdminRelease } from '../../../core/admin/admin-content.service';
import { AuthService } from '../../../core/auth/auth.service';

describe('AdminSectionPage', () => {
  let component: AdminSectionPage;
  let fixture: ComponentFixture<AdminSectionPage>;
  let adminApiSpy: any;

  const mockDraftRelease: AdminRelease = {
    id: 'rel-draft-1',
    versionLabel: 'v2.0-draft',
    title: 'Bản thảo V2',
    releaseNotes: null,
    status: 'DRAFT',
    currentSlot: null,
    createdBy: 'admin-1',
    createdAt: '2026-10-20T10:00:00Z',
    publishedAt: null,
    version: 1,
  };

  const mockPublishedRelease: AdminRelease = {
    id: 'rel-pub-1',
    versionLabel: 'v1.0-official',
    title: 'Bản chính thức V1',
    releaseNotes: null,
    status: 'PUBLISHED',
    currentSlot: 'PROD',
    createdBy: 'admin-1',
    createdAt: '2026-10-10T10:00:00Z',
    publishedAt: '2026-10-15T10:00:00Z',
    version: 5,
  };

  beforeEach(async () => {
    adminApiSpy = {
      getReleases: vi.fn(() =>
        of({
          items: [mockPublishedRelease, mockDraftRelease],
          totalElements: 2,
          page: 0,
          size: 20,
          totalPages: 1,
        })
      ),
      getRevisions: vi.fn((_relId: string, kind: string) => {
        if (kind === 'card-sets') {
          return of({
            releaseVersion: 1,
            result: {
              items: [
                {
                  id: 'set-uuid-1',
                  revisionId: 'rev-s1',
                  releaseId: 'rel-draft-1',
                  code: 'BASE',
                  slug: 'co-ban',
                  name: 'Bộ cơ bản',
                  description: 'Bộ thẻ cơ bản',
                  sortOrder: 0,
                } as AdminCardSet,
              ],
              totalElements: 1,
              page: 0,
              size: 50,
              totalPages: 1,
            },
          });
        }
        if (kind === 'characters') {
          return of({
            releaseVersion: 1,
            result: {
              items: [
                {
                  id: 'char-uuid-1',
                  revisionId: 'rev-c1',
                  releaseId: 'rel-draft-1',
                  code: 'CHAR-AN',
                  slug: 'an',
                  name: 'An',
                  biography: 'Thủ quỹ cầu toàn',
                  abilityText: 'Khóa quỹ',
                  portraitUrl: null,
                  sortOrder: 1,
                } as AdminCharacter,
              ],
              totalElements: 1,
              page: 0,
              size: 50,
              totalPages: 1,
            },
          });
        }
        return of({
          releaseVersion: 1,
          result: {
            items: [
              {
                id: 'c-1',
                revisionId: 'rev-1',
                releaseId: 'rel-draft-1',
                code: 'CARD-001',
                slug: 'an-mi-goi',
                cardSetId: 'set-uuid-1',
                characterId: null,
                name: 'Ăn mì gói đêm khuya',
                copiesInDeck: 2,
                ruleStatus: 'CONFIRMED',
                effectText: 'Tiết kiệm 50k nhưng mất 1 máu',
                rulingNotes: null,
                artworkUrl: null,
                sortOrder: 0,
              } as AdminCard,
            ],
            totalElements: 1,
            page: 0,
            size: 50,
            totalPages: 1,
          },
        });
      }),
      createCard: vi.fn(),
      getRelease: vi.fn(() => of({ ...mockDraftRelease, version: 4 })),
      cloneRelease: vi.fn(),
      uploadCardImage: vi.fn(() => of({ url: '/media/cards/uploaded.webp', bytes: 1024, contentType: 'image/webp' })),
      getAuditEvents: vi.fn(() =>
        of({
          items: [],
          totalElements: 0,
          page: 0,
          size: 10,
          totalPages: 0,
        })
      ),
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

  it('should create admin section page and compute cards meta', () => {
    expect(component).toBeTruthy();
    expect(component.meta().key).toBe('cards');
    expect(component.meta().badge).toBe('148 THẺ BÀI');
  });

  it('prefers existing DRAFT release on initial load even if published release is first', () => {
    // In beforeEach, releases items were [mockPublishedRelease, mockDraftRelease]
    expect(component.releases().length).toBe(2);
    expect(component.activeRelease()?.id).toBe(mockDraftRelease.id);
    expect(component.activeRelease()?.status).toBe('DRAFT');
    expect(component.isDraftSelected()).toBe(true);
  });

  it('keeps the image uploader enabled without a DRAFT release and disables it only while saving', () => {
    component.activeRelease.set(mockPublishedRelease);
    fixture.detectChanges();
    expect(component.cardUploader()!.disabled()).toBe(false);

    component.activeRelease.set(null);
    fixture.detectChanges();
    expect(component.cardUploader()!.disabled()).toBe(false);

    component.cardSaving.set(true);
    fixture.detectChanges();
    expect(component.cardUploader()!.disabled()).toBe(true);
  });

  it('correctly loads revisions from res.result.items and totalElements', () => {
    expect(component.cards().length).toBe(1);
    expect(component.cards()[0].code).toBe('CARD-001');
    expect(component.totalCardsCount()).toBe(1);
    expect(component.cardSets().length).toBe(1);
    expect(component.characters().length).toBe(1);
  });

  it('handles 401 session expired in section gracefully', () => {
    adminApiSpy.getReleases = () => throwError(() => ({ status: 401, code: 'SESSION_EXPIRED' }));
    component.loadSectionData();
    expect(component.isSessionExpired()).toBe(true);
    expect(component.errorMsg()).toContain('hết hạn');
  });

  it('integrates upload event into card form artworkUrl and creates card with expectedVersion', () => {
    const uploadedArtworkUrl = `/media/cards/${'c'.repeat(64)}.webp`;
    component.cardUploader()!.uploaded.emit(uploadedArtworkUrl);
    expect(component.cardForm.artworkUrl).toBe(uploadedArtworkUrl);

    // Populate required fields
    component.cardForm.code = 'CARD-002';
    component.cardForm.name = 'Mua hàng online';
    component.cardForm.slug = 'mua-hang-online';
    component.cardForm.cardSetId = 'set-uuid-1';
    component.cardForm.characterId = 'char-uuid-1';
    component.cardForm.effectText = 'Giảm 2 tiền';
    component.cardForm.copiesInDeck = 3;
    component.cardForm.ruleStatus = 'CONFIRMED';
    component.cardForm.sortOrder = 5;

    const mockCreatedCard = {
      id: 'c-new-id',
      revisionId: 'rev-c-new',
      releaseId: mockDraftRelease.id,
      code: 'CARD-002',
      slug: 'mua-hang-online',
      cardSetId: 'set-uuid-1',
      characterId: 'char-uuid-1',
      name: 'Mua hàng online',
      effectText: 'Giảm 2 tiền',
      rulingNotes: null,
      ruleStatus: 'CONFIRMED' as const,
      copiesInDeck: 3,
      artworkUrl: uploadedArtworkUrl,
      sortOrder: 5,
    };

    adminApiSpy.createCard.mockReturnValue(
      of({
        entityId: 'c-new-id',
        releaseVersion: 2,
        item: mockCreatedCard,
      })
    );

    component.saveCard();

    expect(adminApiSpy.createCard).toHaveBeenCalledWith(mockDraftRelease.id, {
      expectedVersion: 1, // matches mockDraftRelease.version
      code: 'CARD-002',
      slug: 'mua-hang-online',
      name: 'Mua hàng online',
      cardSetId: 'set-uuid-1',
      characterId: 'char-uuid-1',
      effectText: 'Giảm 2 tiền',
      rulingNotes: null,
      ruleStatus: 'CONFIRMED',
      copiesInDeck: 3,
      artworkUrl: uploadedArtworkUrl,
      sortOrder: 5,
    });

    // Version is updated to 2
    expect(component.activeRelease()?.version).toBe(2);
    expect(component.cardSuccessMsg()).toContain('Mua hàng online');
    // Form is reset after success
    expect(component.cardForm.code).toBe('');
    expect(component.cardForm.artworkUrl).toBe('');
  });

  it('validates card inputs on client-side and blocks saving without calling API', () => {
    component.cardForm.code = ''; // Invalid: empty code
    component.cardForm.name = '';
    component.saveCard();

    expect(adminApiSpy.createCard).not.toHaveBeenCalled();
    expect(component.cardFormError()).toContain('Mã thẻ (code) bắt buộc');

    // Invalid slug regex
    component.cardForm.code = 'VALID-CODE';
    component.cardForm.slug = 'INVALID SLUG with spaces!';
    component.cardForm.name = 'Valid name';
    component.cardForm.cardSetId = 'set-uuid-1';
    component.cardForm.effectText = 'Valid effect';
    component.saveCard();
    expect(adminApiSpy.createCard).not.toHaveBeenCalled();
    expect(component.cardFormError()).toContain('Đường dẫn (slug) bắt buộc');

    // Invalid artwork URL
    component.cardForm.slug = 'valid-slug';
    component.cardForm.artworkUrl = 'invalid://bad-scheme.com';
    component.saveCard();
    expect(adminApiSpy.createCard).not.toHaveBeenCalled();
    expect(component.cardFormError()).toContain('Đường dẫn ảnh (artworkUrl) không hợp lệ');
  });

  it('blocks card creation when active release is PUBLISHED or when upload is busy', () => {
    // Select published release
    component.onReleaseSelect(mockPublishedRelease.id);
    expect(component.activeRelease()?.id).toBe(mockPublishedRelease.id);
    expect(component.isDraftSelected()).toBe(false);

    component.cardForm.code = 'CARD-003';
    component.cardForm.name = 'Test';
    component.cardForm.slug = 'test';
    component.cardForm.cardSetId = 'set-uuid-1';
    component.cardForm.effectText = 'Effect';

    component.saveCard();
    expect(adminApiSpy.createCard).not.toHaveBeenCalled();
    expect(component.cardFormError()).toContain('Chỉ có thể tạo thẻ trên bản phát hành DRAFT');

    // Switch back to draft, simulate upload busy
    component.onReleaseSelect(mockDraftRelease.id);
    component.onUploadBusyChange(true);
    component.cardForm.code = 'CARD-003';
    component.cardForm.name = 'Test';
    component.cardForm.slug = 'test';
    component.cardForm.cardSetId = 'set-uuid-1';
    component.cardForm.effectText = 'Effect';

    component.saveCard();
    expect(adminApiSpy.createCard).not.toHaveBeenCalled();
    expect(component.cardFormError()).toContain('Đang tải ảnh lên');
  });

  it('handles 409 conflict: retains user inputs, surfaces error and does not silently retry', () => {
    component.cardForm.code = 'CARD-CONFLICT';
    component.cardForm.name = 'Thẻ bị xung đột';
    component.cardForm.slug = 'the-bi-xung-dot';
    component.cardForm.cardSetId = 'set-uuid-1';
    component.cardForm.effectText = 'Nội dung quan trọng';
    component.cardForm.copiesInDeck = 4;
    component.cardForm.ruleStatus = 'CONFIRMED';

    adminApiSpy.createCard.mockReturnValue(
      throwError(() => ({
        status: 409,
        code: 'VERSION_CONFLICT',
        detail: 'Bản phát hành đã bị thay đổi bởi quản trị viên khác.',
      }))
    );

    component.saveCard();

    expect(adminApiSpy.createCard).toHaveBeenCalledTimes(1);
    expect(component.cardFormError()).toContain('Xung đột phiên bản (409)');
    // Form inputs must be retained on failure so user does not lose work!
    expect(component.cardForm.code).toBe('CARD-CONFLICT');
    expect(component.cardForm.name).toBe('Thẻ bị xung đột');
    expect(component.cardForm.effectText).toBe('Nội dung quan trọng');
    expect(component.cardSaving()).toBe(false);
  });

  it('resets form on release change and isolates stale responses from previous release', () => {
    // Fill form in draft release
    component.cardForm.code = 'CARD-TEMP';
    component.cardForm.name = 'Tên tạm';
    component.cardForm.slug = 'ten-tam';
    component.cardForm.artworkUrl = '/media/cards/old.webp';

    // Switch release to published release
    component.onReleaseSelect(mockPublishedRelease.id);

    // Form must be reset
    expect(component.cardForm.code).toBe('');
    expect(component.cardForm.name).toBe('');
    expect(component.cardForm.artworkUrl).toBe('');

    // Stale async response test: simulate delayed response for rel-draft-1 arriving while rel-pub-1 is active
    const staleRevisionSubject = new Subject<any>();
    adminApiSpy.getRevisions = vi.fn((relId: string) => {
      if (relId === 'rel-draft-1') return staleRevisionSubject.asObservable();
      return of({
        releaseVersion: 5,
        result: { items: [], totalElements: 0, page: 0, size: 50, totalPages: 0 },
      });
    });

    component.selectRelease(mockDraftRelease);
    // User quickly switches to published release before draft revisions return
    component.selectRelease(mockPublishedRelease);

    // Now draft revisions finally emit
    staleRevisionSubject.next({
      releaseVersion: 999,
      result: {
        items: [{ id: 'stale-card', code: 'STALE-001', name: 'Stale' }],
        totalElements: 1,
        page: 0,
        size: 50,
        totalPages: 1,
      },
    });

    // The active release must remain published and must not have stale draft cards
    expect(component.activeRelease()?.id).toBe(mockPublishedRelease.id);
    expect(component.cards().find(c => c.code === 'STALE-001')).toBeUndefined();
  });

  it('clones release into a new draft and selects the new draft', () => {
    // Switch to published release
    component.onReleaseSelect(mockPublishedRelease.id);
    expect(component.isDraftSelected()).toBe(false);

    component.cloneForm.versionLabel = 'v2.0-new-draft';
    component.cloneForm.title = 'Bản thảo nhân bản mới';
    component.cloneForm.releaseNotes = 'Ghi chú nhân bản';

    const newClonedDraft: AdminRelease = {
      id: 'rel-cloned-new',
      versionLabel: 'v2.0-new-draft',
      title: 'Bản thảo nhân bản mới',
      releaseNotes: 'Ghi chú nhân bản',
      status: 'DRAFT',
      currentSlot: null,
      createdBy: 'admin-1',
      createdAt: '2026-10-24T12:00:00Z',
      publishedAt: null,
      version: 0,
    };

    adminApiSpy.cloneRelease.mockReturnValue(of(newClonedDraft));

    component.submitCloneToDraft();

    expect(adminApiSpy.cloneRelease).toHaveBeenCalledWith(mockPublishedRelease.id, {
      sourceVersion: mockPublishedRelease.version,
      versionLabel: 'v2.0-new-draft',
      title: 'Bản thảo nhân bản mới',
      releaseNotes: 'Ghi chú nhân bản',
    });

    expect(component.activeRelease()?.id).toBe('rel-cloned-new');
    expect(component.isDraftSelected()).toBe(true);
    expect(component.cloneSuccessMsg()).toContain('v2.0-new-draft');
  });

  it('reloads a conflicted version without losing input and requires explicit resubmission', () => {
    Object.assign(component.cardForm, { code: 'NEW', name: 'Thẻ mới', slug: 'the-moi', effectText: 'Hiệu ứng' });
    adminApiSpy.createCard.mockReturnValue(throwError(() => ({ status: 409 })));
    component.saveCard();
    component.saveCard();
    expect(adminApiSpy.createCard).toHaveBeenCalledTimes(1);
    component.reloadSelectedRelease();
    expect(component.activeRelease()?.version).toBe(4);
    expect(component.cardForm.name).toBe('Thẻ mới');
    expect(component.cardConflict()).toBe(false);
    expect(adminApiSpy.createCard).toHaveBeenCalledTimes(1);
  });

  it('prevents duplicate submission and changing release while a save is in flight', async () => {
    await fixture.whenStable();
    Object.assign(component.cardForm, { code: 'NEW', name: 'Thẻ mới', slug: 'the-moi', effectText: 'Hiệu ứng' });
    const pending = new Subject<any>();
    adminApiSpy.createCard.mockReturnValue(pending);
    component.saveCard();
    component.saveCard();
    component.onReleaseSelect(mockPublishedRelease.id);
    expect(adminApiSpy.createCard).toHaveBeenCalledTimes(1);
    expect(component.activeRelease()?.id).toBe(mockDraftRelease.id);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#release-selector').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('fieldset').disabled).toBe(true);
    pending.error({ status: 500, detail: 'Không thể lưu' });
    expect(component.cardForm.name).toBe('Thẻ mới');
    expect(component.cardSaving()).toBe(false);
  });

  it('clears references from the old release immediately while the new release loads', () => {
    adminApiSpy.getRevisions.mockReturnValue(new Subject());
    component.selectRelease(mockPublishedRelease);
    expect(component.cardSets()).toEqual([]);
    expect(component.characters()).toEqual([]);
    expect(component.cardForm.cardSetId).toBe('');
  });
});
