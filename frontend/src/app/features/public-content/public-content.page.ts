import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, input, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, catchError, debounceTime, distinctUntilChanged, map, of, Subject, switchMap, tap } from 'rxjs';
import { PublicCard, PublicCharacter, PublicContentResult, PublicContentService, PublicItem, PublicRelease, PublicWikiPage, WikiType, ContentKind, renderPublicMarkdown } from '../../core/content/public-content.service';
import { RiseHeadingDirective } from '../../shared/motion/rise-heading.directive';

@Component({
  selector: 'app-public-content-page',
  imports: [RouterLink, RiseHeadingDirective],
  templateUrl: './public-content.page.html',
  styleUrls: ['./public-content.page.css', './public-content.detail.css'],
})
export class PublicContentPage implements OnInit {
  readonly kind = input<ContentKind>('cards');
  readonly heading = input('Nội dung căn nhà');
  readonly description = input('Tra cứu nội dung đã xuất bản.');
  readonly slug = input<string | undefined>();
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
    { value: '', label: 'Tất cả' }, { value: 'RULE', label: 'Luật chơi' },
    { value: 'GUIDE', label: 'Hướng dẫn' }, { value: 'FAQ', label: 'Hỏi đáp' },
    { value: 'STORY', label: 'Câu chuyện' }, { value: 'DEVLOG', label: 'Nhật ký phát triển' },
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

    this.searchChanges.pipe(
      debounceTime(240),
      tap(() => this.page.set(0)),
      switchMap(() => this.requestList()),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(result => this.applyListResult(result));

    this.detailChanges.pipe(
      switchMap(slug => this.requestDetail(slug)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(state => this.applyDetailResult(state));

    this.refreshChanges.pipe(
      switchMap(() => this.requestList()),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(result => this.applyListResult(result));

    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
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
    this.error.set(false);
    this.unavailable.set(false);
    this.refreshChanges.next();
  }

  isCard(item: PublicItem): item is PublicCard { return 'effectText' in item; }
  isWiki(item: PublicItem): item is PublicWikiPage { return 'bodyMarkdown' in item; }
  isCharacter(item: PublicItem): item is PublicCharacter { return 'biography' in item; }
  itemName(item: PublicItem): string { return 'title' in item ? item.title : item.name; }
  itemLink(item: PublicItem): string[] { return [this.kind() === 'wiki-pages' ? '/wiki' : this.kind() === 'characters' ? '/cu-dan' : '/thu-vien', item.slug]; }
  renderMarkdown(markdown: string): string { return renderPublicMarkdown(markdown); }
  wikiLabel(type: PublicWikiPage['pageType']): string {
    return this.wikiTypes.find(item => item.value === type)?.label ?? 'Bài viết';
  }

  private loadList(): void {
    this.refreshChanges.next();
  }

  private requestList() {
    this.loading.set(true);
    this.error.set(false);
    this.unavailable.set(false);
    return this.service.list(this.kind(), this.query(), this.page(), this.pinnedRelease, this.filter() || undefined).pipe(
      map(result => ({ result, failure: null as HttpErrorResponse | null })),
      catchError(error => of({ result: null, failure: error as HttpErrorResponse })),
    );
  }

  private applyListResult(state: { result: PublicContentResult | null; failure: HttpErrorResponse | null }): void {
    this.loading.set(false);
    if (state.failure || !state.result) {
      this.items.set([]);
      this.total.set(0);
      this.error.set(true);
      this.unavailable.set(state.failure?.status === 404);
      return;
    }
    this.pinnedRelease ??= state.result.release.id;
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
      map(result => ({ result, failure: null as HttpErrorResponse | null })),
      catchError(error => of({ result: null, failure: error as HttpErrorResponse })),
    );
  }

  private applyDetailResult(state: { result: { release: PublicRelease; item: PublicItem; source: 'api' | 'snapshot' } | null; failure: HttpErrorResponse | null }): void {
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
