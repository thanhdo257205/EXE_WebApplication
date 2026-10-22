import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArenaPage } from './arena.page';

type PageInternals = { ctl: { tick(now: number): void; game: { sides: { hand: { kind: string }[] }[] } } };

describe('ArenaPage (chế độ chữ khi không có WebGPU)', () => {
  let fixture: ComponentFixture<ArenaPage>;
  let page: ArenaPage;
  const root = () => fixture.nativeElement as HTMLElement;
  const buttons = (selector: string) => Array.from(root().querySelectorAll<HTMLButtonElement>(selector));
  const settle = async () => { await fixture.whenStable(); fixture.detectChanges(); };

  beforeEach(async () => {
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
});
