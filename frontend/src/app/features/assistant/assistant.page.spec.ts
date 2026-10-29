import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { AuthService, CurrentUser } from '../../core/auth/auth.service';
import { AssistantPage } from './assistant.page';

const reply = {
  answer: 'Mỗi tháng **4 cư dân** góp kín 0–4 Tiền [1].',
  sources: [{ title: 'Luật cơ bản', url: '/wiki/luat-co-ban' }],
  release: { versionLabel: 'test-v1', title: 'Bản thử' },
};

const member: CurrentUser = { id: 'u1', email: 'player@example.test', displayName: 'Người chơi', role: 'CUSTOMER' };

function setup(user: CurrentUser | null = member) {
  const auth = {
    currentUser: signal<CurrentUser | null>(user),
    checkingSession: signal(false),
    loadCurrentUser: () => of(user),
    getCsrf: () => of({ headerName: 'X-XSRF-TOKEN', token: 'test-csrf' }),
  };
  TestBed.configureTestingModule({
    imports: [AssistantPage],
    providers: [
      provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: auth },
    ],
  });
  const fixture = TestBed.createComponent(AssistantPage);
  fixture.detectChanges();
  return { fixture, http: TestBed.inject(HttpTestingController), root: fixture.nativeElement as HTMLElement, auth };
}

function type(root: HTMLElement, value: string): void {
  const input = root.querySelector<HTMLTextAreaElement>('#assistant-question')!;
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function submit(root: HTMLElement): void {
  root.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
}

describe('AssistantPage', () => {
  it('hides the composer and suggestions behind a login gate for visitors without a session', () => {
    const { root, http } = setup(null);
    expect(root.querySelector('.login-gate')?.textContent).toContain('chỉ dành cho tài khoản đã đăng nhập');
    expect(root.querySelector('#assistant-question')).toBeNull();
    expect(root.querySelectorAll('.chip')).toHaveLength(0);
    http.verify();
  });

  it('starts with a welcome, suggested questions and a labelled composer', () => {
    const { root, http } = setup();
    expect(root.textContent).toContain('Chào bạn');
    expect(root.querySelectorAll('.chip')).toHaveLength(4);
    expect(root.querySelector('label[for="assistant-question"]')).toBeTruthy();
    expect(root.querySelector('textarea#assistant-question')?.getAttribute('maxlength')).toBe('1000');
    expect(root.querySelector('.transcript')?.hasAttribute('data-lenis-prevent')).toBe(true);
    http.verify();
  });

  it('sends a suggestion, shows the pending state and renders a grounded answer with sources', () => {
    const { fixture, http, root } = setup();
    root.querySelector<HTMLButtonElement>('.chip')!.click();
    fixture.detectChanges();

    const request = http.expectOne('/api/v1/assistant/chat');
    expect(request.request.body.message).toBe('Quỹ Nhà Chung hoạt động thế nào?');
    expect(request.request.body.history).toEqual([]);
    expect(request.request.headers.get('X-XSRF-TOKEN')).toBe('test-csrf');
    expect(root.textContent).toContain('Quỹ Nhà Chung hoạt động thế nào?');
    expect(root.querySelector('.typing')).toBeTruthy();

    request.flush(reply);
    fixture.detectChanges();

    expect(root.querySelector('.answer strong')?.textContent).toBe('4 cư dân');
    expect(root.querySelector('.sources a')?.getAttribute('href')).toBe('/wiki/luat-co-ban');
    expect(root.textContent).toContain('Bản test-v1');
    expect(root.querySelector('.chip')).toBeNull();
    expect(root.querySelector<HTMLTextAreaElement>('#assistant-question')!.value).toBe('');
  });

  it('sends the last four turns as history and keeps a retry available after a failure', () => {
    const { fixture, http, root } = setup();
    type(root, 'Câu một');
    fixture.detectChanges();
    submit(root);
    fixture.detectChanges();
    http.expectOne('/api/v1/assistant/chat').flush(reply);
    fixture.detectChanges();

    type(root, 'Câu hai');
    fixture.detectChanges();
    submit(root);
    fixture.detectChanges();
    const second = http.expectOne('/api/v1/assistant/chat');
    expect(second.request.body.message).toBe('Câu hai');
    expect(second.request.body.history).toEqual([
      { role: 'user', content: 'Câu một' },
      { role: 'assistant', content: reply.answer },
    ]);

    second.flush({}, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('tạm nghỉ');

    root.querySelector<HTMLButtonElement>('.failure-actions button')!.click();
    fixture.detectChanges();
    const retry = http.expectOne('/api/v1/assistant/chat');
    expect(retry.request.body.message).toBe('Câu hai');
    expect(retry.request.body.history).toHaveLength(2);
    retry.flush(reply);
    fixture.detectChanges();
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(root.querySelectorAll('.sources a')).toHaveLength(2);
  });

  it('keeps a suggested question standalone and reuses its cached answer after clearing', () => {
    const { fixture, http, root } = setup();
    type(root, 'Câu một');
    fixture.detectChanges();
    submit(root);
    fixture.detectChanges();
    http.expectOne('/api/v1/assistant/chat').flush(reply);
    fixture.detectChanges();

    const suggestion = 'Quỹ Nhà Chung hoạt động thế nào?';
    type(root, suggestion);
    fixture.detectChanges();
    submit(root);
    fixture.detectChanges();
    const standalone = http.expectOne('/api/v1/assistant/chat');
    expect(standalone.request.body.message).toBe(suggestion);
    expect(standalone.request.body.history).toEqual([]);
    standalone.flush({ ...reply, answer: 'Câu trả lời gợi ý' });
    fixture.detectChanges();

    root.querySelector<HTMLButtonElement>('.clear')!.click();
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.chip')!.click();
    fixture.detectChanges();

    http.expectNone('/api/v1/assistant/chat');
    expect(root.textContent).toContain('Câu trả lời gợi ý');
  });

  it('clears the conversation and restores the suggestions', () => {
    const { fixture, http, root } = setup();
    type(root, 'Câu hỏi');
    fixture.detectChanges();
    submit(root);
    fixture.detectChanges();
    http.expectOne('/api/v1/assistant/chat').flush(reply);
    fixture.detectChanges();
    expect(root.querySelectorAll('.turn')).toHaveLength(3);

    root.querySelector<HTMLButtonElement>('.clear')!.click();
    fixture.detectChanges();

    expect(root.querySelectorAll('.turn')).toHaveLength(1);
    expect(root.querySelectorAll('.chip')).toHaveLength(4);
    expect(root.querySelector<HTMLTextAreaElement>('#assistant-question')!.value).toBe('');
  });

  it('replaces the composer with the login gate when the session expires mid-question', () => {
    const { fixture, http, root, auth } = setup();
    type(root, 'Câu hỏi');
    fixture.detectChanges();
    submit(root);
    fixture.detectChanges();
    http.expectOne('/api/v1/assistant/chat').flush({}, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(auth.currentUser()).toBeNull();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Phiên đăng nhập đã hết hạn');
    expect(root.querySelector('.failure-actions a')?.textContent).toContain('Đăng nhập lại');
    expect(root.querySelector('#assistant-question')).toBeNull();
    expect(root.querySelector('.login-gate')).toBeTruthy();
  });
});
