import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { StoryPage } from './story.page';

describe('Câu chuyện căn nhà', () => {
  it('giữ nguyên văn tiêu đề cho trình đọc màn hình, tách chữ để hiện dần và liệt kê ba hồi', async () => {
    await TestBed.configureTestingModule({ imports: [StoryPage], providers: [provideRouter([])] }).compileComponents();
    const fixture = TestBed.createComponent(StoryPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const h1 = el.querySelector('h1')!;
    expect(h1.querySelector('.sr')?.textContent).toBe('Sống chung khi chưa kịp giàu.');
    expect([...h1.querySelectorAll('.w')].every(w => w.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(h1.querySelectorAll('.w').length).toBe(6);
    expect([...el.querySelectorAll('.act h3 .sr')].map(h => h.textContent)).toEqual(['Lần đầu tập sống chung', 'Bão hóa đơn', 'Những tình huống dở khóc dở cười']);
    expect(el.querySelectorAll('.table .row:not(.th)').length).toBe(5);
    expect(el.querySelector('.bar a')?.getAttribute('href')).toBe('/quy-nha');
  });
});
