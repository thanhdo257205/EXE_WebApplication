import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import { AuthService, CurrentUser } from '../../../core/auth/auth.service';
import { AssistantDockComponent } from './assistant-dock.component';

const member: CurrentUser = { id: 'u1', email: 'player@example.test', displayName: 'Người chơi', role: 'CUSTOMER' };

const reply = {
  answer: 'Mỗi tháng **4 cư dân** góp kín 0–4 Tiền [1].',
  sources: [{ title: 'Luật cơ bản', url: '/wiki/luat-co-ban' }],
  release: { versionLabel: '1.0', title: 'Bản phát hành mẫu' },
  meta: {
    provider: 'gemini', model: 'gemini-3.5-flash-lite', cached: false,
    latencyMs: 1_200, tokensIn: 1_234, tokensOut: 45, considered: 3, selected: 2,
  },
};

@Component({ standalone: true, template: '<div></div>' })
class StubPage {}

function mockAuth(user: CurrentUser | null) {
  return {
    currentUser: signal<CurrentUser | null>(user),
    checkingSession: signal(false),
    loadCurrentUser: () => of(user),
    getCsrf: () => of({ headerName: 'X-XSRF-TOKEN', token: 'test-csrf' }),
  };
}

async function setup(url = '/', user: CurrentUser | null = member) {
  const auth = mockAuth(user);
  TestBed.configureTestingModule({
    imports: [AssistantDockComponent],
    providers: [
      provideRouter([
        { path: '', component: StubPage, pathMatch: 'full' },
        { path: 'wiki', component: StubPage },
        { path: 'tro-ly', component: StubPage },
        { path: 'dang-nhap', component: StubPage },
        { path: 'admin', component: StubPage },
      ]),
      provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: auth },
    ],
  });
  const router = TestBed.inject(Router);
  const fixture = TestBed.createComponent(AssistantDockComponent);
  fixture.detectChanges();
  await router.navigateByUrl(url);
  fixture.detectChanges();
  return { fixture, auth, http: TestBed.inject(HttpTestingController), root: fixture.nativeElement as HTMLElement, router };
}

const open = (root: HTMLElement) => root.querySelector<HTMLButtonElement>('.launcher')!.click();
const chipLabels = (root: HTMLElement) => [...root.querySelectorAll('.chip')].map(chip => chip.textContent?.trim());

