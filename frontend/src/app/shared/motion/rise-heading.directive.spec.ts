import { Component, signal } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RiseHeadingDirective } from './rise-heading.directive';

const engine = vi.hoisted(() => ({ callbacks: [] as ((direction: 'in' | 'out') => void)[], unmounts: 0 }));
vi.mock('spring-text-engine', async () => {
  const { createElement, useEffect } = await import('react');
  return { default: (props: { children: import('react').ReactNode; onTextFullyPlayed: (direction: 'in' | 'out') => void }) => {
    engine.callbacks.push(props.onTextFullyPlayed);
    useEffect(() => () => { engine.unmounts++; }, []);
    return createElement('span', { className: 'engine-test', style: { opacity: 1 } }, props.children);
  } };
});
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
  const start = async () => {
    fixture = TestBed.createComponent(HeadingFixture); fixture.detectChanges();
    intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    await vi.waitFor(() => expect(heading().dataset['riseState']).toBe('running'));
  };
  beforeEach(async () => {
    engine.callbacks = []; engine.unmounts = 0; media = new Preference(); disconnect = vi.fn();
    vi.stubGlobal('matchMedia', () => media);
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { intersect = callback; }
      observe() {} disconnect = disconnect;
    });
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    await TestBed.configureTestingModule({ imports: [HeadingFixture] }).compileComponents();
  });
  afterEach(() => { fixture?.destroy(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it('keeps original text without starting the engine before visibility or with reduced motion', async () => {
    media.matches = true;
    fixture = TestBed.createComponent(HeadingFixture); fixture.detectChanges();
    intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(engine.callbacks).toHaveLength(0);
    expect(heading().textContent).toContain('First line');
    media.change(false);
    await vi.waitFor(() => expect(heading().dataset['riseState']).toBe('running'));
  });
  it('unmounts the engine only after all lines complete and retains the rendered text', async () => {
    await start();
    const callbacks = engine.callbacks.slice(-2);
    callbacks[0]('in'); await new Promise(resolve => setTimeout(resolve, 10));
    expect(engine.unmounts).toBe(0);
    callbacks[1]('in');
    await vi.waitFor(() => expect(heading().dataset['riseState']).toBe('settled'));
    expect(engine.unmounts).toBe(2);
    expect(heading().querySelector('.rise-render')?.textContent).toContain('First line');
    expect(heading().querySelector('.rise-render em')?.textContent).toBe('Second line');
    const callbackCount = engine.callbacks.length;
    media.change(true); media.change(false);
    expect(heading().dataset['riseState']).toBe('settled');
    expect(engine.callbacks.length).toBe(callbackCount);
    fixture.componentInstance.text.set('Updated title'); fixture.detectChanges();
    await vi.waitFor(() => expect(heading().dataset['riseState']).toBe('running'));
    expect(heading().querySelector('.rise-render')?.textContent).toContain('Updated title');
  });
  it('settles a title changed mid-animation without waiting on callbacks from the old text', async () => {
    await start(); const previous = engine.callbacks.slice(-2);
    fixture.componentInstance.text.set('Changed during entrance'); fixture.detectChanges();
    await vi.waitFor(() => expect(heading().querySelector('.rise-render')?.textContent).toContain('Changed during entrance'));
    previous.forEach(callback => callback('in'));
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(heading().dataset['riseState']).toBe('running');
    engine.callbacks.slice(-2).forEach(callback => callback('in'));
    await vi.waitFor(() => expect(heading().dataset['riseState']).toBe('settled'));
  });
  it('ignores stale completion callbacks after reduced motion and after route teardown', async () => {
    await start(); const callbacks = [...engine.callbacks];
    media.change(true);
    callbacks.forEach(callback => callback('in'));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(heading().classList.contains('rise-active')).toBe(false);
    expect(heading().querySelector('.rise-render')?.childNodes.length).toBe(0);
    fixture.destroy(); callbacks.forEach(callback => callback('in'));
    expect(disconnect).toHaveBeenCalled();
  });
});
