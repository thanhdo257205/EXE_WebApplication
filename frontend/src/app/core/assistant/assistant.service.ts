import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, Observable, of, switchMap, tap, throwError, TimeoutError, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';

export interface AssistantSource {
  title: string;
  url: string;
}

export interface AssistantRelease {
  versionLabel: string;
  title: string;
}

/** How the backend produced the answer; shown as the reasoning trace in the UI. */
export interface AssistantMeta {
  provider: string;
  model: string;
  cached: boolean;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  considered: number;
  selected: number;
}

export interface AssistantReply {
  answer: string;
  sources: AssistantSource[];
  release: AssistantRelease | null;
  meta?: AssistantMeta;
}

export interface AssistantHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type AssistantFailure = 'unavailable' | 'rate-limited' | 'invalid' | 'timeout' | 'network' | 'auth';

export class AssistantError extends Error {
  readonly failure: AssistantFailure;

  constructor(failure: AssistantFailure) {
    super(failure);
    this.name = 'AssistantError';
    this.failure = failure;
  }
}

export function assistantFailureMessage(failure: AssistantFailure): string {
  switch (failure) {
    case 'rate-limited':
      return 'Bạn hỏi hơi nhanh. Chờ khoảng một phút rồi thử lại nhé.';
    case 'unavailable':
      return 'Trợ lý đang tạm nghỉ vì hết lượt AI miễn phí. Bạn thử lại sau vài phút, hoặc tra Wiki luật và Hướng dẫn cách chơi.';
    case 'invalid':
      return 'Câu hỏi chưa hợp lệ. Bạn rút gọn dưới 1.000 ký tự rồi thử lại nhé.';
    case 'timeout':
      return 'Trợ lý trả lời lâu quá. Bạn thử lại với câu hỏi ngắn hơn nhé.';
    case 'auth':
      return 'Phiên đăng nhập đã hết hạn. Bạn đăng nhập lại để tiếp tục hỏi trợ lý nhé.';
    default:
      return 'Không kết nối được tới trợ lý. Kiểm tra mạng rồi thử lại nhé.';
  }
}

function normalizeAssistantError(error: unknown): AssistantError {
  if (error instanceof AssistantError) return error;
  if (error instanceof TimeoutError) return new AssistantError('timeout');
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401 || error.status === 403) return new AssistantError('auth');
    if (error.status === 429) return new AssistantError('rate-limited');
    if (error.status === 0) return new AssistantError('network');
    if (error.status === 400 || error.status === 413) return new AssistantError('invalid');
    return new AssistantError('unavailable');
  }
  return new AssistantError('network');
}

const ANSWER_TTL_MS = 5 * 60_000;
const ANSWER_LIMIT = 24;
// The CSRF cookie is stable for a session; refetch only after expiry or a rejected token.
const CSRF_TTL_MS = 20 * 60_000;

const normalizeQuestion = (value: string): string => value.toLowerCase()
  .normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const answerKey = (message: string, history: readonly AssistantHistoryMessage[]): string =>
  `${history.map(turn => `${turn.role}:${normalizeQuestion(turn.content)}`).join('\n')}\n#\n${normalizeQuestion(message)}`;

@Injectable({ providedIn: 'root' })
export class AssistantService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly endpoint = `${environment.apiBaseUrl ?? '/api'}/v1/assistant/chat`;
  // Answers only depend on the published release and the exact conversation, so repeat questions can be
  // served in-memory without another backend call. The short TTL bounds staleness after a new release.
  private readonly answers = new Map<string, { expires: number; reply: AssistantReply }>();
  private csrf?: { headerName: string; token: string; expires: number };

  ask(message: string, history: readonly AssistantHistoryMessage[] = []): Observable<AssistantReply> {
    const key = answerKey(message, history);
    const cached = this.answers.get(key);
    if (cached && cached.expires > Date.now()) return of(cached.reply);
    return this.send(message, history).pipe(
      timeout(40_000),
      tap(reply => this.remember(key, reply)),
      catchError(error => throwError(() => normalizeAssistantError(error))),
    );
  }

  private send(message: string, history: readonly AssistantHistoryMessage[], retried = false): Observable<AssistantReply> {
    return this.csrfToken().pipe(
      switchMap(csrf => this.http.post<AssistantReply>(this.endpoint, { message, history }, {
        withCredentials: true,
        headers: new HttpHeaders({ [csrf.headerName]: csrf.token }),
      })),
      catchError(error => {
        // A login/rotation replaces the XSRF cookie; retry once with a freshly issued token.
        if (!retried && error instanceof HttpErrorResponse && error.status === 403 && error.error?.code === 'CSRF_REQUIRED') {
          this.csrf = undefined;
          return this.send(message, history, true);
        }
        return throwError(() => error);
      }),
    );
  }

  private csrfToken(): Observable<{ headerName: string; token: string }> {
    if (this.csrf && this.csrf.expires > Date.now()) return of(this.csrf);
    return this.auth.getCsrf().pipe(
      tap(csrf => this.csrf = { ...csrf, expires: Date.now() + CSRF_TTL_MS }),
    );
  }

  private remember(key: string, reply: AssistantReply): void {
    // A missing release changes as soon as content is published, so never pin that answer.
    if (!reply.release) return;
    this.answers.delete(key);
    this.answers.set(key, { expires: Date.now() + ANSWER_TTL_MS, reply });
    while (this.answers.size > ANSWER_LIMIT) {
      const oldest = this.answers.keys().next();
      if (oldest.done) return;
      this.answers.delete(oldest.value);
    }
  }
}
