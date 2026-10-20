import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { App } from './app';

@Component({ standalone: true, template: '<div>Admin Mock</div>' })
class AdminMockComponent {}

describe('App shell', () => {
  it('exposes navigation and a main content landmark on public routes', async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('main#main')).toBeTruthy();
    expect(element.querySelector('a[href="/thu-vien"]')).toBeTruthy();
    fixture.componentInstance.toggleMobileMenu(); fixture.detectChanges();
    expect(element.querySelector('#public-mobile-menu a[href="/chinh-sach-quyen-rieng-tu"]')).toBeTruthy();
    expect(element.querySelector('#public-mobile-menu a[href="/dieu-khoan-su-dung"]')).toBeTruthy();
  });

  it('hides public wiki rail and activates admin layout mode when on admin routes', async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([{ path: 'admin', component: AdminMockComponent }]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    await router.navigateByUrl('/admin');
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.isAdminRoute()).toBe(true);
    expect(element.querySelector('app-wiki-rail')).toBeNull();
    expect(element.querySelector('app-global-bar')).toBeNull();
    expect(element.querySelector('main#main')?.classList.contains('admin-main')).toBe(true);
  });
});
