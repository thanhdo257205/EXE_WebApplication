import { afterNextRender, Component, computed, DestroyRef, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs';
import {
  AssistantError,
  AssistantFailure,
  AssistantHistoryMessage,
  AssistantMeta,
  AssistantRelease,
  AssistantService,
  AssistantSource,
  assistantFailureMessage,
} from '../../../core/assistant/assistant.service';
import { AuthService } from '../../../core/auth/auth.service';
import { renderPublicMarkdown } from '../../../core/content/public-content.service';
import { assistantSuggestionSet } from '../../assistant-suggestions';
import { MorphIconComponent } from '../morph-icon/morph-icon.component';

interface DockMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  html: string;
  sources?: readonly AssistantSource[];
  release?: AssistantRelease | null;
  meta?: AssistantMeta;
  at: number;
}

interface StoredState {
  version: 1;
  messages: DockMessage[];
  draft: string;
  sequence: number;
  lastQuestion: string | null;
}

const HISTORY_LIMIT = 4;
const HISTORY_CHARS = 500;
const MAX_QUESTION = 1_000;
const STORE_LIMIT = 40;
const CONTENT_LIMIT = 4_000;
// sessionStorage keeps the conversation across pages and reloads, then drops it when the tab closes.
const STORAGE_KEY = 'exe.assistant.dock.v1';

const isSource = (value: unknown): value is AssistantSource => {
  const source = value as AssistantSource | null;
  return !!source && typeof source.title === 'string' && typeof source.url === 'string';
};

const isRelease = (value: unknown): value is AssistantRelease => {
  const release = value as AssistantRelease | null;
  return !!release && typeof release.versionLabel === 'string' && typeof release.title === 'string';
};

const isMeta = (value: unknown): value is AssistantMeta => {
  const meta = value as AssistantMeta | null;
  return !!meta && typeof meta.provider === 'string' && typeof meta.model === 'string'
    && typeof meta.cached === 'boolean' && typeof meta.latencyMs === 'number'
    && typeof meta.tokensIn === 'number' && typeof meta.tokensOut === 'number'
    && typeof meta.considered === 'number' && typeof meta.selected === 'number';
};

const PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Gemini',
  groq: 'Groq',
  openrouter: 'OpenRouter',
  'workers-ai': 'Workers AI',
};

/**
 * Floating assistant for every public page. The page-specific suggestion set comes from the URL,
 * the conversation lives in sessionStorage, and each answer can reveal how it was produced.
 */
