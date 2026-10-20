import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, switchMap, throwError, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';

export type ContentKind = 'cards' | 'wiki-pages' | 'characters' | 'card-sets';
export type WikiType = 'STORY' | 'RULE' | 'GUIDE' | 'FAQ' | 'DEVLOG';

export interface PublicRelease {
  id: string;
  versionLabel: string;
  title: string;
  publishedAt: string;
  version: number;
}

export interface PublicCard {
  id: string; slug: string; sortOrder: number; code: string; cardSetId: string;
  characterId: string | null; name: string; effectText: string; rulingNotes: string | null;
  ruleStatus: 'CONFIRMED' | 'NEEDS_REVIEW'; copiesInDeck: number; artworkUrl: string | null;
}

export interface PublicWikiPage {
  id: string; slug: string; sortOrder: number; pageType: WikiType; title: string;
  summary: string | null; bodyMarkdown: string; ruleStatus: 'CONFIRMED' | 'NEEDS_REVIEW';
}

export interface PublicCharacter {
  id: string; slug: string; sortOrder: number; code: string; name: string;
  biography: string; abilityText: string | null; portraitUrl: string | null;
}

export interface PublicCardSet {
  id: string; slug: string; sortOrder: number; code: string; name: string; description: string | null;
}

export type PublicItem = PublicCard | PublicWikiPage | PublicCharacter | PublicCardSet;
export interface PublicSnapshot {
  schemaVersion: 1;
  release: PublicRelease;
  content: {
    cards: PublicCard[];
    'wiki-pages': PublicWikiPage[];
    characters: PublicCharacter[];
    'card-sets': PublicCardSet[];
  };
}
export interface PublicListing<T extends PublicItem = PublicItem> {
  release: PublicRelease;
  result: { items: T[]; page: number; size: number; totalElements: number; totalPages: number };
}
export interface PublicContentResult<T extends PublicItem = PublicItem> {
  release: PublicRelease;
  items: T[];
  totalElements: number;
  page: number;
  totalPages: number;
  source: 'api' | 'snapshot';
}

const PAGE_SIZE = 24;

@Injectable({ providedIn: 'root' })
export class PublicContentService {
  private readonly http = inject(HttpClient);
  private readonly apiRoot = `${environment.apiBaseUrl ?? '/api'}/v1/content`;

  list(kind: ContentKind, query: string, page: number, releaseId?: string, pageType?: WikiType, cardSetId?: string): Observable<PublicContentResult> {
    let params = new HttpParams().set('q', query).set('page', page).set('size', PAGE_SIZE);
    if (releaseId) params = params.set('releaseId', releaseId);
    if (pageType) params = params.set('pageType', pageType);
    if (cardSetId) params = params.set('cardSetId', cardSetId);

    return this.http.get<PublicListing>(`${this.apiRoot}/${kind}`, { params }).pipe(
      timeout(8000),
      map(response => ({
        release: response.release,
        items: response.result.items,
        totalElements: response.result.totalElements,
        page: response.result.page,
        totalPages: response.result.totalPages,
        source: 'api' as const,
      })),
      catchError(apiError => this.fromSnapshot(kind, query, page, pageType, cardSetId, releaseId).pipe(
        catchError(() => throwError(() => apiError)),
      )),
    );
  }

  detail(kind: ContentKind, slug: string, releaseId?: string): Observable<{ release: PublicRelease; item: PublicItem; source: 'api' | 'snapshot' }> {
    let params = new HttpParams();
    if (releaseId) params = params.set('releaseId', releaseId);
    return this.http.get<{ release: PublicRelease; item: PublicItem }>(`${this.apiRoot}/${kind}/${encodeURIComponent(slug)}`, { params }).pipe(
      timeout(8000),
      map(response => ({ ...response, source: 'api' as const })),
      catchError(apiError => this.snapshot().pipe(
        map(snapshot => {
          if (releaseId && snapshot.release.id !== releaseId) throw new Error('Bản lưu không khớp bản phát hành đang xem.');
          const collection = snapshot.content[kind === 'wiki-pages' ? 'wiki-pages' : kind];
          const item = collection.find(entry => entry.slug === slug);
          if (!item) throw new Error('Không tìm thấy nội dung đã xuất bản.');
          return { release: snapshot.release, item, source: 'snapshot' as const };
        }),
        catchError(() => throwError(() => apiError)),
      )),
    );
  }

  private snapshot(): Observable<PublicSnapshot> {
    return this.http.get<PublicSnapshot>('/content/snapshot.json').pipe(
      timeout(8000),
      map(snapshot => {
        if (snapshot.schemaVersion !== 1 || !snapshot.release?.id ||
            !Array.isArray(snapshot.content?.cards) || !Array.isArray(snapshot.content?.['wiki-pages']) ||
            !Array.isArray(snapshot.content?.characters) || !Array.isArray(snapshot.content?.['card-sets'])) {
          throw new Error('Bản nội dung tĩnh không hợp lệ.');
        }
        return snapshot;
      }),
    );
  }

  private fromSnapshot(kind: ContentKind, query: string, page: number, pageType?: WikiType, cardSetId?: string, releaseId?: string): Observable<PublicContentResult> {
    return this.snapshot().pipe(
      map(snapshot => {
        if (releaseId && snapshot.release.id !== releaseId) throw new Error('Bản lưu không khớp bản phát hành đang xem.');
        const collection = snapshot.content[kind === 'wiki-pages' ? 'wiki-pages' : kind];
        const normalized = normalizeSearch(query);
        const filtered = collection.filter(item => {
          if (kind === 'cards' && cardSetId && (item as PublicCard).cardSetId !== cardSetId) return false;
          if (kind === 'wiki-pages' && pageType && (item as PublicWikiPage).pageType !== pageType) return false;
          const candidate = 'title' in item ? item.title : item.name;
          return !normalized || normalizeSearch(`${candidate} ${item.slug} ${'code' in item ? item.code : ''}`).includes(normalized);
        });
        const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
        return {
          release: snapshot.release,
          items: filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
          totalElements: filtered.length,
          page,
          totalPages,
          source: 'snapshot' as const,
        };
      }),
    );
  }
}

export function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').trim().toLowerCase();
}

export function renderPublicMarkdown(markdown: string): string {
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const inline = (value: string) => escape(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  const blocks = markdown.replace(/\r/g, '').split(/\n\s*\n/);
  return blocks.map(block => {
    const lines = block.split('\n');
    const heading = /^(#{1,3})\s+(.+)$/.exec(lines[0]);
    if (heading) {
      const level = heading[1].length + 1;
      return `<h${level}>${inline(heading[2])}</h${level}>`;
    }
    if (lines.every(line => /^\s*[-*]\s+/.test(line))) {
      return `<ul>${lines.map(line => `<li>${inline(line.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`;
    }
    if (lines.every(line => /^\s*\d+\.\s+/.test(line))) {
      return `<ol>${lines.map(line => `<li>${inline(line.replace(/^\s*\d+\.\s+/, ''))}</li>`).join('')}</ol>`;
    }
    if (lines.every(line => /^>\s?/.test(line))) {
      return `<blockquote>${lines.map(line => inline(line.replace(/^>\s?/, ''))).join('<br>')}</blockquote>`;
    }
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).filter(Boolean).join('');
}
