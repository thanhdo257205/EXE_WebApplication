import { afterNextRender, DestroyRef, Directive, ElementRef, inject, NgZone } from '@angular/core';

/** Lò xo tension 220 / friction 22 / mass 1 (thông số cũ của spring-text-engine), tính sẵn thành đường cong `linear()`. */
const TENSION = 220, FRICTION = 22, LETTER_STAGGER = 30, RISE_PX = 24;
export function springCurve(tension = TENSION, friction = FRICTION, samples = 48): { easing: string; duration: number } {
  const w0 = Math.sqrt(tension), zeta = friction / (2 * w0), wd = w0 * Math.sqrt(Math.max(1e-6, 1 - zeta * zeta)), decay = zeta * w0;
  const position = (t: number) => 1 - Math.exp(-decay * t) * (Math.cos(wd * t) + (decay / wd) * Math.sin(wd * t));
  const duration = Math.log(1000) / decay; // tới khi lệch < 0,1%
  const points = Array.from({ length: samples + 1 }, (_, i) => (i === samples ? 1 : position((duration * i) / samples)).toFixed(4));
  return { easing: `linear(${points.join(', ')})`, duration: Math.round(duration * 1000) };
}
let spring: { easing: string; duration: number } | null = null;
const springEasing = () => {
  if (spring) return spring;
  const curve = springCurve();
  const supported = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('animation-timing-function', 'linear(0, 1)');
  spring = supported ? curve : { easing: 'cubic-bezier(.2, 1.25, .35, 1)', duration: curve.duration };
  return spring;
};

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('vi', { granularity: 'grapheme' }) : null;
const graphemes = (word: string): string[] => (segmenter ? Array.from(segmenter.segment(word), part => part.segment) : Array.from(word));

/**
 * Chữ tiêu đề "trồi lên rồi lắng" từng ký tự. Angular giữ nút gốc (ẩn khỏi mắt nhưng còn cho trình đọc màn hình);
 * lớp hiển thị aria-hidden được dựng bằng DOM thuần và chạy Web Animations (transform/opacity trên compositor),
 * không cần React hay vòng rAF. Bỏ qua khi reduced motion; dựng lại khi nội dung tiêu đề đổi.
 */
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
      if (destroyed || started || !visible || media.matches || document.documentElement.dataset['boot'] === 'pending') return;
      started = true;
      intersection.disconnect();
      media.removeEventListener('change', start);
      window.removeEventListener('app-booted', start);
      this.animate(media);
    };
    const intersection = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      start();
    }, { rootMargin: '100px 0px' });
    intersection.observe(this.heading);
    media.addEventListener('change', start);
    window.addEventListener('app-booted', start);
    this.destroyRef.onDestroy(() => {
      destroyed = true;
      intersection.disconnect();
      media.removeEventListener('change', start);
      window.removeEventListener('app-booted', start);
    });
  }

  private animate(media: MediaQueryList) {
    const heading = this.heading;
    let destroyed = false, frozen = false, generation = 0;
    let source: HTMLSpanElement | undefined, target: HTMLSpanElement | undefined, observer: MutationObserver | undefined;
    let running: Animation[] = [];
    const stop = () => { running.forEach(animation => animation.cancel()); running = []; };

    const update = () => {
      if (destroyed) return;
      const current = ++generation;
      stop();
      if (media.matches) {
        heading.classList.remove('rise-active');
        target?.replaceChildren(); delete heading.dataset['riseState'];
        return;
      }
      if (!source) {
        source = document.createElement('span'); source.className = 'rise-source';
        while (heading.firstChild) source.appendChild(heading.firstChild);
        target = document.createElement('span'); target.className = 'rise-render'; target.setAttribute('aria-hidden', 'true');
        heading.append(source, target);
        observer = new MutationObserver(() => { frozen = false; update(); });
        observer.observe(source, { subtree: true, characterData: true, childList: true });
      }
      const align = getComputedStyle(heading).textAlign;
      const justify = align === 'center' ? 'center' : align === 'right' || align === 'end' ? 'flex-end' : 'flex-start';
      const letters: HTMLElement[] = [];
      target!.replaceChildren(...buildLines(source, justify, letters));
      heading.dataset['riseState'] = 'running';
      heading.classList.add('rise-active');
      if (!letters.length || typeof letters[0].animate !== 'function') { settle(current); return; }
      const { easing, duration } = springEasing();
      running = letters.map((letter, index) => letter.animate(
        [{ opacity: 0, transform: `translateY(${RISE_PX}px)` }, { opacity: 1, transform: 'none' }],
        { duration, delay: index * LETTER_STAGGER, easing, fill: 'backwards' },
      ));
      void Promise.all(running.map(animation => animation.finished)).then(() => settle(current), () => undefined);
    };
    const settle = (current: number) => {
      if (destroyed || current !== generation) return;
      running = [];
      heading.dataset['riseState'] = 'settled'; frozen = true;
    };
    const preference = () => {
      if (frozen) {
        heading.classList.toggle('rise-active', !media.matches);
        if (media.matches) delete heading.dataset['riseState'];
        else heading.dataset['riseState'] = 'settled';
      } else update();
    };
    this.destroyRef.onDestroy(() => {
      destroyed = true; generation++; stop();
      media.removeEventListener('change', preference); observer?.disconnect();
      delete heading.dataset['riseState'];
    });
    media.addEventListener('change', preference);
    update();
  }
}

/** Tách nội dung thành dòng (theo <br>) → từ (khung overflow để ký tự trồi lên từ dưới mép) → ký tự. */
function buildLines(source: HTMLElement, justify: string, letters: HTMLElement[]): HTMLElement[] {
  const lines: Node[][] = [[]];
  source.childNodes.forEach(node => { if (node instanceof HTMLBRElement) lines.push([]); else lines[lines.length - 1].push(node); });
  return lines.map(nodes => {
    const line = document.createElement('span');
    line.className = justify === 'center' ? 'rise-line justify-center' : 'rise-line';
    line.style.cssText = `position:relative;column-gap:.3em;display:flex;flex-wrap:wrap;justify-content:${justify}`;
    nodes.forEach(node => appendNode(line, node, letters));
    return line;
  });
}

function appendNode(parent: HTMLElement, node: Node, letters: HTMLElement[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    for (const word of (node.textContent ?? '').split(/\s+/).filter(Boolean)) {
      const box = document.createElement('span');
      box.className = 'line-word';
      box.style.cssText = 'overflow:hidden;display:inline-block';
      for (const char of graphemes(word)) {
        const letter = document.createElement('span');
        letter.style.display = 'inline-block';
        letter.textContent = char;
        box.appendChild(letter);
        letters.push(letter);
      }
      parent.appendChild(box);
    }
    return;
  }
  if (!(node instanceof HTMLElement)) return;
  // Giữ thẻ định dạng (em, strong, span có class) nhưng không tạo hộp riêng: chữ con vẫn là mục flex của dòng.
  const copy = document.createElement(node.tagName.toLowerCase());
  if (node.className) copy.className = node.className;
  copy.style.display = 'contents';
  node.childNodes.forEach(child => appendNode(copy, child, letters));
  parent.appendChild(copy);
}
