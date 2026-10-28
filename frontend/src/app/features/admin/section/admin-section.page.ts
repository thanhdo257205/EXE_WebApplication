import { RiseHeadingDirective } from '../../../shared/motion/rise-heading.directive';
import { Component, DestroyRef, inject, computed, OnInit, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SlicePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../../core/auth/auth.service';
import { CardImageUploadComponent } from '../card-image-upload/card-image-upload.component';
import { MorphIconComponent } from '../../../shared/components/morph-icon/morph-icon.component';
import { MorphIconName } from '../../../shared/components/morph-icon/icons';
import {
  CARD_IMPORT_TEMPLATE_FILENAME,
  CardEmbeddedImage,
  CardImportRow,
  CardSetImportDraft,
  buildCardImportTemplate,
  isAllowedArtworkUrl,
  parseCardImport,
  readCardImportWorkbook,
  slugify,
  validateCardSetImport,
} from '../../../core/admin/card-import';
import { prepareCardImage } from '../../../core/admin/card-image';
import {
  AdminContentService,
  AdminRelease,
  AdminCard,
  AdminCardSet,
  AdminAuditEvent,
  AdminCharacter,
  AdminWikiPage,
  AdminProblemDetail,
  CreateCardPayload,
  CreateCardSetPayload,
  CloneReleasePayload,
} from '../../../core/admin/admin-content.service';

export interface SectionMeta {
  key: string;
  title: string;
  subtitle: string;
  icon: MorphIconName;
  badge: string;
}

@Component({
  selector: 'app-admin-section',
  standalone: true,
  imports: [RiseHeadingDirective, RouterLink, FormsModule, SlicePipe, MorphIconComponent, CardImageUploadComponent],
  templateUrl: './admin-section.page.html',
  styleUrl: './admin-section.page.css',
})
export class AdminSectionPage implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly adminApi = inject(AdminContentService);
  private readonly http = inject(HttpClient);
  readonly auth = inject(AuthService);

  readonly loading = signal(false);
  readonly errorMsg = signal<string | null>(null);
  readonly isSessionExpired = signal(false);

  readonly releases = signal<AdminRelease[]>([]);
  readonly activeRelease = signal<AdminRelease | null>(null);

  readonly cards = signal<AdminCard[]>([]);
  readonly cardSets = signal<AdminCardSet[]>([]);
  readonly totalCardsCount = signal<number>(0);

  readonly characters = signal<AdminCharacter[]>([]);
  readonly totalCharactersCount = signal<number>(0);

  readonly wikiPages = signal<AdminWikiPage[]>([]);
  readonly totalWikiCount = signal<number>(0);
  readonly activeWikiTab = signal<'ALL' | 'STORY' | 'RULE' | 'GUIDE' | 'FAQ' | 'DEVLOG'>('ALL');

  readonly auditEvents = signal<AdminAuditEvent[]>([]);
  readonly totalAuditCount = signal<number>(0);

  readonly paymentConfig = signal<{ provider: string; enabled: boolean } | null>(null);
  readonly ordersList = signal<any[]>([]);

  readonly searchQuery = signal('');

  // Card creation & Upload state
  readonly cardUploader = viewChild<CardImageUploadComponent>('cardUploader');
  readonly cardSaving = signal(false);
  readonly uploadBusy = signal(false);
  readonly cardFormError = signal<string | null>(null);
  readonly cardSuccessMsg = signal<string | null>(null);
  readonly cardConflict = signal(false);

  // Clone release state
  readonly cloneSaving = signal(false);
  readonly cloneErrorMsg = signal<string | null>(null);
  readonly cloneSuccessMsg = signal<string | null>(null);

  // Release / card-set bootstrap state
  readonly releaseSaving = signal(false);
  readonly releaseErrorMsg = signal<string | null>(null);
  readonly releaseSuccessMsg = signal<string | null>(null);
  readonly cardSetSaving = signal(false);
  readonly cardSetErrorMsg = signal<string | null>(null);
  readonly cardSetSuccessMsg = signal<string | null>(null);
  readonly cardSetFormOpen = signal(false);

  // Card creation mode option (Excel vs Manual)
  readonly cardCreationMode = signal<'EXCEL' | 'MANUAL'>('EXCEL');

  // Excel card-set import state
  readonly importOpen = signal(true);
  readonly importParsing = signal(false);
  readonly importSaving = signal(false);
  readonly importStatusText = signal<string | null>(null);
  readonly importErrorMsg = signal<string | null>(null);
  readonly importSuccessMsg = signal<string | null>(null);
  readonly importRows = signal<CardImportRow[]>([]);
  readonly importFileName = signal('');
  readonly importProgress = signal({ done: 0, total: 0 });
  readonly importCreated = signal(0);
  readonly importErrorCount = computed(() => this.importRows().filter(row => row.errors.length > 0).length);
  readonly importEmbeddedImageCount = computed(
    () => this.importRows().filter(row => Boolean(row.embeddedImage)).length
  );
  readonly importReady = computed(() => this.importRows().length > 0 && this.importErrorCount() === 0);

  // Card list pagination & search
  readonly cardsPage = signal(0);
  readonly cardsPageSize = 50;
  readonly cardsTotalPages = computed(() => Math.max(1, Math.ceil(this.totalCardsCount() / this.cardsPageSize)));
  cardSearchInput = '';

  // Sequence to prevent race conditions on fast release switching
  private loadContentSeq = 0;
  private cardsSeq = 0;
  private slugManuallyEdited = false;
  private cardSetSlugManuallyEdited = false;
  private importSlugManuallyEdited = false;

  releaseForm = {
    versionLabel: '',
    title: '',
    releaseNotes: '',
  };

  cardSetForm = {
    code: '',
    name: '',
    slug: '',
    description: '',
    sortOrder: 0,
  };

  importForm = {
    code: '',
    name: '',
    slug: '',
    description: '',
    sortOrder: 0,
  };

  cardForm = {
    code: '',
    slug: '',
    name: '',
    cardSetId: '',
    characterId: '',
    effectText: '',
    rulingNotes: '',
    ruleStatus: 'CONFIRMED' as 'CONFIRMED' | 'NEEDS_REVIEW',
    copiesInDeck: 1,
    artworkUrl: '',
    sortOrder: 0,
  };

  cloneForm = {
    versionLabel: '',
    title: '',
    releaseNotes: '',
  };

  readonly isDraftSelected = computed(() => this.activeRelease()?.status === 'DRAFT');

  readonly showCardSetForm = computed(
    () => this.isDraftSelected() && (this.cardSets().length === 0 || this.cardSetFormOpen())
  );

  readonly sectionKey = computed(() => {
    return this.route.snapshot.data['section'] || 'cards';
  });

  readonly filteredWikiPages = computed(() => {
    const tab = this.activeWikiTab();
    const list = this.wikiPages();
    if (tab === 'ALL') return list;
    return list.filter(p => p.pageType === tab);
  });

  readonly meta = computed<SectionMeta>(() => {
    switch (this.sectionKey()) {
      case 'cards':
        return {
          key: 'cards',
          title: 'Quản trị Thẻ bài & Bộ thẻ (148 thẻ V2)',
          subtitle: 'Kiểm tra 11 bộ mở rộng, đối chiếu mã định danh và xem trước trước khi chốt bản snapshot.',
          icon: 'cards',
          badge: '148 THẺ BÀI',
        };
      case 'characters':
        return {
          key: 'characters',
          title: 'Quản lý Hồ sơ 8 Cư dân chính thức',
          subtitle: 'Hồ sơ nhân vật, tính cách, kỹ năng giải quyết drama và ảnh đại diện.',
          icon: 'residents',
          badge: '8 CƯ DÂN',
        };
      case 'articles':
        return {
          key: 'articles',
          title: 'Wiki luật, FAQ & Câu chuyện căn nhà',
          subtitle: 'Soạn thảo, quản lý các bản sửa đổi (revision) và duyệt nội dung tra cứu.',
          icon: 'file-text',
          badge: 'NỘI DUNG',
        };
      case 'inventory':
        return {
          key: 'inventory',
          title: 'Quản lý Sản phẩm & Tồn kho SKU',
          subtitle: 'Theo dõi số lượng tồn thực tế, tồn đã giữ và lịch sử điều chỉnh kho có lý do.',
          icon: 'package',
          badge: 'SỔ CÁI KHO',
        };
      case 'orders':
        return {
          key: 'orders',
          title: 'Quản lý Đơn hàng & Vận chuyển',
          subtitle: 'Xem danh sách đơn, trạng thái thanh toán PayOS và tiến độ giao hàng.',
          icon: 'store',
          badge: 'ĐƠN HÀNG',
        };
      case 'payments':
        return {
          key: 'payments',
          title: 'Thanh toán PayOS & Sổ cái giao dịch',
          subtitle: 'Hàng chờ UNKNOWN/REVIEW, kiểm tra webhook inbox và quy trình hoàn tiền có bằng chứng.',
          icon: 'fund',
          badge: 'PAYOS GATEWAY',
        };
      case 'users':
        return {
          key: 'users',
          title: 'Quản lý Tài khoản Cư dân & Phân quyền',
          subtitle: 'Danh sách thành viên, kiểm tra vai trò (ADMIN/CUSTOMER), trạng thái hoạt động.',
          icon: 'user',
          badge: 'TÀI KHOẢN',
        };
      case 'system':
      default:
        return {
          key: 'system',
          title: 'Trạng thái Hệ thống & Nhật ký Audit',
          subtitle: 'Theo dõi PostgreSQL Aiven, Cloudflare Gateway và nhật ký thao tác quản trị viên.',
          icon: 'database',
          badge: 'HẠ TẦNG',
        };
    }
  });

  ngOnInit(): void {
    this.loadSectionData();
  }

  loadSectionData(): void {
    if (this.cardSaving() || this.cloneSaving() || this.importSaving()) return;
    const key = this.sectionKey();
    this.loading.set(true);
    this.errorMsg.set(null);
    this.isSessionExpired.set(false);

    if (key === 'cards' || key === 'characters' || key === 'articles') {
      this.adminApi.getReleases().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (page) => {
          this.releases.set(page.items);
          // Prefer existing DRAFT release on initial load
          const draft = page.items.find(r => r.status === 'DRAFT');
          const initial = draft || page.items[0] || null;
          this.activeRelease.set(initial);

          if (initial) {
            this.loadReleaseContent(initial.id, key);
          } else {
            this.loading.set(false);
          }
        },
        error: (err) => this.handleApiError(err),
      });
    } else if (key === 'system') {
      this.adminApi.getAuditEvents(0, 20).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (page) => {
          this.auditEvents.set(page.items);
          this.totalAuditCount.set(page.totalElements);
          this.loading.set(false);
        },
        error: (err) => this.handleApiError(err),
      });
    } else if (key === 'payments') {
      this.http.get<{ provider: string; enabled: boolean }>('/api/v1/payments/config').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (cfg) => {
          this.paymentConfig.set(cfg);
          this.loading.set(false);
        },
        error: () => {
          this.paymentConfig.set({ provider: 'PAYOS', enabled: false });
          this.loading.set(false);
        },
      });
    } else if (key === 'orders') {
      this.http.get<any[]>('/api/v1/orders', { withCredentials: true }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (orders) => {
          this.ordersList.set(Array.isArray(orders) ? orders : []);
          this.loading.set(false);
        },
        error: (err) => {
          this.ordersList.set([]);
          this.handleApiError(err);
        },
      });
    } else {
      this.loading.set(false);
    }
  }

  loadReleaseContent(releaseId: string, key: string): void {
    const currentSeq = ++this.loadContentSeq;
    this.loading.set(true);

    if (key === 'cards') {
      this.loadCards(releaseId);

      this.adminApi.getRevisions<AdminCardSet>(releaseId, 'card-sets', 0, 50).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (res) => {
          if (currentSeq !== this.loadContentSeq || this.activeRelease()?.id !== releaseId) return;
          this.cardSets.set(res.result.items);
          this.updateReleaseVersion(releaseId, res.releaseVersion);
          if (this.cardSets().length > 0 && !this.cardForm.cardSetId) {
            this.cardForm.cardSetId = this.cardSets()[0].id;
          }
        },
        error: (err) => {
          if (currentSeq !== this.loadContentSeq || this.activeRelease()?.id !== releaseId) return;
          this.handleApiError(err);
        },
      });

      this.adminApi.getRevisions<AdminCharacter>(releaseId, 'characters', 0, 50).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (res) => {
          if (currentSeq !== this.loadContentSeq || this.activeRelease()?.id !== releaseId) return;
          this.characters.set(res.result.items);
          this.updateReleaseVersion(releaseId, res.releaseVersion);
        },
        error: () => {
          // Characters are optional for card linkage, do not fail entire section
        },
      });
    } else if (key === 'characters') {
      this.adminApi.getRevisions<AdminCharacter>(releaseId, 'characters', 0, 50).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (res) => {
          if (currentSeq !== this.loadContentSeq || this.activeRelease()?.id !== releaseId) return;
          this.characters.set(res.result.items);
          this.totalCharactersCount.set(res.result.totalElements);
          this.updateReleaseVersion(releaseId, res.releaseVersion);
          this.loading.set(false);
        },
        error: (err) => {
          if (currentSeq !== this.loadContentSeq || this.activeRelease()?.id !== releaseId) return;
          this.handleApiError(err);
        },
      });
    } else if (key === 'articles') {
      this.adminApi.getRevisions<AdminWikiPage>(releaseId, 'wiki-pages', 0, 50).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (res) => {
          if (currentSeq !== this.loadContentSeq || this.activeRelease()?.id !== releaseId) return;
          this.wikiPages.set(res.result.items);
          this.totalWikiCount.set(res.result.totalElements);
          this.updateReleaseVersion(releaseId, res.releaseVersion);
          this.loading.set(false);
        },
        error: (err) => {
          if (currentSeq !== this.loadContentSeq || this.activeRelease()?.id !== releaseId) return;
          this.handleApiError(err);
        },
      });
    }
  }

  private loadCards(releaseId: string): void {
    const seq = ++this.cardsSeq;
    this.loading.set(true);
    this.adminApi
      .getRevisions<AdminCard>(releaseId, 'cards', this.cardsPage(), this.cardsPageSize, this.searchQuery())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          if (seq !== this.cardsSeq || this.activeRelease()?.id !== releaseId) return;
          this.cards.set(res.result.items);
          this.totalCardsCount.set(res.result.totalElements);
          this.updateReleaseVersion(releaseId, res.releaseVersion);
          this.loading.set(false);
        },
        error: (err) => {
          if (seq !== this.cardsSeq || this.activeRelease()?.id !== releaseId) return;
          this.handleApiError(err);
        },
      });
  }

  onCardSearchSubmit(): void {
    const rel = this.activeRelease();
    if (!rel || this.loading()) return;
    this.searchQuery.set(this.cardSearchInput.trim());
    this.cardsPage.set(0);
    this.loadCards(rel.id);
  }

  clearCardSearch(): void {
    this.cardSearchInput = '';
    if (!this.searchQuery()) return;
    this.searchQuery.set('');
    this.cardsPage.set(0);
    const rel = this.activeRelease();
    if (rel) this.loadCards(rel.id);
  }

  goToCardsPage(page: number): void {
    const rel = this.activeRelease();
    if (!rel || page < 0 || page >= this.cardsTotalPages() || this.loading()) return;
    this.cardsPage.set(page);
    this.loadCards(rel.id);
  }

  toggleCardSetForm(): void {
    this.cardSetFormOpen.update(value => !value);
  }

  toggleImportPanel(): void {
    this.importOpen.update(value => !value);
  }

  downloadImportTemplate(): void {
    const bytes = buildCardImportTemplate();
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const url = URL.createObjectURL(
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = CARD_IMPORT_TEMPLATE_FILENAME;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  onImportSetNameInput(): void {
    if (!this.importSlugManuallyEdited) {
      this.importForm.slug = slugify(this.importForm.name);
    }
  }

  onImportSetSlugInput(): void {
    this.importSlugManuallyEdited = true;
  }

  async onImportFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.importSaving()) return;

    this.importRows.set([]);
    this.importFileName.set('');
    this.importErrorMsg.set(null);
    this.importSuccessMsg.set(null);
    this.importStatusText.set(null);
    this.importProgress.set({ done: 0, total: 0 });

    if (!/\.xlsx$/i.test(file.name)) {
      this.importErrorMsg.set('Chỉ hỗ trợ file Excel .xlsx. Hãy tải file mẫu để bắt đầu.');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      this.importErrorMsg.set('File Excel vượt quá 50 MB. Hãy giảm kích thước ảnh hoặc tách bớt dữ liệu rồi thử lại.');
      return;
    }

    this.importParsing.set(true);
    try {
      const workbook = await readCardImportWorkbook(file);
      if (this.destroyRef.destroyed) return;
      const preview = parseCardImport(workbook.matrix, this.characters(), workbook.images);
      this.importRows.set(preview.rows);
      this.importFileName.set(file.name);
      if (preview.fileError) this.importErrorMsg.set(preview.fileError);
    } catch (error) {
      this.importErrorMsg.set(error instanceof Error ? error.message : 'Không đọc được file Excel.');
    } finally {
      this.importParsing.set(false);
    }
  }

  async submitCardImport(): Promise<void> {
    if (this.importSaving() || this.importParsing()) return;
    const rel = this.activeRelease();
    if (!rel) {
      this.importErrorMsg.set('Chưa chọn bản phát hành.');
      return;
    }
    if (rel.status !== 'DRAFT') {
      this.importErrorMsg.set('Chỉ có thể nhập bộ thẻ vào bản phát hành DRAFT.');
      return;
    }
    const rows = this.importRows();
    if (rows.length === 0) {
      this.importErrorMsg.set('Chưa chọn file Excel có dữ liệu thẻ.');
      return;
    }
    if (this.importErrorCount() > 0) {
      this.importErrorMsg.set('Còn dòng lỗi trong file. Hãy sửa file và chọn lại trước khi nhập.');
      return;
    }

    const draft: CardSetImportDraft = {
      code: this.importForm.code.trim().toUpperCase(),
      name: this.importForm.name.trim(),
      slug: this.importForm.slug.trim() || slugify(this.importForm.name),
      description: this.importForm.description.trim(),
      sortOrder: Number(this.importForm.sortOrder),
    };
    const draftError = validateCardSetImport(draft, this.cardSets());
    if (draftError) {
      this.importErrorMsg.set(draftError);
      return;
    }

    this.importSaving.set(true);
    this.importErrorMsg.set(null);
    this.importSuccessMsg.set(null);
    this.importStatusText.set('Đang tạo bộ thẻ…');
    this.importCreated.set(0);
    let version = rel.version;
    let setCreated = false;
    let currentRow: CardImportRow | undefined;

    try {
      const setResponse = await firstValueFrom(
        this.adminApi.createCardSet(rel.id, {
          expectedVersion: version,
          code: draft.code,
          name: draft.name,
          slug: draft.slug,
          description: draft.description || null,
          sortOrder: draft.sortOrder,
        })
      );
      setCreated = true;
      version = setResponse.releaseVersion;
      this.updateReleaseVersion(rel.id, version);
      this.importProgress.set({ done: 0, total: rows.length });

      for (let index = 0; index < rows.length; index++) {
        if (this.destroyRef.destroyed || this.activeRelease()?.id !== rel.id) return;
        currentRow = rows[index];

        let finalArtworkUrl = currentRow.artworkUrl;
        if (currentRow.embeddedImage && (!finalArtworkUrl || !finalArtworkUrl.startsWith('/media/cards/'))) {
          this.importStatusText.set(`Đang tải ảnh dòng ${currentRow.line} (${index + 1}/${rows.length}) lên Azure…`);
          const imageBytes = currentRow.embeddedImage.bytes;
          const imageBuffer = imageBytes.buffer.slice(
            imageBytes.byteOffset,
            imageBytes.byteOffset + imageBytes.byteLength
          ) as ArrayBuffer;
          const imageFile = new File([imageBuffer], currentRow.embeddedImage.name, {
            type: currentRow.embeddedImage.mimeType,
          });
          const preparedBlob = await prepareCardImage(imageFile);
          const uploadRes = await firstValueFrom(this.adminApi.uploadCardImage(preparedBlob));
          finalArtworkUrl = uploadRes.url;
          currentRow.artworkUrl = finalArtworkUrl;
        }

        this.importStatusText.set(`Đang tạo thẻ ${currentRow.code || index + 1} (${index + 1}/${rows.length})…`);
        const response = await firstValueFrom(
          this.adminApi.createCard(rel.id, {
            expectedVersion: version,
            code: currentRow.code,
            slug: currentRow.slug,
            name: currentRow.name,
            cardSetId: setResponse.item.id,
            characterId: currentRow.characterId,
            effectText: currentRow.effectText,
            rulingNotes: currentRow.rulingNotes,
            ruleStatus: currentRow.ruleStatus,
            copiesInDeck: currentRow.copiesInDeck,
            artworkUrl: finalArtworkUrl,
            sortOrder: currentRow.sortOrder,
          })
        );
        version = response.releaseVersion;
        this.importCreated.update(count => count + 1);
        this.importProgress.set({ done: index + 1, total: rows.length });
        this.updateReleaseVersion(rel.id, version);
      }

      this.importSuccessMsg.set(
        `Đã tạo bộ thẻ "${draft.name}" và ${rows.length} thẻ trong bản thảo ${rel.versionLabel}. Thẻ chưa hiển thị công khai cho đến khi xuất bản.`
      );
      this.importForm = { code: '', name: '', slug: '', description: '', sortOrder: 0 };
      this.importSlugManuallyEdited = false;
      this.importRows.set([]);
      this.importFileName.set('');
      this.importProgress.set({ done: 0, total: 0 });
      this.importOpen.set(false);
    } catch (error) {
      const problem = error as AdminProblemDetail;
      if (this.activeRelease()?.id === rel.id) {
        const reason = this.describeImportProblem(problem);
        if (setCreated) {
          const rowLabel = currentRow ? ` ở dòng ${currentRow.line} (${currentRow.code || 'chưa có mã'})` : '';
          this.importErrorMsg.set(
            `Dừng${rowLabel}: ${reason} Đã tạo bộ thẻ "${draft.name}" và ${this.importCreated()}/${rows.length} thẻ; các thẻ đã tạo vẫn được giữ. Hãy sửa file rồi thêm phần còn lại hoặc dùng biểu mẫu thẻ bài.`
          );
        } else {
          this.importErrorMsg.set(`Không thể tạo bộ thẻ: ${reason}`);
        }
      }
    } finally {
      this.importSaving.set(false);
      this.importStatusText.set(null);
      if (!this.destroyRef.destroyed && this.activeRelease()?.id === rel.id) {
        this.loadReleaseContent(rel.id, 'cards');
      }
    }
  }

  private describeImportProblem(problem: AdminProblemDetail | any): string {
    if (problem?.status === 401 || problem?.code === 'SESSION_EXPIRED') {
      return 'Phiên quản trị đã hết hạn, hãy đăng nhập lại.';
    }
    if (problem?.status === 403) {
      return 'Tài khoản không có quyền ADMIN hoặc thiếu chữ ký CSRF.';
    }
    if (problem?.code === 'CONSTRAINT_VIOLATION') {
      return 'Mã hoặc slug đã tồn tại trong hệ thống.';
    }
    if (problem?.code === 'VERSION_CONFLICT' || problem?.status === 409) {
      return 'Xung đột phiên bản: bản thảo đã thay đổi, hãy tải lại dữ liệu rồi thử lại.';
    }
    return problem?.detail || problem?.title || problem?.message || 'Lỗi không xác định.';
  }

  formatImageSize(bytes: number): string {
    return `${Math.max(1, Math.round(bytes / 1024))} kB`;
  }

  private resetImportState(): void {
    this.importRows.set([]);
    this.importFileName.set('');
    this.importProgress.set({ done: 0, total: 0 });
    this.importCreated.set(0);
    this.importStatusText.set(null);
    this.importErrorMsg.set(null);
    this.importSuccessMsg.set(null);
    this.importForm = { code: '', name: '', slug: '', description: '', sortOrder: 0 };
    this.importSlugManuallyEdited = false;
  }

  createRelease(): void {
    if (this.releaseSaving() || this.loading()) return;
    const versionLabel = this.releaseForm.versionLabel.trim();
    if (!versionLabel || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(versionLabel) || versionLabel.length > 40) {
      this.releaseErrorMsg.set('Nhãn phiên bản (versionLabel) bắt buộc, tối đa 40 ký tự (VD: v2.0-draft).');
      return;
    }
    const title = this.releaseForm.title.trim();
    if (!title || title.length > 200) {
      this.releaseErrorMsg.set('Tiêu đề bản phát hành bắt buộc, tối đa 200 ký tự.');
      return;
    }
    if (this.releaseForm.releaseNotes.length > 10000) {
      this.releaseErrorMsg.set('Ghi chú phát hành tối đa 10000 ký tự.');
      return;
    }

    this.releaseSaving.set(true);
    this.releaseErrorMsg.set(null);
    this.releaseSuccessMsg.set(null);

    this.adminApi
      .createRelease({
        versionLabel,
        title,
        releaseNotes: this.releaseForm.releaseNotes.trim() || null,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (release) => {
          this.releaseSaving.set(false);
          this.releaseForm = { versionLabel: '', title: '', releaseNotes: '' };
          this.releases.set([release]);
          this.releaseSuccessMsg.set(
            `Đã tạo bản thảo ${release.versionLabel}. Tiếp theo: tạo bộ thẻ mở rộng, rồi thêm thẻ bài.`
          );
          this.selectRelease(release);
        },
        error: (err: AdminProblemDetail) => {
          this.releaseSaving.set(false);
          this.releaseErrorMsg.set(err.detail || err.title || 'Không thể tạo bản phát hành.');
        },
      });
  }

  onCardSetNameInput(): void {
    if (!this.cardSetSlugManuallyEdited) {
      this.cardSetForm.slug = slugify(this.cardSetForm.name);
    }
  }

  onCardSetSlugInput(): void {
    this.cardSetSlugManuallyEdited = true;
  }

  createCardSet(): void {
    if (this.cardSetSaving() || this.loading()) return;
    const rel = this.activeRelease();
    if (!rel) {
      this.cardSetErrorMsg.set('Chưa chọn bản phát hành.');
      return;
    }
    if (rel.status !== 'DRAFT') {
      this.cardSetErrorMsg.set('Chỉ có thể thêm bộ thẻ vào bản phát hành DRAFT.');
      return;
    }
    const f = this.cardSetForm;
    if (!f.code || !/^[A-Z0-9][A-Z0-9_-]*$/.test(f.code.trim()) || f.code.trim().length > 40) {
      this.cardSetErrorMsg.set('Mã bộ thẻ bắt buộc, tối đa 40 ký tự, chỉ gồm chữ hoa, số, gạch ngang/gạch dưới (VD: SET-01).');
      return;
    }
    if (!f.name.trim() || f.name.trim().length > 160) {
      this.cardSetErrorMsg.set('Tên bộ thẻ bắt buộc, tối đa 160 ký tự.');
      return;
    }
    if (!f.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(f.slug.trim()) || f.slug.trim().length > 160) {
      this.cardSetErrorMsg.set('Đường dẫn (slug) bắt buộc, tối đa 160 ký tự, chữ thường và dấu gạch ngang.');
      return;
    }
    if (f.description.length > 10000) {
      this.cardSetErrorMsg.set('Mô tả bộ thẻ tối đa 10000 ký tự.');
      return;
    }
    const sort = Number(f.sortOrder);
    if (!Number.isInteger(sort) || sort < 0 || sort > 100000) {
      this.cardSetErrorMsg.set('Thứ tự hiển thị phải là số nguyên từ 0 đến 100000.');
      return;
    }

    this.cardSetSaving.set(true);
    this.cardSetErrorMsg.set(null);
    this.cardSetSuccessMsg.set(null);

    this.adminApi
      .createCardSet(rel.id, {
        expectedVersion: rel.version,
        code: f.code.trim(),
        name: f.name.trim(),
        slug: f.slug.trim(),
        description: f.description.trim() || null,
        sortOrder: sort,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.cardSetSaving.set(false);
          if (this.activeRelease()?.id !== rel.id) return;
          this.updateReleaseVersion(rel.id, res.releaseVersion);
          this.cardSetSuccessMsg.set(`Đã tạo bộ thẻ "${res.item.name}" (${res.item.code}). Giờ có thể thêm thẻ bài.`);
          this.cardSetForm = { code: '', name: '', slug: '', description: '', sortOrder: 0 };
          this.cardSetSlugManuallyEdited = false;
          this.cardSetFormOpen.set(false);
          this.loadReleaseContent(rel.id, 'cards');
        },
        error: (err: AdminProblemDetail) => {
          this.cardSetSaving.set(false);
          if (this.activeRelease()?.id !== rel.id) return;
          this.cardSetErrorMsg.set(
            err.status === 409 || err.code === 'VERSION_CONFLICT'
              ? 'Xung đột phiên bản (409): bản thảo đã thay đổi. Vui lòng tải lại dữ liệu rồi thử lại.'
              : err.detail || err.title || 'Không thể tạo bộ thẻ.'
          );
        },
      });
  }

  onReleaseSelect(releaseId: string): void {
    if (this.cardSaving() || this.cloneSaving() || this.importSaving()) return;
    const target = this.releases().find(r => r.id === releaseId);
    if (target && target.id !== this.activeRelease()?.id) {
      this.selectRelease(target);
    }
  }

  selectRelease(release: AdminRelease): void {
    this.activeRelease.set(release);
    this.cards.set([]);
    this.cardSets.set([]);
    this.characters.set([]);
    this.totalCardsCount.set(0);
    this.cardsPage.set(0);
    this.searchQuery.set('');
    this.cardSearchInput = '';
    this.resetCardForm();
    this.cardUploader()?.reset();
    this.cardSuccessMsg.set(null);
    this.cardFormError.set(null);
    this.cardSetErrorMsg.set(null);
    this.cardSetSuccessMsg.set(null);
    this.cardSetFormOpen.set(false);
    this.resetImportState();
    this.importOpen.set(false);
    this.cloneErrorMsg.set(null);
    this.cloneSuccessMsg.set(null);
    this.loadReleaseContent(release.id, this.sectionKey());
  }

  updateReleaseVersion(releaseId: string, version: number): void {
    const active = this.activeRelease();
    if (active && active.id === releaseId && active.version < version) {
      this.activeRelease.set({ ...active, version });
    }
    this.releases.update(list => list.map(r => (r.id === releaseId ? { ...r, version: Math.max(r.version, version) } : r)));
  }

  onImageUploaded(url: string): void {
    this.cardForm.artworkUrl = url;
  }

  onUploadBusyChange(busy: boolean): void {
    this.uploadBusy.set(busy);
  }

  onCardNameInput(): void {
    if (!this.slugManuallyEdited) {
      this.cardForm.slug = slugify(this.cardForm.name);
    }
  }

  onSlugInput(): void {
    this.slugManuallyEdited = true;
  }

  resetCardForm(): void {
    this.cardUploader()?.reset();
    this.cardConflict.set(false);
    this.slugManuallyEdited = false;
    this.cardForm = {
      code: '',
      slug: '',
      name: '',
      cardSetId: this.cardSets().length > 0 ? this.cardSets()[0].id : '',
      characterId: '',
      effectText: '',
      rulingNotes: '',
      ruleStatus: 'CONFIRMED',
      copiesInDeck: 1,
      artworkUrl: '',
      sortOrder: 0,
    };
    this.cardFormError.set(null);
  }

  validateCardForm(): string | null {
    const f = this.cardForm;
    if (!f.code || !/^[A-Z0-9][A-Z0-9_-]*$/.test(f.code) || f.code.length > 40) {
      return 'Mã thẻ (code) bắt buộc, tối đa 40 ký tự, chỉ gồm chữ hoa, số, gạch ngang/gạch dưới (VD: CARD-001).';
    }
    if (!f.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(f.slug) || f.slug.length > 160) {
      return 'Đường dẫn (slug) bắt buộc, tối đa 160 ký tự, chữ thường và dấu gạch ngang (VD: an-mi-goi).';
    }
    if (!f.name || !f.name.trim() || f.name.trim().length > 160) {
      return 'Tên thẻ bắt buộc, tối đa 160 ký tự.';
    }
    if (!f.cardSetId || !this.cardSets().some(set => set.id === f.cardSetId)) {
      return 'Vui lòng chọn bộ thẻ mở rộng.';
    }
    if (f.characterId && !this.characters().some(character => character.id === f.characterId)) {
      return 'Nhân vật không thuộc bản phát hành đang chọn.';
    }
    if (!f.effectText || !f.effectText.trim() || f.effectText.trim().length > 10000) {
      return 'Hiệu ứng thẻ bắt buộc, tối đa 10000 ký tự.';
    }
    if (f.rulingNotes && f.rulingNotes.length > 10000) {
      return 'Ghi chú luật tối đa 10000 ký tự.';
    }
    if (!f.ruleStatus || (f.ruleStatus !== 'CONFIRMED' && f.ruleStatus !== 'NEEDS_REVIEW')) {
      return 'Trạng thái luật không hợp lệ.';
    }
    const copies = Number(f.copiesInDeck);
    if (!Number.isInteger(copies) || copies < 1 || copies > 1000) {
      return 'Số bản trong bộ phải là số nguyên từ 1 đến 1000.';
    }
    if (f.sortOrder !== null && f.sortOrder !== undefined && String(f.sortOrder) !== '') {
      const sort = Number(f.sortOrder);
      if (!Number.isInteger(sort) || sort < 0 || sort > 100000) {
        return 'Thứ tự hiển thị phải là số nguyên từ 0 đến 100000.';
      }
    }
    if (f.artworkUrl) {
      const val = f.artworkUrl.trim();
      if (val.length > 2048) return 'Đường dẫn ảnh tối đa 2048 ký tự.';
      if (!isAllowedArtworkUrl(val)) {
        return 'Đường dẫn ảnh (artworkUrl) không hợp lệ. Phải là /media/cards/<hash>.(png|jpg|webp), /assets/... hoặc URL HTTPS.';
      }
    }
    return null;
  }

  saveCard(): void {
    if (this.cardSaving() || this.loading() || this.cardConflict()) return;

    const rel = this.activeRelease();
    if (!rel) {
      this.cardFormError.set('Chưa chọn bản phát hành.');
      return;
    }
    if (rel.status !== 'DRAFT') {
      this.cardFormError.set('Chỉ có thể tạo thẻ trên bản phát hành DRAFT (Bản thảo).');
      return;
    }
    if (this.uploadBusy()) {
      this.cardFormError.set('Đang tải ảnh lên, vui lòng chờ hoàn tất trước khi lưu.');
      return;
    }

    const validationErr = this.validateCardForm();
    if (validationErr) {
      this.cardFormError.set(validationErr);
      return;
    }

    this.cardSaving.set(true);
    this.cardFormError.set(null);
    this.cardSuccessMsg.set(null);

    const f = this.cardForm;
    const payload: CreateCardPayload = {
      expectedVersion: rel.version,
      code: f.code.trim(),
      slug: f.slug.trim(),
      name: f.name.trim(),
      cardSetId: f.cardSetId,
      characterId: f.characterId ? f.characterId : null,
      effectText: f.effectText.trim(),
      rulingNotes: f.rulingNotes ? f.rulingNotes.trim() : null,
      ruleStatus: f.ruleStatus,
      copiesInDeck: Number(f.copiesInDeck),
      artworkUrl: f.artworkUrl ? f.artworkUrl.trim() : null,
      sortOrder: f.sortOrder !== null && f.sortOrder !== undefined && String(f.sortOrder) !== '' ? Number(f.sortOrder) : 0,
    };

    this.adminApi.createCard(rel.id, payload).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        this.cardSaving.set(false);
        if (this.activeRelease()?.id !== rel.id) return;
        this.cardSuccessMsg.set(`Đã tạo thành công thẻ "${res.item.name}" (${res.item.code}) trong bản thảo.`);
        this.updateReleaseVersion(rel.id, res.releaseVersion);
        this.loadReleaseContent(rel.id, 'cards');
        this.resetCardForm();
        this.cardUploader()?.reset();
      },
      error: (err: AdminProblemDetail) => {
        this.cardSaving.set(false);
        if (this.activeRelease()?.id !== rel.id) return;
        // Retain form inputs on failure!
        if (err.status === 409 || err.code === 'VERSION_CONFLICT') {
          this.cardConflict.set(true);
          this.cardFormError.set(
            'Xung đột phiên bản (409): Bản phát hành đã bị sửa đổi bởi quản trị viên khác. Vui lòng tải lại dữ liệu trước khi lưu.'
          );
        } else {
          this.cardFormError.set(err.detail || err.title || 'Không thể tạo thẻ bài.');
        }
      },
    });
  }

  reloadSelectedRelease(): void {
    const id = this.activeRelease()?.id;
    if (!id || this.cardSaving() || this.cloneSaving() || this.importSaving() || this.loading()) return;
    this.loading.set(true);
    this.adminApi.getRelease(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: release => {
        if (this.activeRelease()?.id !== id) return;
        this.activeRelease.set(release);
        this.releases.update(items => items.map(item => item.id === id ? release : item));
        this.cardConflict.set(false);
        this.cardFormError.set(null);
        this.cloneErrorMsg.set(null);
        this.loadReleaseContent(id, this.sectionKey());
      },
      error: err => {
        if (this.activeRelease()?.id === id) this.handleApiError(err);
      },
    });
  }

  submitCloneToDraft(): void {
    if (this.cloneSaving()) return;

    const source = this.activeRelease();
    if (!source) {
      this.cloneErrorMsg.set('Không có bản phát hành nguồn để nhân bản.');
      return;
    }

    const versionLabel = this.cloneForm.versionLabel.trim();
    if (!versionLabel || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(versionLabel) || versionLabel.length > 40) {
      this.cloneErrorMsg.set('Nhãn phiên bản (versionLabel) bắt buộc, tối đa 40 ký tự (VD: v2.1-draft).');
      return;
    }

    const title = this.cloneForm.title.trim();
    if (!title || title.length > 200) {
      this.cloneErrorMsg.set('Tiêu đề bản phát hành bắt buộc, tối đa 200 ký tự.');
      return;
    }
    if (this.cloneForm.releaseNotes.length > 10000) {
      this.cloneErrorMsg.set('Ghi chú phát hành tối đa 10000 ký tự.');
      return;
    }

    this.cloneSaving.set(true);
    this.cloneErrorMsg.set(null);
    this.cloneSuccessMsg.set(null);

    const payload: CloneReleasePayload = {
      sourceVersion: source.version,
      versionLabel,
      title,
      releaseNotes: this.cloneForm.releaseNotes ? this.cloneForm.releaseNotes.trim() : null,
    };

    this.adminApi.cloneRelease(source.id, payload).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (newRelease) => {
        this.cloneSaving.set(false);
        this.releases.update(list => [newRelease, ...list]);
        this.selectRelease(newRelease);
        this.cardSuccessMsg.set(`Đã nhân bản sang bản nháp ${newRelease.versionLabel}. Bạn có thể thêm thẻ mới.`);
        this.cloneSuccessMsg.set(`Đã nhân bản thành công sang bản thảo mới: ${newRelease.versionLabel}`);
      },
      error: (err: AdminProblemDetail) => {
        this.cloneSaving.set(false);
        if (err.status === 409 || err.code === 'VERSION_CONFLICT') {
          this.cloneErrorMsg.set('Xung đột phiên bản nguồn (409): Bản phát hành nguồn đã thay đổi. Vui lòng tải lại dữ liệu.');
        } else {
          this.cloneErrorMsg.set(err.detail || err.title || 'Nhân bản bản phát hành thất bại.');
        }
      },
    });
  }

  setWikiTab(tab: 'ALL' | 'STORY' | 'RULE' | 'GUIDE' | 'FAQ' | 'DEVLOG'): void {
    this.activeWikiTab.set(tab);
  }

  private handleApiError(err: AdminProblemDetail | any): void {
    this.loading.set(false);
    if (err?.code === 'SESSION_EXPIRED' || err?.status === 401) {
      this.isSessionExpired.set(true);
      this.errorMsg.set('Phiên làm việc quản trị viên của bạn đã hết hạn (30 phút). Vui lòng đăng nhập lại.');
    } else if (err?.status === 403) {
      this.errorMsg.set('Từ chối quyền truy cập: Bạn không có quyền ADMIN hoặc thiếu chữ ký bảo mật CSRF.');
    } else if (err?.code === 'VERSION_CONFLICT' || err?.status === 409) {
      this.errorMsg.set('Xung đột phiên bản: Bản phát hành đã được chỉnh sửa bởi quản trị viên khác. Vui lòng tải lại dữ liệu.');
    } else {
      this.errorMsg.set(err?.detail || 'Không thể kết nối đến máy chủ quản trị viên (Backend ngoại tuyến).');
    }
  }
}
