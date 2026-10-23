import { Component, signal } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RiseHeadingDirective, springCurve } from './rise-heading.directive';

/** Animation giả: test tự quyết định lúc nào hoàn tất. */
const anim = vi.hoisted(() => ({ created: [] as { finish: () => void; cancelled: boolean; options: KeyframeAnimationOptions }[] }));
class Preference extends EventTarget {
  matches = false;
  change(value: boolean) { this.matches = value; this.dispatchEvent(new Event('change')); }
}
@Component({ imports: [RiseHeadingDirective], template: '<h1>{{ text() }}<br><em>Second line</em></h1>' })
class HeadingFixture { text = signal('First line'); }

describe('Heading animation lifecycle', () => {
  let fixture: ComponentFixture<HeadingFixture>, media: Preference;
  let intersect: IntersectionObserverCallback;
  let disconnect: ReturnType<typeof vi.fn>;
  const heading = () => fixture.nativeElement.querySelector('h1') as HTMLElement;
  const finishAll = () => anim.created.forEach(a => a.finish());
  const start = async () => {
    fixture = TestBed.createComponent(HeadingFixture); fixture.detectChanges();
    intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    await vi.waitFor(() => expect(heading().dataset['riseState']).toBe('running'));
  };
  beforeEach(async () => {
    anim.created = []; media = new Preference(); disconnect = vi.fn();
    vi.stubGlobal('matchMedia', () => media);
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { intersect = callback; }
      observe() {} disconnect = disconnect;
    });
    Element.prototype.animate = function (_keyframes: unknown, options?: number | KeyframeAnimationOptions) {
      let resolve!: () => void, reject!: (e: unknown) => void;
      const finished = new Promise<void>((ok, fail) => { resolve = ok; reject = fail; });
      finished.catch(() => undefined);
      const record = { cancelled: false, options: options as KeyframeAnimationOptions, finish: () => resolve() };
      anim.created.push(record);
      return { finished, cancel: () => { record.cancelled = true; reject(new DOMException('aborted', 'AbortError')); } } as unknown as Animation;
    };
    await TestBed.configureTestingModule({ imports: [HeadingFixture] }).compileComponents();
  });
  afterEach(() => { fixture?.destroy(); vi.restoreAllMocks(); vi.unstubAllGlobals(); delete (Element.prototype as Partial<Element>).animate; });

  it('keeps original text without animating before visibility or with reduced motion', async () => {
    media.matches = true;
    fixture = TestBed.createComponent(HeadingFixture); fixture.detectChanges();
    intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(anim.created).toHaveLength(0);
    expect(heading().textContent).toContain('First line');
    media.change(false);
    await vi.waitFor(() => expect(heading().dataset['riseState']).toBe('running'));
  });

  it('animates each letter with a stagger, splits words/lines and keeps formatting, then settles', async () => {
    await start();
    const render = heading().querySelector('.rise-render')!;
    expect(render.getAttribute('aria-hidden')).toBe('true');
    expect(render.querySelectorAll('.rise-line')).toHaveLength(2);
    expect(render.querySelectorAll('.line-word')).toHaveLength(4);
    expect(render.querySelector('em')?.textContent).toBe('Secondline');
    expect(anim.created).toHaveLength('FirstlineSecondline'.length);
    expect(anim.created[3].options.delay).toBe(90);
    expect(heading().querySelector('.rise-source')?.textContent).toBe('First lineSecond line');
    finishAll();
    await vi.waitFor(() => expect(heading().dataset['riseState']).toBe('settled'));
    const count = anim.created.length;
    media.change(true); media.change(false);
    expect(heading().dataset['riseState']).toBe('settled');
    expect(anim.created.length).toBe(count);
    fixture.componentInstance.text.set('Updated title'); fixture.detectChanges();
    await vi.waitFor(() => expect(heading().dataset['riseState']).toBe('running'));
    expect(heading().querySelector('.rise-render')?.textContent).toContain('Updatedtitle');
  });

  it('settles a title changed mid-animation without waiting on the old animations', async () => {
    await start();
    const previous = [...anim.created];
    fixture.componentInstance.text.set('Changed during entrance'); fixture.detectChanges();
    await vi.waitFor(() => expect(heading().querySelector('.rise-render')?.textContent).toContain('Changedduringentrance'));
    expect(previous.every(a => a.cancelled)).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(heading().dataset['riseState']).toBe('running');
    anim.created.slice(previous.length).forEach(a => a.finish());
    await vi.waitFor(() => expect(heading().dataset['riseState']).toBe('settled'));
  });

  it('clears the visual layer on reduced motion and stops on teardown', async () => {
    await start();
    media.change(true);
    finishAll();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(heading().classList.contains('rise-active')).toBe(false);
    expect(heading().querySelector('.rise-render')?.childNodes.length).toBe(0);
    fixture.destroy();
    expect(disconnect).toHaveBeenCalled();
  });

  it('turns the 220/22 spring into a linear() curve that ends at 1 with a small overshoot', () => {
    const { easing, duration } = springCurve();
    const values = easing.slice(7, -1).split(', ').map(Number);
    expect(values[0]).toBe(0);
    expect(values.at(-1)).toBe(1);
    expect(Math.max(...values)).toBeGreaterThan(1);
    expect(Math.max(...values)).toBeLessThan(1.05);
    expect(duration).toBeGreaterThan(500);
    expect(duration).toBeLessThan(800);
  });
});
