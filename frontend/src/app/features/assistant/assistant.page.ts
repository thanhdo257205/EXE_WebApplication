import { Component, computed, DestroyRef, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  AssistantError,
  AssistantFailure,
  AssistantHistoryMessage,
  AssistantRelease,
  AssistantService,
  AssistantSource,
  assistantFailureMessage,
} from '../../core/assistant/assistant.service';
import { AuthService } from '../../core/auth/auth.service';
import { renderPublicMarkdown } from '../../core/content/public-content.service';
import { GAME } from '../../shared/game-facts';
import { MorphIconComponent } from '../../shared/components/morph-icon/morph-icon.component';
import { RevealDirective } from '../../shared/motion/reveal.directive';

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  html: string;
  sources?: readonly AssistantSource[];
}

const HISTORY_LIMIT = 4;
const HISTORY_CHARS = 500;
const MAX_QUESTION = 1_000;

/**
 * Trang trợ lý hỏi đáp: gửi câu hỏi tới backend RAG, hiển thị câu trả lời kèm nguồn.
 * Hội thoại nằm trong bộ nhớ trang; chỉ câu hỏi và nội dung công khai được gửi đi.
 */
@Component({
  selector: 'app-assistant-page',
  imports: [RouterLink, RevealDirective, MorphIconComponent],
  templateUrl: './assistant.page.html',
  styleUrls: ['./assistant.page.css', './assistant.console.css', './assistant.chat.css', './assistant.sections.css'],
})
export class AssistantPage implements OnInit {
  private readonly service = inject(AssistantService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);
  private readonly transcript = viewChild<ElementRef<HTMLElement>>('transcript');
  private readonly input = viewChild<ElementRef<HTMLTextAreaElement>>('input');
  private request?: Subscription;
  private sequence = 0;
  private lastRequest: { question: string; history: AssistantHistoryMessage[] } | null = null;

  readonly game = GAME;
  readonly maxQuestion = MAX_QUESTION;
  readonly signedIn = computed(() => this.auth.currentUser() !== null);
  readonly messages = signal<readonly ChatMessage[]>([]);
  readonly draft = signal('');
  readonly pending = signal(false);
  readonly error = signal<string | null>(null);
  readonly lastQuestion = signal<string | null>(null);
  readonly latestRelease = signal<AssistantRelease | null>(null);
  readonly releaseLabel = computed(() => {
    const release = this.latestRelease();
    return release ? `Bản ${release.versionLabel}` : 'Nội dung đã phát hành';
  });
  readonly suggestions = [
    'Quỹ Nhà Chung hoạt động thế nào?',
    'Một ván chơi bao lâu và dành cho mấy người?',
    'Mục tiêu bí mật trong game là gì?',
    'Vì sao Nhà Chung mất Tim?',
  ];
  // Suggested questions are complete on their own: skipping history keeps them cacheable and saves tokens.
  private readonly standalone = new Set(this.suggestions);
  readonly knowledge = [
    { icon: 'rules', title: 'Wiki luật & hướng dẫn', text: 'Các bài luật, FAQ và hướng dẫn đã phát hành.', link: '/wiki', label: 'Mở wiki' },
    { icon: 'cards', title: 'Thẻ bài & cư dân', text: 'Hiệu ứng thẻ, bộ thẻ và hồ sơ 8 cư dân.', link: '/thu-vien', label: 'Xem thư viện' },
    { icon: 'fund', title: 'Quỹ Nhà Chung', text: 'Cách góp kín, hóa đơn và chuyện mất Tim.', link: '/quy-nha', label: 'Chơi mô phỏng' },
  ] as const;
  readonly steps = [
    { title: 'Bạn hỏi', text: 'Luật chơi, thẻ bài, cư dân, quỹ nhà hay thông tin dự án.' },
    { title: 'Trợ lý tra bản phát hành', text: 'Chỉ nội dung công khai của bản đang phát hành mới được dùng.' },
    { title: 'Nhận câu trả lời kèm nguồn', text: 'Mở đúng trang wiki hoặc thẻ để tự kiểm tra.' },
  ] as const;
  readonly stats = [
    { value: String(GAME.players), label: 'người chơi mỗi ván' },
    { value: GAME.minutes, label: 'phút mỗi ván' },
    { value: String(GAME.cards), label: 'thẻ trong bộ' },
    { value: `≤${GAME.learnMinutes}`, label: 'phút học luật' },
  ];

  constructor() {
    this.destroyRef.onDestroy(() => this.request?.unsubscribe());
  }

  ngOnInit(): void {
    if (!this.auth.currentUser() && !this.auth.checkingSession()) {
      this.auth.loadCurrentUser().subscribe({ error: () => undefined });
    }
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
    this.ask(this.draft());
  }

  ask(question: string): void {
    const text = question.trim();
    if (!text || this.pending() || !this.signedIn()) return;
    if (text.length > MAX_QUESTION) {
      this.error.set(assistantFailureMessage('invalid'));
      return;
    }
    const history = this.standalone.has(text) ? [] : this.history();
    this.error.set(null);
    this.lastQuestion.set(text);
    this.messages.update(list => [...list, { id: ++this.sequence, role: 'user', content: text, html: '' }]);
    this.draft.set('');
    this.run(text, history);
  }

  retry(): void {
    if (!this.lastRequest || this.pending() || !this.signedIn()) return;
    this.error.set(null);
    this.run(this.lastRequest.question, this.lastRequest.history);
  }

  reset(): void {
    this.request?.unsubscribe();
    this.request = undefined;
    this.pending.set(false);
    this.error.set(null);
    this.messages.set([]);
    this.draft.set('');
    this.lastQuestion.set(null);
    this.lastRequest = null;
    this.latestRelease.set(null);
    if (typeof window === 'undefined') return;
    setTimeout(() => this.input()?.nativeElement.focus(), 0);
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
    this.scrollToEnd();
    this.request = this.service.ask(question, history).subscribe({
      next: reply => {
        this.pending.set(false);
        this.request = undefined;
        this.latestRelease.set(reply.release);
        this.messages.update(list => [...list, {
          id: ++this.sequence,
          role: 'assistant',
          content: reply.answer,
          html: renderPublicMarkdown(reply.answer),
          sources: reply.sources,
        }]);
        this.scrollToEnd();
      },
      error: (error: unknown) => {
        this.pending.set(false);
        this.request = undefined;
        const failure: AssistantFailure = error instanceof AssistantError ? error.failure : 'network';
        // A stale session becomes the signed-out state so the composer is replaced by the login gate.
        if (failure === 'auth') this.auth.currentUser.set(null);
        this.error.set(assistantFailureMessage(failure));
        this.scrollToEnd();
      },
    });
  }

  private scrollToEnd(): void {
    if (typeof window === 'undefined') return;
    setTimeout(() => {
      const element = this.transcript()?.nativeElement;
      if (!element) return;
      if (typeof element.scrollTo === 'function') element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
      else element.scrollTop = element.scrollHeight;
    }, 30);
  }
}
