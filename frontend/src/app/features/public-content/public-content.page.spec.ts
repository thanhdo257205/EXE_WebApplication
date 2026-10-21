import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicContentPage } from './public-content.page';
import { PublicContentService } from '../../core/content/public-content.service';
import {
  SAMPLE_CARD,
  SAMPLE_CARDS,
  SAMPLE_CARD_SET,
  findSampleCard,
} from '../../core/content/default-card';

describe('Card catalog', () => {
  const service = { list: vi.fn(), detail: vi.fn() };
  const release = { id: 'release-1', title: 'Published', versionLabel: 'v1' };
  const listing = (items: unknown[], page = 0, totalPages = 1) =>
    of({ release, items, page, totalPages, totalElements: items.length, source: 'api' });
  const paramMap$ = new BehaviorSubject(convertToParamMap({}));
  let snapshotParams = convertToParamMap({});

  beforeEach(async () => {
    service.list.mockReset();
    service.detail.mockReset();
    paramMap$.next(convertToParamMap({}));
    snapshotParams = convertToParamMap({});
    await TestBed.configureTestingModule({
      imports: [PublicContentPage],
      providers: [
        { provide: PublicContentService, useValue: service },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: paramMap$.asObservable(),
            get snapshot() {
              return { paramMap: snapshotParams };
            },
          },
        },
      ],
    })
      .overrideComponent(PublicContentPage, { set: { template: '' } })
      .compileComponents();
  });

  it('opens the explicit sample without requesting unpublished content and defaults missing slug to original sample', () => {
    const fixture = TestBed.createComponent(PublicContentPage);
    fixture.componentRef.setInput('sample', true);
    fixture.detectChanges();
    expect(fixture.componentInstance.selected()).toEqual(SAMPLE_CARD);
    expect(fixture.componentInstance.demo()).toBe(true);
    expect(service.list).not.toHaveBeenCalled();
    expect(service.detail).not.toHaveBeenCalled();
  });

  it('updates selected sample when navigating between sample slugs and handles unknown slug without calling API', () => {
    const fixture = TestBed.createComponent(PublicContentPage);
    fixture.componentRef.setInput('sample', true);
    fixture.detectChanges();
    const page = fixture.componentInstance;

    // Navigate to a valid sample slug: charizard-3d
    paramMap$.next(convertToParamMap({ slug: 'charizard-3d' }));
    snapshotParams = convertToParamMap({ slug: 'charizard-3d' });
    fixture.detectChanges();

    const charizard = findSampleCard('charizard-3d');
    expect(charizard).toBeDefined();
    expect(page.selected()).toEqual(charizard);
    expect(page.error()).toBe(false);
    expect(page.unavailable()).toBe(false);
    expect(service.list).not.toHaveBeenCalled();
    expect(service.detail).not.toHaveBeenCalled();

    // Navigate to unknown sample slug
    paramMap$.next(convertToParamMap({ slug: 'non-existent-sample' }));
    snapshotParams = convertToParamMap({ slug: 'non-existent-sample' });
    fixture.detectChanges();

    expect(page.selected()).toBeNull();
    expect(page.error()).toBe(true);
    expect(page.unavailable()).toBe(true);
    expect(service.list).not.toHaveBeenCalled();
    expect(service.detail).not.toHaveBeenCalled();

    // Retry on sample stays local
    page.retry();
    expect(page.selected()).toBeNull();
    expect(page.error()).toBe(true);
    expect(service.list).not.toHaveBeenCalled();
    expect(service.detail).not.toHaveBeenCalled();

    // Retry after resetting to valid slug
    snapshotParams = convertToParamMap({ slug: 'pikachu-3d' });
    paramMap$.next(convertToParamMap({ slug: 'pikachu-3d' }));
    fixture.detectChanges();
    const pikachu = findSampleCard('pikachu-3d');
    expect(page.selected()).toEqual(pikachu);
    expect(page.error()).toBe(false);
    expect(service.list).not.toHaveBeenCalled();
    expect(service.detail).not.toHaveBeenCalled();
  });

  it('labels fallback cards as 11 samples, searches specific Pokémon locally, and builds sample links', () => {
    service.list.mockReturnValue(throwError(() => ({ status: 503 })));
    const fixture = TestBed.createComponent(PublicContentPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    expect(page.demo()).toBe(true);
    expect(page.cardSets()).toEqual([SAMPLE_CARD_SET]);
    expect(page.items().length).toBe(11);
    expect(page.total()).toBe(11);

    // Links for each sample
    expect(page.itemLink(SAMPLE_CARD)).toEqual(['/thu-vien/mau', 'pokemon-card-3d']);
    const charizard = findSampleCard('charizard-3d')!;
    expect(page.itemLink(charizard)).toEqual(['/thu-vien/mau', 'charizard-3d']);

    // Texture helper returns frontTextureUrl for sample cards
    expect(page.sampleTexture(charizard)).toBe('/assets/cards/pokemon/charizard.webp');
    expect(page.sampleTexture(SAMPLE_CARD)).toBeUndefined();

    // Thẻ linh vật có route, texture và tìm kiếm riêng
    const mascot = findSampleCard('linh-vat-hoang-nam')!;
    expect(mascot.name).toBe('Linh Vật Hoàng Nam');
    expect(page.itemLink(mascot)).toEqual(['/thu-vien/mau', 'linh-vat-hoang-nam']);
    expect(page.sampleTexture(mascot)).toBe('/assets/cards/linh-vat-hoang-nam.webp');

    // Search specific Pokémon: Pikachu
    page.query.set('pikachu');
    service.list.mockReturnValue(throwError(() => ({ status: 503 })));
    page.setCardSet(SAMPLE_CARD_SET.id);
    expect(page.items().length).toBe(1);
    expect(page.itemName(page.items()[0])).toContain('Pikachu');
    expect(page.total()).toBe(1);

    // Search non-matching term
    page.query.set('không khớp');
    page.setCardSet(SAMPLE_CARD_SET.id);
    expect(page.items()).toEqual([]);
    expect(page.total()).toBe(0);
    expect(service.list).toHaveBeenCalledOnce();
  });

  it('paginates card sets and pins the selected set to the published release without injecting samples', () => {
    service.list.mockImplementation((kind: string, _query: string, page: number) =>
      kind === 'card-sets'
        ? listing([{ ...SAMPLE_CARD_SET, id: `set-${page}` }], page, 2)
        : listing([SAMPLE_CARD]),
    );
    const fixture = TestBed.createComponent(PublicContentPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.loadMoreSets();
    expect(page.cardSets().map((set) => set.id)).toEqual(['set-0', 'set-1']);
    page.setCardSet('set-1');
    expect(service.list).toHaveBeenLastCalledWith('cards', '', 0, 'release-1', undefined, 'set-1');
    expect(page.demo()).toBe(false);
    expect(page.items().length).toBe(1);

    service.list.mockReturnValue(throwError(() => ({ status: 503 })));
    page.setCardSet('set-0');
    expect(page.error()).toBe(true);
    expect(page.demo()).toBe(false);
  });

  it('preserves real 404 behavior on generic route and never hides API error or injects samples', () => {
    service.detail.mockReturnValue(throwError(() => ({ status: 404 })));
    snapshotParams = convertToParamMap({ slug: 'non-existent-card' });
    paramMap$.next(convertToParamMap({ slug: 'non-existent-card' }));

    const fixture = TestBed.createComponent(PublicContentPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;

    expect(service.detail).toHaveBeenCalledWith('cards', 'non-existent-card', undefined);
    expect(page.selected()).toBeNull();
    expect(page.error()).toBe(true);
    expect(page.unavailable()).toBe(true);
    expect(page.demo()).toBe(false);
  });

  it('keeps published cards on real routes even when their slug matches a sample', () => {
    const real = { ...SAMPLE_CARD, id: 'real-card', slug: 'charizard-3d' };
    service.list.mockImplementation((kind: string) => kind === 'card-sets' ? listing([]) : listing([real]));
    const fixture = TestBed.createComponent(PublicContentPage); fixture.detectChanges();
    const page = fixture.componentInstance;
    expect(page.demo()).toBe(false);
    expect(page.itemLink(real)).toEqual(['/thu-vien', 'charizard-3d']);
    expect(page.sampleTexture(real)).toBeUndefined();
  });
});
