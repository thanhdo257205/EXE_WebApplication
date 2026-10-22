import { describe, expect, it } from 'vitest';
import { AI_THINK_SECONDS, ArenaController, inspect, type Presenter } from './arena-controller';
import { mulberry32, newGame, type Game, type GameEvent } from './arena-engine';
import { aiNext } from './arena-ai';

class FakePresenter implements Presenter {
  resets = 0; steps: { events: readonly GameEvent[]; game: Game }[] = [];
  constructor(private readonly seconds = 0.5) {}
  reset() { this.resets++; }
  present(events: readonly GameEvent[], game: Game) { this.steps.push({ events, game }); return this.seconds; }
}

function setup(seed = 11, seconds = 0.5) {
  const presenter = new FakePresenter(seconds);
  let changes = 0;
  const ctl = new ArenaController(presenter, () => changes++, seed);
  ctl.start(seed);
  return { ctl, presenter, changes: () => changes };
}

/** Người chơi tự động dùng cùng AI để chơi hết ván, tick theo thời gian giả. */
function playOut(ctl: ArenaController, rng: () => number, limit = 6000) {
  let now = 0;
  for (let i = 0; i < limit && ctl.displayed.phase !== 'over'; i++) {
    now += 0.2; ctl.tick(now);
    if (ctl.canAct()) {
      const g = ctl.game;
      if (g.phase === 'setup') {
        const me = g.sides[0], place = me.hand.findIndex(c => c.kind === 'pokemon');
        ctl.act(place < 0 || (me.active && me.bench.length >= 1) ? { t: 'ready' } : { t: 'place', hand: place });
      } else ctl.act(aiNext(g, rng, 0));
    }
  }
  return now;
}

describe('ArenaController', () => {
  it('bắt đầu ván: đặt lại cảnh, ghi nhật ký và cho phép chuẩn bị', () => {
    const { ctl, presenter, changes } = setup();
    expect(presenter.resets).toBe(1); expect(changes()).toBeGreaterThan(0);
    expect(ctl.log.length).toBeGreaterThan(0);
    expect(ctl.game.phase).toBe('setup'); expect(ctl.canAct()).toBe(true);
  });

  it('hành động hợp lệ xếp hàng, khóa thao tác trong lúc trình bày rồi mở lại', () => {
    const { ctl, presenter } = setup();
    const place = ctl.game.sides[0].hand.findIndex(c => c.kind === 'pokemon');
    expect(ctl.act({ t: 'place', hand: place })).toBeNull();
    expect(ctl.canAct()).toBe(false);          // còn bước chờ
    ctl.tick(1);                                // bước được trình bày
    expect(presenter.steps).toHaveLength(1);
    expect(ctl.displayed.sides[0].active).not.toBeNull();
    expect(ctl.canAct()).toBe(false);           // đang giữ trong thời lượng trình bày
    ctl.tick(1.2); expect(ctl.canAct()).toBe(false);
    ctl.tick(1.6); expect(ctl.canAct()).toBe(true);
  });

  it('hành động sai luật trả lý do tiếng Việt, ghi vào nhật ký và không đổi trạng thái', () => {
    const { ctl } = setup();
    const before = ctl.game;
    const reason = ctl.act({ t: 'ready' });
    expect(reason).toContain('Pokémon Chiến đấu');
    expect(ctl.game).toBe(before);
    expect(ctl.log.at(-1)).toBe(reason);
  });

  it('máy chỉ đi sau thời gian suy nghĩ và mỗi hành động là một bước riêng', () => {
    const { ctl, presenter } = setup(5, 0.1);
    const g = ctl.game;
    const place = g.sides[0].hand.findIndex(c => c.kind === 'pokemon');
    ctl.act({ t: 'place', hand: place }); ctl.tick(0.1); ctl.tick(1);
    ctl.act({ t: 'ready' }); ctl.tick(2); ctl.tick(3);
    // Nếu đến lượt máy: trước thời gian suy nghĩ chưa có bước mới.
    if (ctl.game.turn === 1) {
      const steps = presenter.steps.length;
      ctl.tick(10); expect(presenter.steps.length).toBe(steps);
      ctl.tick(10 + AI_THINK_SECONDS + 0.01); ctl.tick(11 + AI_THINK_SECONDS); expect(presenter.steps.length).toBeGreaterThan(steps);
    } else expect(ctl.canAct() || ctl.busy).toBe(true);
  });

  it('chơi trọn nhiều ván với máy: luôn kết thúc, trạng thái hiển thị khớp trạng thái chuẩn', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { ctl } = setup(seed, 0);
      playOut(ctl, mulberry32(seed + 100));
      expect(ctl.displayed.phase).toBe('over');
      expect(ctl.displayed.winner).not.toBeNull();
      expect(ctl.log.join('\n')).toMatch(/Giải thưởng|không còn Pokémon|hết bài/);
    }
  });

  it('ván mới xóa nhật ký và hàng đợi', () => {
    const { ctl, presenter } = setup(7);
    ctl.act({ t: 'place', hand: ctl.game.sides[0].hand.findIndex(c => c.kind === 'pokemon') });
    ctl.start(8);
    expect(presenter.resets).toBe(2); expect(ctl.busy).toBe(false); expect(ctl.game.sides[0].active).toBeNull();
  });
});

describe('inspect', () => {
  it('mô tả Pokémon trên bàn, thẻ trong tay và ẩn thẻ úp của máy khi chuẩn bị', () => {
    const { game } = newGame(mulberry32(2));
    const mine = game.sides[0].hand.find(c => c.kind === 'pokemon')!;
    const info = inspect(game, mine.uid)!;
    expect(info.hp).toBeGreaterThan(0); expect(info.attacks.length).toBeGreaterThan(0); expect(info.hidden).toBe(false);
    const hidden = inspect(game, game.sides[1].active!.uid)!;
    expect(hidden.hidden).toBe(true); expect(hidden.name).toBe('Thẻ úp');
    const energy = game.sides[0].hand.find(c => c.kind === 'energy');
    if (energy) expect(inspect(game, energy.uid)!.name).toContain('Năng lượng');
    expect(inspect(game, 99999)).toBeNull();
  });
});
