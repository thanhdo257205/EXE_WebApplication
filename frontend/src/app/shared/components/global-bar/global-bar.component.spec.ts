import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalBarComponent } from './global-bar.component';
import { AuthService } from '../../../core/auth/auth.service';
import { routes } from '../../../app.routes';

@Component({ template: '' })
class RouteStub {}

describe('Public navigation disclosures', () => {
  let fixture: ComponentFixture<GlobalBarComponent>;
  const element = () => fixture.nativeElement as HTMLElement;
  const toggle = () => element().querySelector<HTMLButtonElement>('.submenu-toggle')!;
  beforeEach(async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    await TestBed.configureTestingModule({
      imports: [GlobalBarComponent],
      providers: [provideRouter([{ path: 'chinh-sach-quyen-rieng-tu', component: RouteStub }]),
        { provide: AuthService, useValue: { currentUser: signal(null), loadCurrentUser: () => of(null) } }],
    }).compileComponents();
    fixture = TestBed.createComponent(GlobalBarComponent); fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); vi.unstubAllGlobals(); });
  it('opens existing child routes on hover without changing primary link destinations', () => {
    expect(element().querySelector('.nav-dropdown')).toBeNull();
    element().querySelector('[data-glass-item]')!.dispatchEvent(new MouseEvent('pointerenter'));
    fixture.detectChanges();
    expect(element().querySelector('.nav-dropdown a[href="/chinh-sach-quyen-rieng-tu"]')).toBeTruthy();
    expect(element().querySelector('.nav-dropdown a[href="/dieu-khoan-su-dung"]')).toBeTruthy();
    expect(element().querySelector('[data-nav-trigger="discover"]')?.getAttribute('href')).toBe('/');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    for (const group of fixture.componentInstance.navigation) {
      for (const child of group.children) expect(routes.some(route => '/' + route.path === child.path)).toBe(true);
    }
  });
  it('supports disclosure click, Escape with focus restoration and outside dismissal', () => {
    toggle().click(); fixture.detectChanges();
    element().querySelector<HTMLAnchorElement>('.nav-dropdown a')!.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); fixture.detectChanges();
    expect(element().querySelector('.nav-dropdown')).toBeNull();
    expect(document.activeElement).toBe(toggle());
    toggle().click(); fixture.detectChanges();
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); fixture.detectChanges();
    expect(fixture.componentInstance.openGroup()).toBeNull();
  });
  it('opens and focuses child links using ArrowDown and closes when focus leaves', async () => {
    const trigger = element().querySelector<HTMLAnchorElement>('[data-nav-trigger="discover"]')!;
    trigger.focus(); trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    fixture.detectChanges(); await new Promise(resolve => setTimeout(resolve, 10));
    expect(document.activeElement).toBe(element().querySelector('.nav-dropdown a'));
    element().querySelector<HTMLAnchorElement>('.brand')!.focus(); fixture.detectChanges();
    expect(fixture.componentInstance.openGroup()).toBeNull();
  });
  it('marks the parent of legal routes active and closes an open panel on navigation', async () => {
    toggle().click(); fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl('/chinh-sach-quyen-rieng-tu'); fixture.detectChanges();
    expect(fixture.componentInstance.openGroup()).toBeNull();
    expect(element().querySelector('.desktop-nav a.active')?.textContent?.trim()).toBe('Khám phá');
    expect(fixture.componentInstance.isActive(['/wiki'])).toBe(false);
  });
});
