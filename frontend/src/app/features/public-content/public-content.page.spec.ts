import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicContentPage } from './public-content.page';
import { PublicContentService } from '../../core/content/public-content.service';
import { SAMPLE_CARD, SAMPLE_CARD_SET } from '../../core/content/default-card';

describe('Card catalog', () => {
  const service = { list: vi.fn(), detail: vi.fn() };
  const release = { id: 'release-1', title: 'Published', versionLabel: 'v1' };
  const listing = (items: unknown[], page = 0, totalPages = 1) =>
    of({ release, items, page, totalPages, totalElements: items.length, source: 'api' });
  beforeEach(async () => {
    service.list.mockReset();
    service.detail.mockReset();
    await TestBed.configureTestingModule({
      imports: [PublicContentPage],
      providers: [
        { provide: PublicContentService, useValue: service },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({})),
            snapshot: { paramMap: convertToParamMap({}) },
          },
        },
      ],
    })
      .overrideComponent(PublicContentPage, { set: { template: '' } })
      .compileComponents();
  });
  it('opens the explicit sample without requesting unpublished content', () => {
    const fixture = TestBed.createComponent(PublicContentPage);
    fixture.componentRef.setInput('sample', true);
    fixture.detectChanges();
    expect(fixture.componentInstance.selected()).toEqual(SAMPLE_CARD);
    expect(fixture.componentInstance.demo()).toBe(true);
    expect(service.list).not.toHaveBeenCalled();
    expect(service.detail).not.toHaveBeenCalled();
  });
  it('labels fallback cards as samples and searches them locally', () => {
    service.list.mockReturnValue(throwError(() => ({ status: 503 })));
    const fixture = TestBed.createComponent(PublicContentPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    expect(page.demo()).toBe(true);
    expect(page.cardSets()).toEqual([SAMPLE_CARD_SET]);
    expect(page.itemLink(SAMPLE_CARD)).toEqual(['/thu-vien/mau/pokemon-card-3d']);
    page.query.set('không khớp');
    page.setCardSet(SAMPLE_CARD_SET.id);
    expect(page.items()).toEqual([]);
    expect(service.list).toHaveBeenCalledOnce();
  });
  it('paginates card sets and pins the selected set to the published release', () => {
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
    service.list.mockReturnValue(throwError(() => ({ status: 503 })));
    page.setCardSet('set-0');
    expect(page.error()).toBe(true);
    expect(page.demo()).toBe(false);
  });
});
