import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { AfterViewInit, Component, ElementRef, inject, Injectable, input, OnDestroy, output, PLATFORM_ID, signal, viewChild } from '@angular/core';

export interface TurnstileApi {
  render(container: HTMLElement, options: {
    sitekey: string; action: string; theme: string; size: string;
    callback: (token: string) => void;
    'expired-callback': () => void;
    'error-callback': () => void;
    'timeout-callback': () => void;
  }): string;
  reset(id: string): void;
  remove(id: string): void;
}

@Injectable({ providedIn: 'root' })
export class TurnstileLoader {
  private readonly document = inject(DOCUMENT);
  private pending?: Promise<TurnstileApi>;

  load(): Promise<TurnstileApi> {
    const win = this.document.defaultView as (Window & { turnstile?: TurnstileApi }) | null;
    if (win?.turnstile) return Promise.resolve(win.turnstile);
    if (this.pending) return this.pending;
    this.pending = new Promise<TurnstileApi>((resolve, reject) => {
      const script = this.document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      const timeout = setTimeout(() => fail(), 15000);
      const fail = () => { clearTimeout(timeout); script.remove(); reject(new Error('Challenge unavailable')); };
      script.onerror = fail;
      script.onload = () => {
        clearTimeout(timeout);
        if (win?.turnstile) resolve(win.turnstile); else fail();
      };
      this.document.head.appendChild(script);
    }).catch(error => { this.pending = undefined; throw error; });
    return this.pending;
  }
}

@Component({
  selector: 'app-turnstile',
  template: `<div #widget></div>
    @if (failed()) {
      <p role="alert">Chưa tải được bước xác minh. Kiểm tra kết nối hoặc trình chặn nội dung.</p>
      <button type="button" (click)="mount()">Tải lại xác minh</button>
    }`,
  styles: `:host { display: block; min-height: 65px; color: #fca5a5; font-size: .8rem; } button { margin-top: .5rem; color: #e6fb9d; text-decoration: underline; cursor: pointer; }`,
})
export class TurnstileComponent implements AfterViewInit, OnDestroy {
  readonly siteKey = input.required<string>();
  readonly tokenChange = output<string>();
  readonly failed = signal(false);
  private readonly widget = viewChild.required<ElementRef<HTMLElement>>('widget');
  private readonly loader = inject(TurnstileLoader);
  private readonly platform = inject(PLATFORM_ID);
  private api?: TurnstileApi;
  private id?: string;
  private destroyed = false;

  ngAfterViewInit() { if (isPlatformBrowser(this.platform)) void this.mount(); }

  async mount() {
    this.failed.set(false);
    this.tokenChange.emit('');
    try {
      const api = await this.loader.load();
      if (this.destroyed) return;
      if (this.id !== undefined) api.remove(this.id);
      this.api = api;
      const invalidate = () => { if (!this.destroyed) this.tokenChange.emit(''); };
      this.id = api.render(this.widget().nativeElement, {
        sitekey: this.siteKey(), action: 'login', theme: 'dark', size: 'flexible',
        callback: token => { if (!this.destroyed) this.tokenChange.emit(token); },
        'expired-callback': invalidate,
        'timeout-callback': invalidate,
        'error-callback': () => { invalidate(); if (!this.destroyed) this.failed.set(true); },
      });
    } catch { if (!this.destroyed) this.failed.set(true); }
  }

  reset() {
    this.tokenChange.emit('');
    if (this.api && this.id !== undefined) this.api.reset(this.id);
  }

  ngOnDestroy() {
    this.destroyed = true;
    if (this.api && this.id !== undefined) this.api.remove(this.id);
  }
}
