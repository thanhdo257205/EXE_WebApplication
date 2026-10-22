import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArenaPage } from './arena.page';

type PageInternals = { ctl: { tick(now: number): void; game: { turn: number; sides: { hand: { kind: string }[] }[] } } };

describe('ArenaPage (chế độ chữ khi không có WebGPU)', () => {
  let fixture: ComponentFixture<ArenaPage>;
  let page: ArenaPage;
  const root = () => fixture.nativeElement as HTMLElement;
  const buttons = (selector: string) => Array.from(root().querySelectorAll<HTMLButtonElement>(selector));
  const settle = async () => { await fixture.whenStable(); fixture.detectChanges(); };

  const store = new Map<string, string>();
  beforeEach(async () => {
    store.clear();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
    vi.stubGlobal('matchMedia', () => Object.assign(new EventTarget(), { matches: false }));
    vi.stubGlobal('requestAnimationFrame', () => 1);
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    fixture = TestBed.createComponent(ArenaPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
    await vi.waitFor(() => expect(page.state()).toBe('text'));
    await settle();
  });
  afterEach(() => { vi.unstubAllGlobals(); fixture.destroy(); });

  it('báo thiếu WebGPU nhưng vẫn cho chơi, hiện danh sách tay bài và bảng theo dõi', () => {
    expect(root().querySelector('.notice')?.textContent).toContain('WebGPU');
    expect(root().querySelector('.a11y-list.visible')).toBeTruthy();
    expect(buttons('.a11y-list button').length).toBe(5);
    expect(root().querySelector('.status')?.textContent).toContain('Chuẩn bị');
    expect(root().querySelectorAll('.board-side').length).toBe(2);
    expect(root().querySelector('.legal')?.textContent).toContain('không liên kết');
  });

  it('chọn Pokémon rồi đặt xuống bàn; chỉ hiện "Sẵn sàng" khi đã có Pokémon Chiến đấu', async () => {
    const internals = page as unknown as PageInternals;
    expect(buttons('.controls .primary')).toHaveLength(0);
    const hand = internals.ctl.game.sides[0].hand;
    const index = hand.findIndex(card => card.kind === 'pokemon');
    buttons('.a11y-list button')[index].click(); await settle();
    expect(buttons('.a11y-list button')[index].getAttribute('aria-pressed')).toBe('true');
    expect(root().querySelector('.hint')?.textContent).toContain('Nhấn lần nữa');
    buttons('.controls .chip').find(b => b.textContent?.includes('Đặt xuống bàn'))!.click();
    internals.ctl.tick(1); internals.ctl.tick(2); await settle();
    expect(buttons('.controls .primary').map(b => b.textContent)).toEqual([expect.stringContaining('Sẵn sàng')]);
    expect(root().querySelector('.log')?.textContent).toContain('Chiến đấu');
  });

  it('năng lượng bị từ chối ở bước chuẩn bị với lý do rõ ràng', async () => {
    const internals = page as unknown as PageInternals;
    const index = internals.ctl.game.sides[0].hand.findIndex(card => card.kind === 'energy');
    if (index < 0) return; // ván ngẫu nhiên có thể không có Năng lượng trong tay đầu
    buttons('.a11y-list button')[index].click(); await settle();
    expect(root().querySelector('.hint')?.textContent).toContain('bước chuẩn bị');
  });

  it('chuyển đổi mức đồ họa không áp dụng trong chế độ chữ và "Ván mới" đặt lại nhật ký', async () => {
    expect(buttons('.controls .chip').some(b => b.textContent?.includes('Đồ họa'))).toBe(false);
    buttons('.controls .chip').find(b => b.textContent?.includes('Ván mới'))!.click(); await settle();
    expect(root().querySelectorAll('.log li').length).toBeLessThanOrEqual(3);
  });

  it('lần đầu vào chơi: hiện hướng dẫn, đi qua từng bước và nhớ đã xem', async () => {
    const internals = page as unknown as PageInternals;
    const coach = () => root().querySelector('.coach');
    expect(coach()?.textContent).toContain('Chào mừng');
    expect(internals.ctl.game.turn).toBe(0);                       // hướng dẫn ép người chơi đi trước
    (coach()!.querySelector('.primary') as HTMLButtonElement).click(); await settle();
    expect(coach()?.textContent).toContain('Làm quen với sân');
    (coach()!.querySelector('.primary') as HTMLButtonElement).click(); await settle();
    expect(coach()?.textContent).toContain('Đặt Pokémon Chiến đấu');
    expect(coach()!.querySelector('.primary')).toBeNull();          // bước tự động: không có nút "Tiếp"
    const index = internals.ctl.game.sides[0].hand.findIndex(card => card.kind === 'pokemon');
    buttons('.a11y-list button')[index].click(); await settle();
    buttons('.controls .chip').find(b => b.textContent?.includes('Đặt xuống bàn'))!.click();
    internals.ctl.tick(1); internals.ctl.tick(2); await settle();
    expect(coach()?.textContent).toMatch(/Thêm Pokémon dự bị|Sẵn sàng/);
    (coach()!.querySelector('.link') as HTMLButtonElement).click(); await settle();
    expect(coach()).toBeNull();
    expect(store.get('arena-tutorial-v1')).toBe('1');
  });

  it('nút "Hướng dẫn" mở lại hướng dẫn và nút nhấn mạnh sáng lên đúng bước', async () => {
    const internals = page as unknown as PageInternals;
    (root().querySelector('.coach .link') as HTMLButtonElement).click(); await settle();
    expect(root().querySelector('.coach')).toBeNull();
    buttons('.controls .chip').find(b => b.textContent?.trim() === 'Hướng dẫn')!.click(); await settle();
    expect(root().querySelector('.coach')?.textContent).toContain('Chào mừng');
    for (let i = 0; i < 2; i++) (root().querySelector('.coach .primary') as HTMLButtonElement).click(), await settle();
    const index = internals.ctl.game.sides[0].hand.findIndex(card => card.kind === 'pokemon');
    buttons('.a11y-list button')[index].click(); await settle();
    buttons('.controls .chip').find(b => b.textContent?.includes('Đặt xuống bàn'))!.click();
    internals.ctl.tick(1); internals.ctl.tick(2); await settle();
    const bench = root().querySelector('.coach .primary') as HTMLButtonElement | null;     // bước băng ghế chỉ có khi còn Pokémon trong tay
    if (bench) { bench.click(); await settle(); }
    expect(root().querySelector('.coach')?.textContent).toContain('Sẵn sàng');
    expect(root().querySelector('.controls .primary.guided')).toBeTruthy();
  });

  it('đã xem hướng dẫn thì lần sau vào chơi luôn, không hiện hướng dẫn', async () => {
    fixture.destroy();
    store.set('arena-tutorial-v1', '1');
    fixture = TestBed.createComponent(ArenaPage); page = fixture.componentInstance;
    fixture.detectChanges();
    await vi.waitFor(() => expect(page.state()).toBe('text'));
    await settle();
    expect(root().querySelector('.coach')).toBeNull();
  });
});
