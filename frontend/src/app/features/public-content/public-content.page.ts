import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, input, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, map, merge, of, Subject, switchMap, tap } from 'rxjs';
import {
  PublicCard,
  PublicCardSet,
  normalizeSearch,
  PublicCharacter,
  PublicContentResult,
  PublicContentService,
  PublicItem,
  PublicRelease,
  PublicWikiPage,
  WikiType,
  ContentKind,
  renderPublicMarkdown,
} from '../../core/content/public-content.service';
import { CardViewerComponent } from '../../shared/components/card-viewer/card-viewer.component';
import { DEFAULT_CARD_POSTER, SAMPLE_CARD, SAMPLE_CARD_SET } from '../../core/content/default-card';
import { RiseHeadingDirective } from '../../shared/motion/rise-heading.directive';

@Component({
  selector: 'app-public-content-page',
  imports: [RouterLink, RiseHeadingDirective, CardViewerComponent],
  templateUrl: './public-content.page.html',
  styleUrls: [
    './public-content.page.css',
    './public-content.detail.css',
    './public-content.cards.css',
  ],
})
export class PublicContentPage implements OnInit {
  readonly kind = input<ContentKind>('cards');
  readonly heading = input('Nội dung căn nhà');
  readonly description = input('Tra cứu nội dung đã xuất bản.');
  readonly slug = input<string | undefined>();
  readonly sample = input(false);
  readonly poster = DEFAULT_CARD_POSTER;
  readonly demo = signal(false);
  readonly cardSets = signal<PublicCardSet[]>([]);
  readonly selectedSet = signal('');
  readonly setsLoading = signal(false);
  readonly setsError = signal(false);
  readonly setsPage = signal(-1);
  readonly setsPages = signal(0);
  readonly query = signal('');
  readonly page = signal(0);
  readonly filter = signal<WikiType | ''>('');
  readonly items = signal<PublicItem[]>([]);
  readonly selected = signal<PublicItem | null>(null);
  readonly releaseLabel = signal('');
  readonly total = signal(0);
  readonly totalPages = signal(0);
  readonly source = signal<'api' | 'snapshot' | null>(null);
  readonly loading = signal(true);
  readonly unavailable = signal(false);
  readonly error = signal(false);
  readonly wikiTypes: { value: WikiType | ''; label: string }[] = [
    { value: '', label: 'Tất cả' },
    { value: 'RULE', label: 'Luật chơi' },
    { value: 'GUIDE', label: 'Hướng dẫn' },
    { value: 'FAQ', label: 'Hỏi đáp' },
    { value: 'STORY', label: 'Câu chuyện' },
    { value: 'DEVLOG', label: 'Nhật ký phát triển' },
  ];

  private readonly service = inject(PublicContentService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly searchChanges = new Subject<void>();
  private readonly refreshChanges = new Subject<void>();
  private readonly detailChanges = new Subject<string>();
  private pinnedRelease?: string;

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.sample()) {
      this.demo.set(true);
      this.selected.set(SAMPLE_CARD);
      this.loading.set(false);
      return;
    }

    merge(
      this.refreshChanges,
      this.searchChanges.pipe(
        debounceTime(240),
        tap(() => this.page.set(0)),
      ),
    )
      .pipe(
        switchMap(() => this.requestList()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => this.applyListResult(result));

    this.detailChanges
      .pipe(
        switchMap((slug) => this.requestDetail(slug)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((state) => this.applyDetailResult(state));

    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      if (params.has('slug')) {
        this.selected.set(null);
        this.detailChanges.next(params.get('slug')!);
      } else {
        this.selected.set(null);
        this.loadList();
      }
    });
  }

  onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.searchChanges.next();
  }

  setFilter(value: WikiType | ''): void {
    this.filter.set(value);
    this.page.set(0);
    this.refreshChanges.next();
  }

  changePage(delta: number): void {
    const next = this.page() + delta;
    if (next < 0 || next >= this.totalPages()) return;
    this.page.set(next);
    this.refreshChanges.next();
  }

  retry(): void {
    this.demo.set(false);
    if (this.selectedSet() === SAMPLE_CARD_SET.id) this.selectedSet.set('');
    this.error.set(false);
    this.unavailable.set(false);
    const slug = this.route.snapshot.paramMap.get('slug');
    if (slug) this.detailChanges.next(slug);
    else this.refreshChanges.next();
  }

  setCardSet(id: string): void {
    this.selectedSet.set(id);
    this.page.set(0);
    this.refreshChanges.next();
  }

  loadMoreSets(): void {
    if (
      this.setsLoading() ||
      !this.pinnedRelease ||
      (this.setsPage() + 1 >= this.setsPages() && this.setsPage() >= 0)
    )
      return;
    this.setsLoading.set(true);
    this.setsError.set(false);
    this.service
      .list('card-sets', '', this.setsPage() + 1, this.pinnedRelease)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.cardSets.update((sets) => [...sets, ...(result.items as PublicCardSet[])]);
          this.setsPage.set(result.page);
          this.setsPages.set(result.totalPages);
          this.setsLoading.set(false);
        },
        error: () => {
          this.setsError.set(true);
          this.setsLoading.set(false);
        },
      });
  }

  imageFallback(event: Event): void {
    const image = event.target as HTMLImageElement;
    if (image.getAttribute('src') !== this.poster) image.src = this.poster;
  }

  isCard(item: PublicItem): item is PublicCard {
    return 'effectText' in item;
  }
  isWiki(item: PublicItem): item is PublicWikiPage {
    return 'bodyMarkdown' in item;
  }
  isCharacter(item: PublicItem): item is PublicCharacter {
    return 'biography' in item;
  }
  itemName(item: PublicItem): string {
    return 'title' in item ? item.title : item.name;
  }
  itemLink(item: PublicItem): string[] {
    if (item.id === SAMPLE_CARD.id) return ['/thu-vien/mau/pokemon-card-3d'];
    return [
      this.kind() === 'wiki-pages'
        ? '/wiki'
        : this.kind() === 'characters'
          ? '/cu-dan'
          : '/thu-vien',
      item.slug,
    ];
  }
  renderMarkdown(markdown: string): string {
    return renderPublicMarkdown(markdown);
  }
  wikiLabel(type: PublicWikiPage['pageType']): string {
    return this.wikiTypes.find((item) => item.value === type)?.label ?? 'Bài viết';
  }

  private loadList(): void {
    this.refreshChanges.next();
  }

  private requestList() {
    this.loading.set(true);
    this.error.set(false);
    this.unavailable.set(false);
    if (this.demo()) return of({ result: null, failure: new HttpErrorResponse({ status: 404 }) });
    return this.service
      .list(
        this.kind(),
        this.query(),
        this.page(),
        this.pinnedRelease,
        this.filter() || undefined,
        this.selectedSet() || undefined,
      )
      .pipe(
        map((result) => ({ result, failure: null as HttpErrorResponse | null })),
        catchError((error) => of({ result: null, failure: error as HttpErrorResponse })),
      );
  }

  private applyListResult(state: {
    result: PublicContentResult | null;
    failure: HttpErrorResponse | null;
  }): void {
    this.loading.set(false);
    if (state.failure || !state.result) {
      if (this.kind() === 'cards' && !this.pinnedRelease) {
        this.demo.set(true);
        this.cardSets.set([SAMPLE_CARD_SET]);
        const matches =
          !this.query() ||
          normalizeSearch(`${SAMPLE_CARD.name} ${SAMPLE_CARD.code}`).includes(
            normalizeSearch(this.query()),
          );
        this.items.set(matches ? [SAMPLE_CARD] : []);
        this.total.set(matches ? 1 : 0);
        this.totalPages.set(matches ? 1 : 0);
        return;
      }
      this.items.set([]);
      this.total.set(0);
      this.error.set(true);
      this.unavailable.set(state.failure?.status === 404);
      return;
    }
    this.demo.set(false);
    this.pinnedRelease ??= state.result.release.id;
    if (this.kind() === 'cards' && this.setsPage() < 0 && !this.setsLoading()) {
      this.cardSets.set([]);
      this.loadMoreSets();
    }
    this.releaseLabel.set(`${state.result.release.title} · ${state.result.release.versionLabel}`);
    this.items.set(state.result.items);
    this.total.set(state.result.totalElements);
    this.totalPages.set(state.result.totalPages);
    this.page.set(state.result.page);
    this.source.set(state.result.source);
  }

  private requestDetail(slug: string) {
    this.loading.set(true);
    this.error.set(false);
    this.unavailable.set(false);
    return this.service.detail(this.kind(), slug, this.pinnedRelease).pipe(
      map((result) => ({ result, failure: null as HttpErrorResponse | null })),
      catchError((error) => of({ result: null, failure: error as HttpErrorResponse })),
    );
  }

  private applyDetailResult(state: {
    result: { release: PublicRelease; item: PublicItem; source: 'api' | 'snapshot' } | null;
    failure: HttpErrorResponse | null;
  }): void {
    this.loading.set(false);
    if (state.failure || !state.result) {
      this.selected.set(null);
      this.error.set(true);
      this.unavailable.set(state.failure?.status === 404);
      return;
    }
    this.pinnedRelease ??= state.result.release.id;
    this.releaseLabel.set(`${state.result.release.title} · ${state.result.release.versionLabel}`);
    this.selected.set(state.result.item);
    this.source.set(state.result.source);
  }
}
