import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { PublicContentService, PublicSnapshot, PublicWikiPage, renderPublicMarkdown } from './public-content.service';

const release = { id: 'release-1', versionLabel: 'v1', title: 'Release test', publishedAt: '2026-10-20T00:00:00Z', version: 1 };
const wiki = (slug: string, title: string, pageType: PublicWikiPage['pageType'] = 'RULE'): PublicWikiPage => ({
  id: slug, slug, sortOrder: 0, pageType, title, summary: null, bodyMarkdown: 'Text', ruleStatus: 'CONFIRMED',
});

function snapshot(pages: PublicWikiPage[] = []): PublicSnapshot {
  return { schemaVersion: 1, release, content: { cards: [], 'wiki-pages': pages, characters: [], 'card-sets': [] } };
}

describe('PublicContentService', () => {
  let service: PublicContentService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(PublicContentService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('requests a public page with query, pinned release and wiki filter', () => {
    service.list('wiki-pages', 'luat', 2, 'release-1', 'RULE').subscribe(result => {
      expect(result.source).toBe('api');
      expect(result.release.id).toBe('release-1');
      expect(result.page).toBe(2);
    });

    const request = http.expectOne(request => request.url === '/api/v1/content/wiki-pages');
    expect(request.request.params.get('q')).toBe('luat');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('size')).toBe('24');
    expect(request.request.params.get('releaseId')).toBe('release-1');
    expect(request.request.params.get('pageType')).toBe('RULE');
    request.flush({ release, result: { items: [], page: 2, size: 24, totalElements: 0, totalPages: 0 } });
  });

  it('falls back to a schema-checked snapshot and filters Vietnamese text locally', () => {
    let actual = 0;
    service.list('wiki-pages', 'luat', 0, undefined, 'RULE').subscribe(result => {
      actual = result.items.length;
      expect(result.source).toBe('snapshot');
      expect(result.items[0].slug).toBe('quy-tac');
    });

    http.expectOne(request => request.url === '/api/v1/content/wiki-pages').flush({}, { status: 503, statusText: 'Unavailable' });
    http.expectOne('/content/snapshot.json').flush(snapshot([
      wiki('quy-tac', 'Luật chung'),
      wiki('cau-chuyen', 'Chuyện trong nhà', 'STORY'),
    ]));
    expect(actual).toBe(1);
  });

  it('paginates snapshot results in groups of 24', () => {
    let actual = 0;
    service.list('wiki-pages', '', 1).subscribe(result => {
      actual = result.items.length;
      expect(result.totalElements).toBe(25);
      expect(result.totalPages).toBe(2);
      expect(result.items[0].slug).toBe('page-24');
    });
    http.expectOne(request => request.url === '/api/v1/content/wiki-pages').flush({}, { status: 503, statusText: 'Unavailable' });
    http.expectOne('/content/snapshot.json').flush(snapshot(Array.from({ length: 25 }, (_, i) => wiki(`page-${i}`, `Bài ${i}`))));
    expect(actual).toBe(1);
  });

  it('preserves the API failure when no snapshot is available', () => {
    let status = 0;
    service.list('cards', '', 0).subscribe({ error: error => status = error.status });
    http.expectOne(request => request.url === '/api/v1/content/cards').flush({}, { status: 503, statusText: 'Unavailable' });
    http.expectOne('/content/snapshot.json').flush({}, { status: 404, statusText: 'Not Found' });
    expect(status).toBe(503);
  });

  it('escapes raw HTML while formatting basic public Markdown', () => {
    const html = renderPublicMarkdown('## An toàn\n\n<script>alert(1)</script> **luật rõ ràng**');
    expect(html).toContain('<h3>An toàn</h3>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('<strong>luật rõ ràng</strong>');
    expect(html).not.toContain('<script>');
  });
});
