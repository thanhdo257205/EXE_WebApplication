import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError, Subject } from 'rxjs';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { AdminSectionPage } from './admin-section.page';
import { AdminContentService, AdminCard, AdminCardSet, AdminCharacter, AdminRelease } from '../../../core/admin/admin-content.service';
import { CardImportRow } from '../../../core/admin/card-import';
import { ALL_PERMISSION_KEYS } from '../../../core/admin/permission-catalog';
import { AuthService } from '../../../core/auth/auth.service';

describe('AdminSectionPage', () => {
  let component: AdminSectionPage;
  let fixture: ComponentFixture<AdminSectionPage>;
  let adminApiSpy: any;
  // The page asks AuthService per module:action right inside computed signals, so the stub reads a signal too.
  const granted = signal([...ALL_PERMISSION_KEYS]);

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
    granted.set([...ALL_PERMISSION_KEYS]);
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
      createRelease: vi.fn(),
      createCardSet: vi.fn(),
      getRelease: vi.fn(() => of({ ...mockDraftRelease, version: 4 })),
      cloneRelease: vi.fn(),
      publishRelease: vi.fn(),
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
            currentUser: () => ({ id: 'admin-1', email: 'admin@example.test', displayName: 'Admin', role: 'ADMIN' }),
            getCsrf: () => of({ headerName: 'X-XSRF-TOKEN', token: 'test' }),
            hasPermission: (permission: string) => granted().includes(permission),
            hasAnyPermission: (permissions: readonly string[]) => permissions.some(p => granted().includes(p)),
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

  it('publishes the active draft with its expected version and switches the page to the published state', () => {
    const published: AdminRelease = {
      ...mockDraftRelease,
      status: 'PUBLISHED',
      currentSlot: 'PROD',
      publishedAt: '2026-10-28T09:00:00Z',
      version: 2,
    };
    adminApiSpy.publishRelease = vi.fn(() => of(published));
    adminApiSpy.getReleases = vi.fn(() =>
      of({
        items: [published, { ...mockPublishedRelease, status: 'ARCHIVED', currentSlot: null }],
        totalElements: 2,
        page: 0,
        size: 20,
        totalPages: 1,
      })
    );

    component.openPublishConfirm();
    expect(component.publishConfirmOpen()).toBe(true);

    component.submitPublish();

    expect(adminApiSpy.publishRelease).toHaveBeenCalledWith(mockDraftRelease.id, 1);
    expect(component.activeRelease()?.status).toBe('PUBLISHED');
    expect(component.activeRelease()?.currentSlot).toBe('PROD');
    expect(component.isDraftSelected()).toBe(false);
    expect(component.publishConfirmOpen()).toBe(false);
    expect(component.publishSuccessMsg()).toContain('v2.0-draft');
    expect(component.releases().find(r => r.id === mockPublishedRelease.id)?.status).toBe('ARCHIVED');
  });

  it('renders the publish control only for a DRAFT when the account holds releases:publish', () => {
    granted.set(['content:read', 'cards:create']);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#publish-release-btn')).toBeNull();

    granted.set(['content:read', 'releases:publish']);
    fixture.detectChanges();
    expect(el.querySelector('#publish-release-btn')).not.toBeNull();

    component.onReleaseSelect(mockPublishedRelease.id);
    fixture.detectChanges();
    expect(el.querySelector('#publish-release-btn')).toBeNull();
  });

  it('opens and cancels the publish confirmation without calling the API', () => {
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('#publish-release-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.publishConfirmOpen()).toBe(true);
    expect(el.querySelector('#confirm-publish-btn')).not.toBeNull();

    (el.querySelector('#cancel-publish-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.publishConfirmOpen()).toBe(false);
    expect(adminApiSpy.publishRelease).not.toHaveBeenCalled();
  });

  it('refuses to publish without releases:publish even when a DRAFT is selected', () => {
    granted.set(['content:read']);
    fixture.detectChanges();

    component.openPublishConfirm();
    expect(component.publishConfirmOpen()).toBe(false);

    component.submitPublish();
    expect(adminApiSpy.publishRelease).not.toHaveBeenCalled();
  });

  it('explains an empty release and a version conflict and keeps the confirm panel open', () => {
    adminApiSpy.publishRelease = vi.fn(() =>
      throwError(() => ({ status: 409, code: 'RELEASE_EMPTY', title: 'Xung đột phiên bản' }))
    );
    component.openPublishConfirm();
    component.submitPublish();

    expect(component.publishErrorMsg()).toContain('chưa có nội dung');
    expect(component.publishConfirmOpen()).toBe(true);
    expect(component.publishSaving()).toBe(false);
    expect(component.activeRelease()?.status).toBe('DRAFT');

    adminApiSpy.publishRelease = vi.fn(() => throwError(() => ({ status: 409, code: 'VERSION_CONFLICT' })));
    component.submitPublish();
    expect(component.publishErrorMsg()).toContain('Xung đột phiên bản');
  });

  it('clears a pending publish confirmation when the release changes', () => {
    component.openPublishConfirm();
    expect(component.publishConfirmOpen()).toBe(true);

    component.onReleaseSelect(mockPublishedRelease.id);

    expect(component.publishConfirmOpen()).toBe(false);
    expect(component.publishErrorMsg()).toBeNull();
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
    expect((fixture.nativeElement.querySelector('#card-form fieldset') as HTMLFieldSetElement).disabled).toBe(true);
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

  it('creates the first DRAFT release and starts loading its content', () => {
    const created: AdminRelease = { ...mockDraftRelease, id: 'rel-new', versionLabel: 'v3.0-draft', version: 0 };
    adminApiSpy.createRelease = vi.fn(() => of(created));
    component.releases.set([]);
    component.activeRelease.set(null);
    component.releaseForm = { versionLabel: 'v3.0-draft', title: 'Bản thảo V3', releaseNotes: '' };

    component.createRelease();

    expect(adminApiSpy.createRelease).toHaveBeenCalledWith({
      versionLabel: 'v3.0-draft',
      title: 'Bản thảo V3',
      releaseNotes: null,
    });
    expect(component.releases().length).toBe(1);
    expect(component.activeRelease()?.id).toBe('rel-new');
    expect(component.releaseSuccessMsg()).toContain('v3.0-draft');
  });

  it('creates a card set in the DRAFT release and reloads the card section', () => {
    adminApiSpy.createCardSet = vi.fn(() =>
      of({
        entityId: 'set-uuid-2',
        releaseVersion: 2,
        item: {
          id: 'set-uuid-2',
          revisionId: 'rev-s2',
          releaseId: 'rel-draft-1',
          code: 'SET-02',
          slug: 'bo-mo-rong',
          name: 'Bộ mở rộng',
          description: null,
          sortOrder: 2,
        } as AdminCardSet,
      })
    );
    component.activeRelease.set({ ...mockDraftRelease, version: 1 });
    component.cardSetForm = { code: 'SET-02', name: 'Bộ mở rộng', slug: 'bo-mo-rong', description: '', sortOrder: 2 };

    component.createCardSet();

    expect(adminApiSpy.createCardSet).toHaveBeenCalledWith('rel-draft-1', {
      expectedVersion: 1,
      code: 'SET-02',
      name: 'Bộ mở rộng',
      slug: 'bo-mo-rong',
      description: null,
      sortOrder: 2,
    });
    expect(component.activeRelease()?.version).toBe(2);
    expect(component.cardSetSuccessMsg()).toContain('SET-02');
    expect(component.cardSets().length).toBe(1);
  });

  it('loads the requested cards page together with the search query', () => {
    adminApiSpy.getRevisions.mockClear();
    adminApiSpy.getRevisions.mockReturnValue(
      of({ releaseVersion: 1, result: { items: [], totalElements: 120, page: 1, size: 50, totalPages: 3 } })
    );
    component.totalCardsCount.set(120);
    component.cardSearchInput = 'mì';

    component.onCardSearchSubmit();

    expect(adminApiSpy.getRevisions).toHaveBeenLastCalledWith('rel-draft-1', 'cards', 0, 50, 'mì');
    expect(component.cardsPage()).toBe(0);

    component.goToCardsPage(1);

    expect(component.cardsPage()).toBe(1);
    expect(component.cardsTotalPages()).toBe(3);
    expect(adminApiSpy.getRevisions).toHaveBeenLastCalledWith('rel-draft-1', 'cards', 1, 50, 'mì');
  });

  it('rejects non-xlsx files before parsing', async () => {
    const event = { target: { files: [new File(['code,name'], 'cards.csv')], value: 'cards.csv' } } as unknown as Event;
    await component.onImportFileSelected(event);

    expect(component.importErrorMsg()).toContain('.xlsx');
    expect(component.importRows()).toEqual([]);
  });

  it('rejects xlsx files exceeding 50 MB before parsing', async () => {
    const hugeFile = new File([''], 'huge.xlsx');
    Object.defineProperty(hugeFile, 'size', { value: 51 * 1024 * 1024 });
    const event = { target: { files: [hugeFile], value: 'huge.xlsx' } } as unknown as Event;
    await component.onImportFileSelected(event);

    expect(component.importErrorMsg()).toContain('50 MB');
    expect(component.importRows()).toEqual([]);
  });

  it('imports a card set and its cards sequentially with the running release version', async () => {
    component.importForm = { code: 'set-02', name: 'Bộ nhập', slug: 'bo-nhap', description: 'Mô tả', sortOrder: 2 };
    component.importRows.set([
      importRow({ line: 2, code: 'CARD-101', name: 'Thẻ 1', slug: 'the-1' }),
      importRow({ line: 3, code: 'CARD-102', name: 'Thẻ 2', slug: 'the-2', copiesInDeck: 2, ruleStatus: 'NEEDS_REVIEW' }),
    ]);
    adminApiSpy.createCardSet.mockReturnValue(
      of({
        entityId: 'set-new',
        releaseVersion: 2,
        item: { id: 'set-new', code: 'SET-02', slug: 'bo-nhap', name: 'Bộ nhập', description: 'Mô tả', sortOrder: 2 },
      })
    );
    adminApiSpy.createCard
      .mockReturnValueOnce(of({ entityId: 'c-101', releaseVersion: 3, item: {} }))
      .mockReturnValueOnce(of({ entityId: 'c-102', releaseVersion: 4, item: {} }));

    await component.submitCardImport();

    expect(adminApiSpy.createCardSet).toHaveBeenCalledWith('rel-draft-1', {
      expectedVersion: 1,
      code: 'SET-02',
      name: 'Bộ nhập',
      slug: 'bo-nhap',
      description: 'Mô tả',
      sortOrder: 2,
    });
    expect(adminApiSpy.createCard).toHaveBeenNthCalledWith(
      1,
      'rel-draft-1',
      expect.objectContaining({ expectedVersion: 2, cardSetId: 'set-new', code: 'CARD-101' })
    );
    expect(adminApiSpy.createCard).toHaveBeenNthCalledWith(
      2,
      'rel-draft-1',
      expect.objectContaining({ expectedVersion: 3, cardSetId: 'set-new', code: 'CARD-102', copiesInDeck: 2 })
    );
    expect(component.importCreated()).toBe(2);
    expect(component.activeRelease()?.version).toBe(4);
    expect(component.importSuccessMsg()).toContain('2 thẻ');
    expect(component.importRows()).toEqual([]);
    expect(component.importSaving()).toBe(false);
  });

  it('uploads embedded image to Azure before creating the card when row has an embedded image', async () => {
    component.importForm = { code: 'SET-06', name: 'Bộ nhúng ảnh', slug: 'bo-nhung-anh', description: '', sortOrder: 0 };
    const fakeImageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    component.importRows.set([
      importRow({
        line: 2,
        code: 'CARD-301',
        name: 'Thẻ có ảnh',
        slug: 'the-co-anh',
        embeddedImage: {
          name: 'image1.png',
          bytes: fakeImageBytes,
          mimeType: 'image/png',
          size: fakeImageBytes.byteLength,
        },
      }),
    ]);
    adminApiSpy.createCardSet.mockReturnValue(
      of({ entityId: 'set-img', releaseVersion: 2, item: { id: 'set-img', code: 'SET-06', slug: 'bo-nhung-anh', name: 'Bộ nhúng ảnh' } })
    );
    adminApiSpy.uploadCardImage.mockReturnValue(
      of({ url: '/media/cards/hash123.webp', bytes: 1024, contentType: 'image/webp' })
    );
    adminApiSpy.createCard.mockReturnValue(
      of({ entityId: 'c-301', releaseVersion: 3, item: {} })
    );

    await component.submitCardImport();

    expect(adminApiSpy.uploadCardImage).toHaveBeenCalledTimes(1);
    expect(adminApiSpy.createCard).toHaveBeenCalledWith(
      'rel-draft-1',
      expect.objectContaining({
        expectedVersion: 2,
        cardSetId: 'set-img',
        code: 'CARD-301',
        artworkUrl: '/media/cards/hash123.webp',
      })
    );
    expect(component.importCreated()).toBe(1);
  });

  it('stops an import at the failing row and keeps the created card set and cards', async () => {
    component.importForm = { code: 'SET-03', name: 'Bộ lỗi', slug: 'bo-loi', description: '', sortOrder: 0 };
    component.importRows.set([
      importRow({ line: 2, code: 'CARD-201', name: 'Thẻ 1', slug: 'the-1' }),
      importRow({ line: 3, code: 'CARD-202', name: 'Thẻ 2', slug: 'the-2' }),
    ]);
    adminApiSpy.createCardSet.mockReturnValue(
      of({ entityId: 'set-err', releaseVersion: 2, item: { id: 'set-err', code: 'SET-03', slug: 'bo-loi', name: 'Bộ lỗi' } })
    );
    adminApiSpy.createCard
      .mockReturnValueOnce(of({ entityId: 'c-201', releaseVersion: 3, item: {} }))
      .mockReturnValueOnce(throwError(() => ({ status: 409, code: 'CONSTRAINT_VIOLATION' })));

    await component.submitCardImport();

    expect(adminApiSpy.createCard).toHaveBeenCalledTimes(2);
    expect(component.importCreated()).toBe(1);
    expect(component.importErrorMsg()).toContain('dòng 3');
    expect(component.importErrorMsg()).toContain('1/2 thẻ');
    expect(component.importErrorMsg()).toContain('Mã hoặc slug đã tồn tại');
    expect(component.importSaving()).toBe(false);
  });

  it('blocks import when the preview still has row errors', async () => {
    component.importForm = { code: 'SET-04', name: 'Bộ lỗi', slug: 'bo-loi', description: '', sortOrder: 0 };
    component.importRows.set([importRow({ line: 2, errors: ['Thiếu tên thẻ.'] })]);

    await component.submitCardImport();

    expect(adminApiSpy.createCardSet).not.toHaveBeenCalled();
    expect(component.importErrorMsg()).toContain('Còn dòng lỗi');
  });

  it('clears import state when switching release', () => {
    component.importRows.set([importRow({ line: 2 })]);
    component.importForm.code = 'SET-05';
    component.importFileName.set('cards.xlsx');

    component.onReleaseSelect(mockPublishedRelease.id);

    expect(component.importRows()).toEqual([]);
    expect(component.importForm.code).toBe('');
    expect(component.importFileName()).toBe('');
  });

  it('hides every write form when the account only holds content:read', () => {
    granted.set(['content:read']);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#save-card-button')).toBeNull();
    expect(el.querySelector('#submit-card-import')).toBeNull();
    expect(el.querySelector('app-card-image-upload')).toBeNull();
    expect(component.showCardSetForm()).toBe(false);
    expect(component.canImportCards()).toBe(false);
    expect(component.cardUploader()).toBeUndefined();
    expect(el.textContent).toContain('chưa được cấp quyền');
  });

  it('renders the clone form only for an account holding releases:clone', () => {
    // The clone banner is the only place the button lives, and it needs a locked release selected.
    granted.set(['content:read', 'cards:create', 'card-sets:create']);
    component.activeRelease.set(mockPublishedRelease);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#submit-clone-btn')).toBeNull();
    expect(el.textContent).toContain('Nhân bản bản phát hành');

    granted.set(['content:read', 'releases:clone']);
    fixture.detectChanges();
    expect(el.querySelector('#submit-clone-btn')).not.toBeNull();
  });

  it('refuses writes at the method level when the matching right is missing', async () => {
    granted.set(['content:read', 'cards:create']);
    fixture.detectChanges();

    component.createRelease();
    component.createCardSet();
    component.submitCloneToDraft();
    component.toggleCardSetForm();
    component.toggleImportPanel();
    await component.submitCardImport();

    expect(adminApiSpy.createRelease).not.toHaveBeenCalled();
    expect(adminApiSpy.createCardSet).not.toHaveBeenCalled();
    expect(adminApiSpy.cloneRelease).not.toHaveBeenCalled();
    expect(component.cardSetFormOpen()).toBe(false);
    expect(component.importOpen()).toBe(true);
    expect(component.importErrorMsg()).toContain('Thêm bộ thẻ');
  });

  it('keeps the card write path open for an account that can add cards and sets', () => {
    granted.set(['content:read', 'cards:create', 'card-sets:create']);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#save-card-button')).not.toBeNull();
    expect(el.querySelector('#submit-card-import')).not.toBeNull();
    expect(el.querySelector('app-card-image-upload')).toBeNull();
    expect(component.canImportCards()).toBe(true);
    expect(component.canUploadMedia()).toBe(false);
  });

  it('blocks an embedded-image import when media:upload is missing', async () => {
    granted.set(['content:read', 'cards:create', 'card-sets:create']);
    const bytes = new Uint8Array([137, 80, 78, 71]);
    component.importForm = { code: 'SET-07', name: 'Bộ ảnh', slug: 'bo-anh', description: '', sortOrder: 0 };
    component.importRows.set([importRow({ embeddedImage: { name: 'image1.png', bytes, mimeType: 'image/png', size: bytes.byteLength } })]);

    await component.submitCardImport();

    expect(adminApiSpy.createCardSet).not.toHaveBeenCalled();
    expect(component.importErrorMsg()).toContain('Tải ảnh thẻ lên kho');
  });

  it('toggles cardCreationMode between EXCEL and MANUAL via option buttons', () => {
    expect(component.cardCreationMode()).toBe('EXCEL');

    const manualBtn: HTMLButtonElement = fixture.nativeElement.querySelector('#mode-manual-btn');
    expect(manualBtn).toBeTruthy();
    manualBtn.click();
    fixture.detectChanges();

    expect(component.cardCreationMode()).toBe('MANUAL');

    const excelBtn: HTMLButtonElement = fixture.nativeElement.querySelector('#mode-excel-btn');
    expect(excelBtn).toBeTruthy();
    excelBtn.click();
    fixture.detectChanges();

    expect(component.cardCreationMode()).toBe('EXCEL');
  });
});

function importRow(overrides: Partial<CardImportRow> = {}): CardImportRow {
  return {
    line: 2,
    code: 'CARD-001',
    name: 'Thẻ mẫu',
    slug: 'the-mau',
    effectText: 'Hiệu ứng',
    rulingNotes: null,
    ruleStatus: 'CONFIRMED' as const,
    copiesInDeck: 1,
    sortOrder: 1,
    artworkUrl: null,
    characterId: null,
    characterCode: null,
    errors: [],
    ...overrides,
  };
}