@Component({
  selector: 'app-assistant-dock',
  imports: [RouterLink, MorphIconComponent],
  templateUrl: './assistant-dock.component.html',
  styleUrls: ['./assistant-dock.component.css', './assistant-dock.form.css', './assistant-dock.chat.css'],
  host: { '(document:keydown.escape)': 'onEscape()' },
})
export class AssistantDockComponent {
  readonly auth = inject(AuthService);
  private readonly service = inject(AssistantService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transcript = viewChild<ElementRef<HTMLElement>>('transcript');
  private readonly input = viewChild<ElementRef<HTMLTextAreaElement>>('input');
  private readonly launcher = viewChild<ElementRef<HTMLButtonElement>>('launcher');
  private request?: Subscription;
  private sequence = 0;
  private lastRequest: { question: string; history: AssistantHistoryMessage[] } | null = null;
  private restored = false;
  private stageTimer?: ReturnType<typeof setInterval>;

  readonly maxQuestion = MAX_QUESTION;
  readonly stages = [
    'Đang tìm trong bản phát hành',
    'Đang hỏi trợ lý AI',
    'Đang soạn câu trả lời có nguồn',
  ] as const;
  readonly open = signal(false);
  readonly path = signal(this.router.url || '/');
  readonly messages = signal<readonly DockMessage[]>([]);
  readonly draft = signal('');
  readonly pending = signal(false);
  readonly error = signal<string | null>(null);
  readonly lastQuestion = signal<string | null>(null);
  readonly latestRelease = signal<AssistantRelease | null>(null);
  readonly stage = signal(0);
  readonly suggestions = computed(() => assistantSuggestionSet(this.path()));
  // The full page already is the chat, and the admin workspace must stay free of floating widgets.
  readonly visible = computed(() => {
    const path = this.path();
    return !path.startsWith('/admin') && !path.startsWith('/tro-ly');
  });
  // On the auth pages the login form is already on screen; a login link here would point to itself.
  readonly onAuthPage = computed(() => {
    const path = this.path().split(/[?#]/)[0].replace(/\/+$/, '');
    return path === '/dang-nhap' || path === '/dang-ky';
  });
  readonly signedIn = computed(() => this.auth.currentUser() !== null);
  readonly releaseLabel = computed(() => {
    const release = this.latestRelease();
    return release ? `Bản ${release.versionLabel}` : 'Nội dung đã phát hành';
  });
  readonly lastAssistantId = computed(() =>
    this.messages().reduce((latest, message) => message.role === 'assistant' ? message.id : latest, -1));

  constructor() {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      takeUntilDestroyed(),
    ).subscribe(event => this.path.set((event as NavigationEnd).urlAfterRedirects || this.router.url));

    effect(() => {
      const state: StoredState = {
        version: 1,
        messages: this.messages().slice(-STORE_LIMIT).map(message => ({
          ...message,
          html: '',
          content: message.content.slice(0, CONTENT_LIMIT),
          sources: message.sources?.slice(0, 12),
        })),
        draft: this.draft().slice(0, MAX_QUESTION),
        sequence: this.sequence,
        lastQuestion: this.lastQuestion(),
      };
      if (!this.restored || typeof window === 'undefined') return;
      try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Private mode or a full quota must not break the chat.
      }
    });

    afterNextRender(() => {
      this.restored = true;
      this.restore();
      window.addEventListener('auth:signed-out', this.onSignedOut);
    });
    this.destroyRef.onDestroy(() => {
      this.request?.unsubscribe();
      this.stopStages();
      if (typeof window !== 'undefined') window.removeEventListener('auth:signed-out', this.onSignedOut);
    });
  }

  toggle(): void {
    if (this.open()) this.close();
    else this.show();
  }

  show(): void {
    this.open.set(true);
    this.ensureSession();
    this.focusInput();
    this.scrollToEnd();
  }

  close(): void {
    this.open.set(false);
    if (typeof window === 'undefined') return;
    setTimeout(() => this.launcher()?.nativeElement.focus(), 0);
  }

  onEscape(): void {
    if (this.open()) this.close();
  }

  onInput(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value.slice(0, MAX_QUESTION));
  }

