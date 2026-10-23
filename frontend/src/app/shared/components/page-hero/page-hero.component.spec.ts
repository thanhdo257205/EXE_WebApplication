import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { PageHeroComponent } from './page-hero.component';

@Component({
  imports: [PageHeroComponent],
  template: `<app-page-hero heading="Tủ thẻ" eyebrow="Thư viện thẻ" tone="pink" description="Mô tả" [backLink]="back()"><p class="extra">meta</p></app-page-hero>`,
})
class Host { readonly back = signal<string | null>('/'); }

describe('Đầu trang con', () => {
  it('hiện tiêu đề, nhãn, mô tả, nội dung chèn và màu khu vực', async () => {
    await TestBed.configureTestingModule({ imports: [Host], providers: [provideRouter([])] }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement, hero = el.querySelector('app-page-hero') as HTMLElement;
    expect(hero.querySelector('h1')?.textContent).toContain('Tủ thẻ');
    expect(hero.querySelector('.eyebrow')?.textContent).toContain('Thư viện thẻ');
    expect(hero.querySelector('.ph-lead')?.textContent).toContain('Mô tả');
    expect(hero.querySelector('.extra')).toBeTruthy();
    expect(hero.style.getPropertyValue('--tone')).toBe('#ffacc9');
    expect(hero.querySelectorAll('.ph-card').length).toBe(3);
    expect(hero.querySelector('a.ph-back')?.getAttribute('href')).toBe('/');
    fixture.componentInstance.back.set(null); fixture.detectChanges();
    expect(hero.querySelector('a.ph-back')).toBeNull();
  });
});
