import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { COMPOSITION_BUFFER_MODE, FormsModule } from '@angular/forms';
import { describe, expect, it, vi } from 'vitest';
import { ImeEnterDirective } from './ime-enter.directive';

@Component({
  standalone: true,
  imports: [FormsModule, ImeEnterDirective],
  providers: [{ provide: COMPOSITION_BUFFER_MODE, useValue: false }],
  template: `<input [(ngModel)]="text" (imeEnter)="sent.push(text)" appImeEnter />`,
})
class Host {
  text = '';
  sent: string[] = [];
}

function key(el: HTMLElement, init: KeyboardEventInit & { keyCode?: number }) {
  const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  if (init.keyCode !== undefined) Object.defineProperty(ev, 'keyCode', { value: init.keyCode });
  el.dispatchEvent(ev);
  return ev;
}

describe('ImeEnterDirective (Vietnamese IME)', () => {
  async function setup() {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    return { fixture, input, host: fixture.componentInstance };
  }

  it('submits on a plain Enter and prevents the default (no duplicate form submit)', async () => {
    const { input, host } = await setup();
    input.value = 'xin chao'; input.dispatchEvent(new Event('input'));
    const ev = key(input, { key: 'Enter', code: 'Enter' });
    expect(ev.defaultPrevented).toBe(true);
    expect(host.sent).toEqual(['xin chao']);
  });

  it('one Enter while the IME is composing submits after the word is committed, including that word', async () => {
    vi.useFakeTimers();
    try {
      const { input, host } = await setup();
      input.dispatchEvent(new CompositionEvent('compositionstart'));
      input.value = 'chào cả nhà'; input.dispatchEvent(new Event('input')); // still composing "nhà"
      expect(host.text).toBe('chào cả nhà'); // model follows composition (buffer mode off)
      key(input, { key: 'Process', code: 'Enter', keyCode: 229, isComposing: true });
      expect(host.sent).toEqual([]);
      input.dispatchEvent(new CompositionEvent('compositionend'));
      vi.runAllTimers();
      expect(host.sent).toEqual(['chào cả nhà']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores Shift+Enter and a composition that ends without Enter', async () => {
    vi.useFakeTimers();
    try {
      const { input, host } = await setup();
      key(input, { key: 'Enter', code: 'Enter', shiftKey: true });
      input.dispatchEvent(new CompositionEvent('compositionstart'));
      input.dispatchEvent(new CompositionEvent('compositionend'));
      vi.runAllTimers();
      expect(host.sent).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
