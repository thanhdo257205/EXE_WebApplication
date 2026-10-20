import { afterNextRender, DestroyRef, Directive, ElementRef, inject, NgZone } from '@angular/core';
import type { ReactNode } from 'react';
import type { Root } from 'react-dom/client';

// Angular owns the original bound nodes; React owns only the aria-hidden visual layer.
@Directive({ selector: 'h1,h2,h3,h4,h5,h6' })
export class RiseHeadingDirective {
  private readonly heading = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);
  constructor() { afterNextRender(() => this.zone.runOutsideAngular(() => this.mount())); }
  private mount() {
    if (typeof matchMedia !== 'function' || typeof IntersectionObserver !== 'function') return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false, started = false, destroyed = false;
    const start = () => {
      if (destroyed || started || !visible || media.matches) return;
      started = true;
      intersection.disconnect();
      media.removeEventListener('change', start);
      void this.animate();
    };
    const intersection = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      start();
    }, { rootMargin: '100px 0px' });
    intersection.observe(this.heading);
    media.addEventListener('change', start);
    this.destroyRef.onDestroy(() => {
      destroyed = true;
      intersection.disconnect();
      media.removeEventListener('change', start);
    });
  }
  private async animate() {
    if (typeof matchMedia !== 'function' || typeof IntersectionObserver !== 'function') return;
    const heading = this.heading, media = matchMedia('(prefers-reduced-motion: reduce)');
    let destroyed = false, root: Root | undefined, observer: MutationObserver | undefined;
    let source: HTMLSpanElement | undefined, target: HTMLSpanElement | undefined;
    let update = () => {}, generation = 0, frozen = false;
    let finishTimer: ReturnType<typeof setTimeout> | undefined;
    let finishCurrent: (() => void) | undefined;
    const resumeFinish = () => { if (!document.hidden) finishCurrent?.(); };
    document.addEventListener('visibilitychange', resumeFinish);
    const preference = () => {
      if (frozen) {
        heading.classList.toggle('rise-active', !media.matches);
        if (media.matches) delete heading.dataset['riseState'];
        else heading.dataset['riseState'] = 'settled';
      } else update();
    };
    this.destroyRef.onDestroy(() => {
      destroyed = true; generation++; clearTimeout(finishTimer);
      document.removeEventListener('visibilitychange', resumeFinish);
      media.removeEventListener('change', preference); observer?.disconnect(); root?.unmount();
      delete heading.dataset['riseState'];
    });
    const modules = await Promise.all([
      import('react'), import('react-dom/client'), import('react-dom'), import('spring-text-engine'),
    ]).catch(() => null);
    if (destroyed || !modules) return;
    const [reactModule, clientModule, domModule, { default: TextEngine }] = modules;
    // React publishes CommonJS; Angular's unbundled dev server exposes its default.
    const interop = <T,>(module: T): T => (module as T & { default?: T }).default ?? module;
    const { createElement, Fragment } = interop(reactModule);
    const { createRoot } = interop(clientModule);
    const { flushSync } = interop(domModule);
    const toReact = (node: Node, key: number): ReactNode => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent?.replace(/\s+/g, ' ') ?? '';
      if (!(node instanceof HTMLElement)) return null;
      const textStyle = getComputedStyle(node);
      return createElement(node.tagName.toLowerCase(), {
        key, className: node.className || undefined,
        style: {
          fontFamily: textStyle.fontFamily, fontStyle: textStyle.fontStyle, fontWeight: textStyle.fontWeight,
          color: textStyle.color === getComputedStyle(node.parentElement!).color ? undefined : textStyle.color,
        },
      }, ...Array.from(node.childNodes).map(toReact));
    };
    update = () => {
      if (destroyed) return;
      const currentGeneration = ++generation;
      clearTimeout(finishTimer); finishCurrent = undefined;
      if (media.matches) {
        heading.classList.remove('rise-active');
        if (root) { root.unmount(); root = undefined; }
        target?.replaceChildren(); delete heading.dataset['riseState'];
        return;
      }
      if (!source) {
        source = document.createElement('span'); source.className = 'rise-source';
        while (heading.firstChild) source.appendChild(heading.firstChild);
        target = document.createElement('span'); target.className = 'rise-render'; target.setAttribute('aria-hidden', 'true');
        heading.append(source, target);
        observer = new MutationObserver(() => { frozen = false; update(); }); observer.observe(source, { subtree: true, characterData: true, childList: true });
      }
      if (!root) { target!.replaceChildren(); root = createRoot(target!); }
      heading.dataset['riseState'] = 'running';
      const align = getComputedStyle(heading).textAlign;
      const justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
      const lines: Node[][] = [[]];
      source.childNodes.forEach(node => {
        if (node instanceof HTMLBRElement) lines.push([]); else lines[lines.length - 1].push(node);
      });
      const completed = new Set<number>();
      const animatedLineCount = lines.filter(nodes => nodes.some(node => node.textContent?.trim())).length;
      const finish = () => {
        if (destroyed || currentGeneration !== generation || !root || document.hidden) return;
        // The engine's completion callback is time based; also wait for actual spring values.
        const unsettled = Array.from(target!.querySelectorAll<HTMLElement>('[style]')).some(node => {
          if (node.style.opacity && Number(node.style.opacity) < .999) return true;
          if (!node.style.transform || typeof DOMMatrixReadOnly !== 'function') return false;
          const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
          return Math.abs(matrix.m41) + Math.abs(matrix.m42) + Math.abs(matrix.m43) > .01;
        });
        if (unsettled) { finishTimer = setTimeout(finish, 100); return; }
        const still = Array.from(target!.childNodes, node => node.cloneNode(true));
        for (const node of still) {
          if (!(node instanceof HTMLElement)) continue;
          for (const element of [node, ...Array.from(node.querySelectorAll<HTMLElement>('[style]'))]) {
            element.style.removeProperty('transform');
            element.style.removeProperty('will-change');
          }
        }
        root.unmount(); root = undefined;
        target!.replaceChildren(...still);
        heading.dataset['riseState'] = 'settled'; frozen = true;
        finishCurrent = undefined;
      };
      const completedLine = (index: number, direction: 'in' | 'out') => {
        if (destroyed || currentGeneration !== generation || direction !== 'in') return;
        completed.add(index);
        if (completed.size >= animatedLineCount) {
          finishCurrent = finish;
          finishTimer = setTimeout(finish, 0);
        }
      };
      let offset = 0;
      const children = lines.map((nodes, index) => {
        const delayIn = offset * 30;
        offset += nodes.reduce((count, node) => count + (node.textContent ?? '').replace(/\s/g, '').length, 0);
        return createElement(TextEngine, {
          key: `${currentGeneration}:${index}:${nodes.map(node => node.textContent).join('')}`,
          tag: 'span', mode: 'once', overflow: true, seo: false,
          onTextFullyPlayed: (direction: 'in' | 'out') => completedLine(index, direction),
          letterOut: { opacity: 0, y: 24 }, letterIn: { opacity: 1, y: 0 },
          letterConfig: { tension: 220, friction: 22 }, letterStagger: 30, delayIn,
          className: justify === 'center' ? 'rise-line justify-center' : 'rise-line',
          style: { justifyContent: justify }, children: nodes.map(toReact),
        });
      });
      flushSync(() => root!.render(createElement(Fragment, null, ...children)));
      heading.classList.add('rise-active');
      if (!animatedLineCount) { finishCurrent = finish; finishTimer = setTimeout(finish, 0); }
    };
    media.addEventListener('change', preference); update();
  }
}