describe('AssistantDockComponent', () => {
  beforeEach(() => { window.sessionStorage.clear(); });

  afterEach(() => { window.sessionStorage.clear(); });

  it('shows a floating launcher on public pages and hides it on the full assistant page and admin', async () => {
    const { fixture, root, router, http } = await setup('/');
    expect(root.querySelector('.launcher')).toBeTruthy();
    expect(root.querySelector('.panel')).toBeNull();

    await router.navigateByUrl('/tro-ly');
    fixture.detectChanges();
    expect(root.querySelector('.launcher')).toBeNull();

    await router.navigateByUrl('/admin');
    fixture.detectChanges();
    expect(root.querySelector('.launcher')).toBeNull();
    http.verify();
  });

  it('opens with the suggestions of the current page and swaps them on navigation', async () => {
    const { fixture, root, router, http } = await setup('/');
    open(root);
    fixture.detectChanges();
    const panel = root.querySelector('[role="dialog"]');
    expect(panel).toBeTruthy();
    expect(root.querySelector('.identity-page')?.textContent).toBe('Trang chủ');
    expect(chipLabels(root)).toContain('Mua hộp game ở đâu?');

    await router.navigateByUrl('/wiki');
    fixture.detectChanges();
    expect(root.querySelector('.identity-page')?.textContent).toBe('Wiki luật');
    expect(chipLabels(root)).toContain('Vì sao Nhà Chung mất Tim?');
    expect(chipLabels(root)).not.toContain('Mua hộp game ở đâu?');
    expect(root.querySelector('.panel')).toBeTruthy();
    http.verify();
  });

  it('asks a suggested question without history and shows the reasoning trace with real numbers', async () => {
    const { fixture, root, http } = await setup('/wiki');
    open(root);
    fixture.detectChanges();
    const target = [...root.querySelectorAll<HTMLButtonElement>('.chip')].find(chip => chip.textContent?.includes('Vì sao Nhà Chung mất Tim?'));
    target!.click();
    fixture.detectChanges();

    const request = http.expectOne('/api/v1/assistant/chat');
    expect(request.request.body.message).toBe('Vì sao Nhà Chung mất Tim?');
    expect(request.request.body.history).toEqual([]);
    expect(request.request.headers.get('X-XSRF-TOKEN')).toBe('test-csrf');
    expect(root.querySelector('.live-steps')?.textContent).toContain('Đang tìm trong bản phát hành');
    expect(root.querySelector('.live-steps')?.textContent).toContain('Đang hỏi trợ lý AI');

    request.flush(reply);
    fixture.detectChanges();

    expect(root.querySelector('.answer strong')?.textContent).toBe('4 cư dân');
    expect(root.querySelector('.sources a')?.getAttribute('href')).toBe('/wiki/luat-co-ban');
    const trace = root.querySelector('.trace');
    expect(trace).toBeTruthy();
    expect(trace?.textContent).toContain('Quá trình trả lời');
    expect(trace?.textContent).toContain('Gemini · gemini-3.5-flash-lite');
    expect(trace?.textContent).toContain('3 đoạn khớp · chọn 2 nguồn');
    expect(trace?.textContent).toContain('1.234 token vào');
    expect(trace?.textContent).toContain('45 token ra');
    expect(trace?.textContent).toContain('1,2 giây');
    expect((trace as HTMLDetailsElement).open).toBe(true);
    expect(root.querySelector('.identity-sub')?.textContent).toContain('Bản 1.0');
  });

  it('marks a cached answer in the trace instead of claiming fresh tokens', async () => {
    const { fixture, root, http } = await setup('/');
    open(root);
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.chip')!.click();
    fixture.detectChanges();
    http.expectOne('/api/v1/assistant/chat').flush({
      ...reply,
      meta: { ...reply.meta, cached: true, latencyMs: 0, tokensIn: 0, tokensOut: 0 },
    });
    fixture.detectChanges();

    const trace = root.querySelector('.trace');
    expect(trace?.textContent).toContain('Lấy từ bộ đệm, không gọi lại model');
    expect(trace?.textContent).toContain('0 token mới');
  });

  it('keeps the conversation in sessionStorage across mounts and clears it on sign-out', async () => {
    const first = await setup('/');
    open(first.root);
    first.fixture.detectChanges();
    first.root.querySelector<HTMLButtonElement>('.chip')!.click();
    first.fixture.detectChanges();
    first.http.expectOne('/api/v1/assistant/chat').flush(reply);
    first.fixture.detectChanges();
    expect(first.root.querySelector('.answer')).toBeTruthy();
    expect(window.sessionStorage.getItem('exe.assistant.dock.v1')).toContain('4 cư dân');
    first.fixture.destroy();

    const second = TestBed.createComponent(AssistantDockComponent);
    second.detectChanges();
    const secondRoot = second.nativeElement as HTMLElement;
    open(secondRoot);
    second.detectChanges();
    expect(secondRoot.querySelector('.answer strong')?.textContent).toBe('4 cư dân');
    expect(secondRoot.querySelector('.trace')).toBeTruthy();

    window.dispatchEvent(new Event('auth:signed-out'));
    second.detectChanges();
    expect(secondRoot.querySelector('.answer')).toBeNull();
    expect(window.sessionStorage.getItem('exe.assistant.dock.v1')).not.toContain('4 cư dân');
    second.destroy();
  });

  it('gates the composer behind login without showing page suggestions to visitors', async () => {
    const { fixture, root, http } = await setup('/', null);
    open(root);
    fixture.detectChanges();
    expect(root.querySelector('.login-gate')?.textContent).toContain('chỉ dành cho tài khoản đã đăng nhập');
    expect(root.querySelector('.login-cta')?.getAttribute('href')).toContain('/dang-nhap');
    expect(root.querySelector('#assistant-dock-question')).toBeNull();
    expect(root.querySelectorAll('.chip')).toHaveLength(0);
    http.verify();
  });

  it('points visitors on the login page to the form instead of a self-referencing login link', async () => {
    const { fixture, root, http } = await setup('/dang-nhap', null);
    open(root);
    fixture.detectChanges();
    expect(root.querySelector('.login-gate')).toBeNull();
    expect(root.querySelector('.login-note')?.textContent).toContain('form trên trang này');
    http.verify();
  });

  it('closes on Escape', async () => {
    const { fixture, root, http } = await setup('/');
    open(root);
    fixture.detectChanges();
    expect(root.querySelector('.panel')).toBeTruthy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(root.querySelector('.panel')).toBeNull();
    http.verify();
  });
});
