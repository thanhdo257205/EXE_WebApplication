import { TestBed } from '@angular/core/testing';
import { TurnstileApi, TurnstileComponent, TurnstileLoader } from './turnstile.component';

describe('TurnstileComponent', () => {
  let options: Parameters<TurnstileApi['render']>[1];
  const api: TurnstileApi = {
    render: vi.fn((_container, config) => { options = config; return 'widget-id'; }),
    reset: vi.fn(), remove: vi.fn(),
  };
  const loader = { load: vi.fn() };
  beforeEach(() => {
    vi.clearAllMocks();
    loader.load.mockResolvedValue(api);
    TestBed.configureTestingModule({ imports: [TurnstileComponent], providers: [{ provide: TurnstileLoader, useValue: loader }] });
  });
  function create() {
    const fixture = TestBed.createComponent(TurnstileComponent);
    fixture.componentRef.setInput('siteKey', 'public-key');
    const tokens: string[] = [];
    fixture.componentInstance.tokenChange.subscribe(token => tokens.push(token));
    fixture.detectChanges();
    return { fixture, tokens };
  }

  it('uses the login action, emits success and invalidates expired or timed-out challenges', async () => {
    const { fixture, tokens } = create();
    await fixture.whenStable();
    expect(options.sitekey).toBe('public-key');
    expect(options.action).toBe('login');
    options.callback('test-token');
    options['expired-callback']();
    options.callback('replacement-token');
    options['timeout-callback']();
    expect(tokens).toEqual(['', 'test-token', '', 'replacement-token', '']);
  });

  it('resets after a login attempt and removes its widget when navigating away', async () => {
    const { fixture, tokens } = create();
    await fixture.whenStable();
    fixture.componentInstance.reset();
    expect(tokens.at(-1)).toBe('');
    expect(api.reset).toHaveBeenCalledWith('widget-id');
    fixture.destroy();
    expect(api.remove).toHaveBeenCalledWith('widget-id');
  });

  it('shows a retry when loading fails and can render on a later attempt', async () => {
    loader.load.mockRejectedValueOnce(new Error('unavailable'));
    const { fixture } = create();
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeTruthy();
    await fixture.componentInstance.mount();
    expect(fixture.componentInstance.failed()).toBe(false);
    expect(api.render).toHaveBeenCalledTimes(1);
  });

  it('does not mount a widget after its page has already been destroyed', async () => {
    let resolve!: (api: TurnstileApi) => void;
    loader.load.mockReturnValueOnce(new Promise<TurnstileApi>(done => { resolve = done; }));
    const { fixture } = create();
    fixture.destroy(); resolve(api);
    await Promise.resolve();
    expect(api.render).not.toHaveBeenCalled();
  });

  it('clears tokens and displays widget verification errors', async () => {
    const { fixture, tokens } = create();
    await fixture.whenStable(); options.callback('test-token'); options['error-callback']();
    expect(tokens.at(-1)).toBe('');
    expect(fixture.componentInstance.failed()).toBe(true);
  });
});
