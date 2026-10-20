import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiquidGlassDirective } from './liquid-glass.directive';

class Preference extends EventTarget {
  constructor(public matches: boolean) { super(); }
  change(value: boolean) { this.matches = value; this.dispatchEvent(new Event('change')); }
}
@Component({ imports: [LiquidGlassDirective], template: '<nav appLiquidGlass><span data-glass-item><a class="active" href="/">Home</a><button type="button">Open</button></span><a href="/wiki">Wiki</a></nav>' })
class GlassFixture {}

describe('Liquid glass geometry and lens', () => {
  let fixture: ComponentFixture<GlassFixture>, nav: HTMLElement, links: HTMLElement[];
  let frames: Map<number, FrameRequestCallback>, nextId: number, left: number;
  let fine: Preference, reduced: Preference;
  const rect = (x: number, width: number) => ({ x, y: 10, left: x, top: 10, right: x + width, bottom: 60, width, height: 50, toJSON() {} });
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(16)); };
  const move = (target: HTMLElement, x: number) => target.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: 30, bubbles: true }));
  beforeEach(async () => {
    frames = new Map(); nextId = 0; left = 100;
    fine = new Preference(true); reduced = new Preference(false);
    vi.stubGlobal('matchMedia', (query: string) => query.includes('reduced') ? reduced : fine);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++nextId, callback); return nextId; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    await TestBed.configureTestingModule({ imports: [GlassFixture] }).compileComponents();
    fixture = TestBed.createComponent(GlassFixture); fixture.detectChanges();
    nav = fixture.nativeElement.querySelector('nav'); links = Array.from(nav.querySelectorAll('a'));
    vi.spyOn(nav, 'getBoundingClientRect').mockImplementation(() => rect(left, 400));
    links.forEach((link, index) => vi.spyOn(link, 'getBoundingClientRect').mockImplementation(() => rect(left + 5 + index * 120, 110)));
    flush();
  });
  afterEach(() => { fixture.destroy(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it('coalesces pointer bursts and reuses layout and lens attributes over the same link', () => {
    move(links[0], 130); flush();
    const navReads = vi.mocked(nav.getBoundingClientRect).mock.calls.length;
    const linkReads = vi.mocked(links[0].getBoundingClientRect).mock.calls.length;
    const attributes = vi.spyOn(links[0], 'setAttribute');
    move(nav.querySelector('button')!, 145); flush();
    expect(links[0].hasAttribute('data-glass-lens')).toBe(true);
    for (let i = 0; i < 30; i++) move(links[0], 140 + i);
    expect(frames.size).toBe(1); flush();
    move(links[0], 180); flush();
    expect(nav.getBoundingClientRect).toHaveBeenCalledTimes(navReads);
    expect(links[0].getBoundingClientRect).toHaveBeenCalledTimes(linkReads);
    expect(attributes.mock.calls.filter(([name]) => name === 'data-glass-lens')).toHaveLength(0);
    expect(nav.style.getPropertyValue('--glass-light-x')).toBe('80px');
    expect(frames.size).toBe(0);
  });
  it('invalidates cached measurements on scroll and resize', () => {
    move(links[1], 270); flush();
    const reads = vi.mocked(nav.getBoundingClientRect).mock.calls.length;
    left = 80; window.dispatchEvent(new Event('scroll')); flush();
    expect(nav.getBoundingClientRect).toHaveBeenCalledTimes(reads + 1);
    expect(nav.style.getPropertyValue('--glass-light-x')).toBe('190px');
    window.dispatchEvent(new Event('resize')); flush();
    expect(nav.getBoundingClientRect).toHaveBeenCalledTimes(reads + 2);
    expect(links[1].hasAttribute('data-glass-lens')).toBe(true);
  });
  it('keeps keyboard/reduced-motion lens selection and follows actual route changes', async () => {
    move(links[0], 130); flush();
    links[1].dispatchEvent(new FocusEvent('focusin', { bubbles: true })); flush();
    reduced.change(true); flush();
    expect(nav.querySelectorAll('[data-glass-lens]')).toHaveLength(1);
    expect(links[1].hasAttribute('data-glass-lens')).toBe(true);
    links[1].dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    links[0].classList.remove('active'); links[1].classList.add('active');
    await new Promise(resolve => setTimeout(resolve, 0)); flush();
    expect(links[1].hasAttribute('data-glass-lens')).toBe(true);
    links[1].classList.remove('active');
    await new Promise(resolve => setTimeout(resolve, 0)); flush();
    expect(nav.style.getPropertyValue('--lens-width')).toBe('0px');
    expect(nav.querySelector('[data-glass-lens]')).toBeNull();
  });
  it('cancels pending work and removes global listeners on teardown', () => {
    move(links[1], 270); expect(frames.size).toBe(1);
    fixture.destroy(); expect(frames.size).toBe(0);
    window.dispatchEvent(new Event('resize')); window.dispatchEvent(new Event('scroll')); reduced.change(true);
    expect(frames.size).toBe(0);
  });
});