  onEnter(event: Event): void {
    if (!(event instanceof KeyboardEvent) || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    this.submit();
  }

  submit(event?: Event): void {
    event?.preventDefault();
    this.ask(this.draft(), false);
  }

  /** Suggested questions are complete on their own, so they never carry the current page's history. */
  ask(question: string, standalone = true): void {
    const text = question.trim();
    if (!text || this.pending() || !this.signedIn()) return;
    if (text.length > MAX_QUESTION) {
      this.error.set(assistantFailureMessage('invalid'));
      return;
    }
    this.error.set(null);
    this.lastQuestion.set(text);
    this.messages.update(list => [...list, {
      id: ++this.sequence, role: 'user', content: text, html: '', at: Date.now(),
    }]);
    this.draft.set('');
    this.run(text, standalone ? [] : this.history());
  }

  retry(): void {
    if (!this.lastRequest || this.pending() || !this.signedIn()) return;
    this.error.set(null);
    this.run(this.lastRequest.question, this.lastRequest.history);
  }

  reset(): void {
    this.request?.unsubscribe();
    this.request = undefined;
    this.stopStages();
    this.pending.set(false);
    this.error.set(null);
    this.messages.set([]);
    this.draft.set('');
    this.lastQuestion.set(null);
    this.lastRequest = null;
    this.latestRelease.set(null);
    this.focusInput();
  }

  formatDuration(milliseconds: number): string {
    if (milliseconds < 1_000) return `${milliseconds} ms`;
    return `${(milliseconds / 1_000).toFixed(1).replace('.', ',')} giây`;
  }

  formatTokens(value: number): string {
    return new Intl.NumberFormat('vi-VN').format(value);
  }

  providerLabel(provider: string): string {
    return PROVIDER_LABELS[provider] ?? provider;
  }

  private ensureSession(): void {
    if (this.auth.currentUser() || this.auth.checkingSession()) return;
    this.auth.loadCurrentUser().subscribe({ error: () => undefined });
  }

  private history(): AssistantHistoryMessage[] {
    return this.messages()
      .slice(-HISTORY_LIMIT)
      .map(message => ({ role: message.role, content: message.content.slice(0, HISTORY_CHARS) }));
  }

  private run(question: string, history: AssistantHistoryMessage[]): void {
    this.request?.unsubscribe();
    this.lastRequest = { question, history };
    this.pending.set(true);
    this.startStages();
    this.scrollToEnd();
    this.request = this.service.ask(question, history).subscribe({
      next: reply => {
        this.stopStages();
        this.pending.set(false);
        this.request = undefined;
        this.latestRelease.set(reply.release);
        this.messages.update(list => [...list, {
          id: ++this.sequence,
          role: 'assistant',
          content: reply.answer,
          html: renderPublicMarkdown(reply.answer),
          sources: reply.sources,
          release: reply.release,
          meta: reply.meta,
          at: Date.now(),
        }]);
        this.scrollToEnd();
      },
      error: (error: unknown) => {
        this.stopStages();
        this.pending.set(false);
        this.request = undefined;
        const failure: AssistantFailure = error instanceof AssistantError ? error.failure : 'network';
        // Expired sessions fall back to the login gate instead of failing silently.
        if (failure === 'auth') this.auth.currentUser.set(null);
        this.error.set(assistantFailureMessage(failure));
        this.scrollToEnd();
      },
    });
  }

  private startStages(): void {
    this.stopStages();
    this.stage.set(0);
    if (typeof window === 'undefined') return;
    this.stageTimer = setInterval(() => {
      this.stage.update(value => {
        if (value >= this.stages.length - 1) {
          this.stopStages();
          return value;
        }
        return value + 1;
      });
    }, 900);
  }

  private stopStages(): void {
    if (this.stageTimer === undefined) return;
    clearInterval(this.stageTimer);
    this.stageTimer = undefined;
  }

  private focusInput(): void {
    if (typeof window === 'undefined') return;
    setTimeout(() => this.input()?.nativeElement.focus(), 40);
  }

  private scrollToEnd(): void {
    if (typeof window === 'undefined') return;
    setTimeout(() => {
      const element = this.transcript()?.nativeElement;
      if (!element) return;
      if (typeof element.scrollTo === 'function') element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
      else element.scrollTop = element.scrollHeight;
    }, 40);
  }

  private restore(): void {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const stored = JSON.parse(raw) as Partial<StoredState> | null;
      if (!stored || stored.version !== 1 || !Array.isArray(stored.messages)) return;
      const messages: DockMessage[] = [];
      for (const item of stored.messages.slice(-STORE_LIMIT)) {
        if (!item || (item.role !== 'user' && item.role !== 'assistant') || typeof item.content !== 'string') continue;
        const content = item.content.slice(0, CONTENT_LIMIT);
        messages.push({
          id: Number.isInteger(item.id) ? item.id : messages.length + 1,
          role: item.role,
          content,
          html: item.role === 'assistant' ? renderPublicMarkdown(content) : '',
          sources: Array.isArray(item.sources) ? item.sources.filter(isSource).slice(0, 12) : undefined,
          release: isRelease(item.release) ? item.release : null,
          meta: isMeta(item.meta) ? item.meta : undefined,
          at: typeof item.at === 'number' ? item.at : Date.now(),
        });
      }
      this.messages.set(messages);
      this.sequence = typeof stored.sequence === 'number' && stored.sequence > 0
        ? stored.sequence
        : messages.reduce((max, message) => Math.max(max, message.id), 0);
      this.draft.set(typeof stored.draft === 'string' ? stored.draft.slice(0, MAX_QUESTION) : '');
      this.lastQuestion.set(typeof stored.lastQuestion === 'string' ? stored.lastQuestion : null);
      const lastAssistant = [...messages].reverse().find(message => message.role === 'assistant' && message.release);
      this.latestRelease.set(lastAssistant?.release ?? null);
    } catch {
      this.clearStorage();
    }
  }

  private clearStorage(): void {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clean when storage is unavailable.
    }
  }

  private readonly onSignedOut = (): void => {
    this.request?.unsubscribe();
    this.request = undefined;
    this.stopStages();
    this.pending.set(false);
    this.error.set(null);
    this.messages.set([]);
    this.draft.set('');
    this.lastQuestion.set(null);
    this.lastRequest = null;
    this.latestRelease.set(null);
    this.clearStorage();
  };
}
