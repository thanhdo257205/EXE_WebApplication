import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { AssistantError, AssistantService, assistantFailureMessage } from './assistant.service';

describe('AssistantService', () => {
  let service: AssistantService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AssistantService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts the question and prior turns with credentials', () => {
    let answer = '';
    service.ask('Quỹ Nhà Chung hoạt động thế nào?', [{ role: 'user', content: 'Chào trợ lý' }]).subscribe(reply => answer = reply.answer);

    const request = http.expectOne('/api/v1/assistant/chat');
    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body).toEqual({
      message: 'Quỹ Nhà Chung hoạt động thế nào?',
      history: [{ role: 'user', content: 'Chào trợ lý' }],
    });
    request.flush({
      answer: 'Mỗi người góp kín 0–4 Tiền.',
      sources: [{ title: 'Luật cơ bản', url: '/wiki/luat-co-ban' }],
      release: { versionLabel: 'test-v1', title: 'Bản thử' },
    });
    expect(answer).toBe('Mỗi người góp kín 0–4 Tiền.');
  });

  it.each([
    [429, 'rate-limited'],
    [400, 'invalid'],
    [503, 'unavailable'],
  ])('maps HTTP %i to %s', (status, failure) => {
    let actual: AssistantError | undefined;
    service.ask('Hỏi thử').subscribe({ error: error => actual = error });
    http.expectOne('/api/v1/assistant/chat').flush({}, { status, statusText: 'Error' });
    expect(actual?.failure).toBe(failure);
  });

  it('maps a transport failure to the network state with visitor-facing copy', () => {
    let actual: AssistantError | undefined;
    service.ask('Hỏi thử').subscribe({ error: error => actual = error });
    http.expectOne('/api/v1/assistant/chat').error(new ProgressEvent('error'));
    expect(actual?.failure).toBe('network');
    expect(assistantFailureMessage(actual!.failure)).toContain('Không kết nối được');
  });

  it('serves a repeated standalone question from memory without another request', () => {
    const answers: string[] = [];
    const reply = {
      answer: 'Mỗi người góp kín 0–4 Tiền.',
      sources: [{ title: 'Luật cơ bản', url: '/wiki/luat-co-ban' }],
      release: { versionLabel: 'test-v1', title: 'Bản thử' },
    };
    service.ask('Quỹ Nhà Chung hoạt động thế nào?').subscribe(value => answers.push(value.answer));
    http.expectOne('/api/v1/assistant/chat').flush(reply);
    service.ask('  quỹ nhà chung HOẠT ĐỘNG thế nào ').subscribe(value => answers.push(value.answer));
    http.expectNone('/api/v1/assistant/chat');
    expect(answers).toEqual([reply.answer, reply.answer]);
  });

  it('keeps cached answers separate for different conversation histories', () => {
    const reply = { answer: 'Trả lời', sources: [], release: { versionLabel: 'test-v1', title: 'Bản thử' } };
    service.ask('Câu hỏi', [{ role: 'user', content: 'A' }]).subscribe();
    http.expectOne('/api/v1/assistant/chat').flush(reply);
    service.ask('Câu hỏi', [{ role: 'user', content: 'B' }]).subscribe();
    http.expectOne('/api/v1/assistant/chat').flush(reply);
  });

  it('does not pin an answer when no release is published yet', () => {
    const reply = { answer: 'Chưa có bản phát hành.', sources: [], release: null };
    service.ask('Hỏi thử').subscribe();
    http.expectOne('/api/v1/assistant/chat').flush(reply);
    service.ask('Hỏi thử').subscribe();
    http.expectOne('/api/v1/assistant/chat').flush(reply);
  });
});
