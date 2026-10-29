import { describe, expect, it } from 'vitest';
import { assistantSuggestionSet } from './assistant-suggestions';

describe('assistantSuggestionSet', () => {
  it('maps every public top-level route to its own page label and questions', () => {
    const pages = ['/', '/wiki', '/thu-vien', '/cu-dan', '/quy-nha', '/san-dau', '/cua-hang', '/gio-hang', '/cach-choi', '/cau-chuyen'];
    const labels = pages.map(url => assistantSuggestionSet(url).page);
    expect(new Set(labels).size).toBe(pages.length);
    for (const url of pages) {
      const set = assistantSuggestionSet(url);
      expect(set.questions.length).toBeGreaterThanOrEqual(3);
      expect(new Set(set.questions).size).toBe(set.questions.length);
    }
  });

  it('keeps detail pages and query strings on their section set', () => {
    expect(assistantSuggestionSet('/wiki/luat-co-ban?ref=home').page).toBe('Wiki luật');
    expect(assistantSuggestionSet('/thu-vien/mau/the-mau#top').page).toBe('Thư viện thẻ');
    expect(assistantSuggestionSet('/cu-dan/cu-dan-mau/').page).toBe('Cư dân');
    expect(assistantSuggestionSet('/tro-ly').page).toBe('Nhà Này Hơi Báo!');
  });

  it('falls back to brand questions for unknown routes and empty urls', () => {
    expect(assistantSuggestionSet('/khong-ton-tai').page).toBe('Nhà Này Hơi Báo!');
    expect(assistantSuggestionSet('').page).toBe('Trang chủ');
    expect(assistantSuggestionSet('?x=1').page).toBe('Trang chủ');
  });
});
