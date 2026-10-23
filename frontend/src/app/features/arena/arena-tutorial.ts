import { ENERGY_LABEL, type CostType } from './arena-cards';
import { RULES, type Game } from './arena-engine';

/** Nút trên giao diện được nhấn mạnh trong một bước hướng dẫn. */
export type GuideButton = 'ready' | 'attack' | 'end' | 'retreat' | null;
/** Thẻ trong tay nên nhấn mạnh (quầng vàng trong cảnh 3D). */
export type GuideCards = 'hand-pokemon' | 'hand-energy' | 'bench' | 'none';

export interface TutorialStep {
  id: string;
  title: string;
  text: string;
  /** Bước cần người chơi bấm "Tiếp"; ngược lại tự qua khi điều kiện trong ván đấu thỏa. */
  manual: boolean;
  cards: GuideCards;
  zones: string[];
  button: GuideButton;
  /**
   * Chỗ trên bàn mà hộp thoại chỉ vào: 'center' (không chỉ), 'button' (nút bên dưới sân), 'zone:<bên>:<khu>' (0 = bạn, 1 = máy;
   * khu: active/bench/deck/discard/prize), 'hp:<bên>' (thanh HP Pokémon Chiến đấu), 'hand-pokemon'/'hand-energy' (thẻ trong tay,
   * chuyển sang ô Chiến đấu khi thẻ đã được chọn).
   */
  target: string;
  /** Nhãn nút "Tiếp" (mặc định "Tiếp"). */
  nextLabel?: string;
}

export interface TutorialContext {
  canAct: boolean;
  /** Có đòn đánh nào đang dùng được không. */
  canAttack: boolean;
  /** Loại thẻ trong tay mà người chơi đang chọn. */
  selected: 'pokemon' | 'energy' | null;
  /** Người chơi đã thực hiện ít nhất một đòn tấn công trong ván hướng dẫn. */
  attacked: boolean;
}

/** Các trường của bước có thể đổi theo trạng thái ván đấu (lời khuyên thích ứng). */
type StepOverride = Partial<Pick<TutorialStep, 'title' | 'target' | 'cards' | 'zones' | 'button'>> & { text?: string };

interface StepDef extends Omit<TutorialStep, 'text' | 'title'> {
  title: string;
  text: (game: Game, ctx: TutorialContext) => string;
  /** Tự qua khi true (chỉ với bước không manual). `anchorTurn` là số lượt lúc bước bắt đầu. */
  done?: (game: Game, ctx: TutorialContext, anchorTurn: number) => boolean;
  /** Bỏ qua hẳn bước này khi true (điều kiện để thực hiện không còn/không có). */
  skip?: (game: Game, ctx: TutorialContext) => boolean;
  /** Ghi đè nội dung/điểm chỉ theo tình huống hiện tại. */
  dyn?: (game: Game, ctx: TutorialContext) => StepOverride;
}

const costText = (cost: readonly CostType[]): string => {
  const counts = new Map<CostType, number>();
  for (const c of cost) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts].map(([type, n]) => `${n} ${ENERGY_LABEL[type]}`).join(' + ');
};
/** Mô tả đòn đánh của Pokémon Chiến đấu: "Scratch cần 1 Vô sắc (10 sát thương)". */
const attackSummary = (game: Game): string => {
  const active = game.sides[0].active;
  if (!active) return '';
  return active.def.attacks.map(a => `${a.name} cần ${costText(a.cost)}${a.damage ? ` (${a.damage} sát thương)` : ''}`).join('; ');
};

const mine = (game: Game) => game.sides[0];
const hasHandPokemon = (game: Game) => mine(game).hand.some(card => card.kind === 'pokemon');
const hasHandEnergy = (game: Game) => mine(game).hand.some(card => card.kind === 'energy');

const STEPS: StepDef[] = [
  {
    id: 'welcome', title: 'Chào mừng đến sân đấu!', manual: true, cards: 'none', zones: [], button: null, target: 'center', nextLabel: 'Bắt đầu hướng dẫn',
    text: () => 'Đây là ván đấu thẻ với máy. Hướng dẫn này mất khoảng 2 phút: mình sẽ chỉ từng chỗ trên bàn, rồi bạn đặt Pokémon, gắn Năng lượng và tấn công ngay trong ván thật. Bạn đi trước.',
  },
  {
    id: 'tour-foe', title: 'Bàn của máy', manual: true, cards: 'none', zones: ['1:active', '1:bench'], button: null, target: 'zone:1:active',
    text: () => 'Phía trên là bàn của máy: Pokémon Chiến đấu ở giữa, hàng ô phía sau là Băng ghế của nó. Lúc này chúng đang úp, sẽ lật khi trận bắt đầu. Mục tiêu của bạn: hạ gục Pokémon của máy để lấy đủ 3 Giải thưởng.',
  },
  {
    id: 'tour-active', title: 'Ô Chiến đấu của bạn', manual: true, cards: 'none', zones: ['0:active'], button: null, target: 'zone:0:active',
    text: () => 'Đây là ô Chiến đấu: Pokémon đứng ở đây là con duy nhất tấn công và bị tấn công. Mỗi người chỉ có một Pokémon Chiến đấu.',
  },
  {
    id: 'tour-bench', title: 'Băng ghế', manual: true, cards: 'none', zones: ['0:bench'], button: null, target: 'zone:0:bench',
    text: () => 'Ba ô này là Băng ghế: chỗ cho Pokémon dự bị (tối đa 3). Chúng chưa đánh được nhưng sẽ thay vào khi Pokémon Chiến đấu bị hạ gục hoặc rút lui.',
  },
  {
    id: 'tour-deck', title: 'Chồng Bài và Bỏ', manual: true, cards: 'none', zones: ['0:deck', '0:discard'], button: null, target: 'zone:0:deck',
    text: () => 'Bên phải là chồng Bài của bạn (đầu mỗi lượt bạn tự rút 1 lá) và chồng Bỏ phía trên nó (thẻ đã dùng hoặc bị hạ gục). Hết bài để rút thì thua.',
  },
  {
    id: 'tour-prize', title: 'Giải thưởng', manual: true, cards: 'none', zones: ['0:prize'], button: null, target: 'zone:0:prize',
    text: () => 'Ba lá úp bên trái là Giải thưởng. Mỗi lần hạ gục một Pokémon của máy, bạn lấy 1 lá. Lấy đủ 3 lá là bạn thắng!',
  },
  {
    id: 'place-active', title: 'Bước 1 · Đặt Pokémon Chiến đấu', manual: false, cards: 'hand-pokemon', zones: ['0:active'], button: null, target: 'hand-pokemon',
    text: () => 'Thẻ trong tay nằm ở mép dưới. Bấm thẻ Pokémon đang sáng vàng để chọn, rồi bấm lần nữa (hoặc nút "Đặt xuống bàn") để đặt nó vào ô Chiến đấu. Rê chuột lên thẻ để xem HP và đòn đánh.',
    done: game => mine(game).active !== null,
    skip: game => game.phase !== 'setup' && mine(game).active !== null,
  },
  {
    id: 'place-bench', title: 'Bước 2 · Thêm Pokémon dự bị', manual: true, cards: 'hand-pokemon', zones: ['0:bench'], button: null, target: 'zone:0:bench', nextLabel: 'Xong, tiếp tục',
    text: game => `Bạn có thể đặt thêm tối đa ${RULES.bench} Pokémon lên Băng ghế bằng cách chọn thẻ như trên. Hiện có ${mine(game).bench.length}/${RULES.bench}. Đặt thêm nếu muốn rồi bấm "Xong, tiếp tục".`,
    skip: game => game.phase !== 'setup' || !hasHandPokemon(game) && mine(game).bench.length === 0,
  },
  {
    id: 'ready', title: 'Bước 3 · Sẵn sàng', manual: false, cards: 'none', zones: [], button: 'ready', target: 'button',
    text: () => 'Máy đã đặt Pokémon của nó (đang úp, sẽ lật khi trận bắt đầu). Bấm nút "Sẵn sàng — bắt đầu trận" bên dưới sân.',
    done: game => game.phase !== 'setup',
  },
  {
    id: 'wait', title: 'Chờ một chút…', manual: false, cards: 'none', zones: [], button: null, target: 'center',
    text: () => 'Lượt của máy đang diễn ra. Khi tới lượt bạn, bạn sẽ tự động rút 1 lá từ chồng Bài.',
    done: game => game.phase === 'over' || game.phase === 'promote' || (game.phase === 'main' && game.turn === 0),
  },
  {
    id: 'hp', title: 'HP và Năng lượng', manual: true, cards: 'none', zones: ['0:active', '1:active'], button: null, target: 'hp:0',
    text: () => 'Thanh màu phía trên thẻ là HP còn lại (xanh → vàng → đỏ); những quả cầu màu dưới thẻ là Năng lượng đã gắn. Số chính xác nằm ở "Bảng theo dõi" bên phải. Pokémon hết HP sẽ bị hạ gục.',
  },
  {
    id: 'energy-intro', title: 'Năng lượng dùng để làm gì?', manual: true, cards: 'none', zones: ['0:active'], button: null, target: 'zone:0:active',
    text: game => {
      const active = mine(game).active;
      return `Muốn tấn công, Pokémon phải có đủ Năng lượng đã gắn. ${active ? `Pokémon của bạn là ${active.def.name}: ${attackSummary(game)}.` : ''} "Vô sắc" dùng thẻ Năng lượng loại nào cũng được; các hệ còn lại phải đúng loại. Hiện đã gắn ${active?.energy.length ?? 0}.`;
    },
  },
  {
    id: 'attach', title: 'Bước 4 · Gắn Năng lượng', manual: false, cards: 'hand-energy', zones: [], button: null, target: 'hand-energy',
    text: () => 'Mỗi lượt gắn được 1 Năng lượng. Bấm một thẻ Năng lượng đang sáng vàng ở mép dưới để chọn nó.',
    dyn: (_game, ctx) => ctx.selected === 'energy'
      ? { title: 'Bước 4 · Chọn Pokémon để gắn', text: 'Thẻ Năng lượng đã được chọn (nâng lên). Giờ bấm Pokémon Chiến đấu của bạn (chỗ có vòng sáng) để gắn. Đừng bấm vào thẻ khác: Năng lượng sẽ hiện thành quả cầu dưới Pokémon.', target: 'zone:0:active', cards: 'none', zones: ['0:active'] }
      : {},
    done: game => game.attached || game.phase !== 'main' || game.turn !== 0,
    skip: game => game.phase === 'main' && game.turn === 0 && !game.attached && !hasHandEnergy(game),
  },
  {
    id: 'first-attack', title: 'Bước 5 · Tấn công!', manual: false, cards: 'none', zones: [], button: null, target: 'center',
    text: () => 'Hãy thực hiện đòn tấn công đầu tiên.',
    dyn: (game, ctx) => {
      if (game.phase !== 'main' || game.turn !== 0 || !ctx.canAct) return { title: 'Chờ tới lượt bạn…', text: 'Máy đang đi lượt của nó. Khi tới lượt bạn, mình sẽ hướng dẫn bạn tấn công.', target: 'center' };
      if (game.turnNumber === 1) return { title: 'Kết thúc lượt đầu', text: 'Người đi trước không được tấn công ở lượt đầu. Bấm "Kết thúc lượt" bên dưới sân để sang lượt của máy; lượt sau bạn sẽ được tấn công!', target: 'button', button: 'end' };
      if (ctx.canAttack) return { title: 'Bước 5 · Tấn công!', text: 'Pokémon của bạn đã đủ Năng lượng. Bấm một nút đòn đánh bên dưới sân (đang nhấp nháy) để tấn công Pokémon Chiến đấu của máy. Tấn công xong là hết lượt.', target: 'button', button: 'attack', zones: ['1:active'] };
      if (!game.attached && hasHandEnergy(game)) {
        return ctx.selected === 'energy'
          ? { title: 'Gắn thêm Năng lượng', text: 'Bấm Pokémon Chiến đấu của bạn (chỗ có vòng sáng) để gắn thẻ Năng lượng vừa chọn.', target: 'zone:0:active', zones: ['0:active'] }
          : { title: 'Gắn thêm Năng lượng', text: `Chưa đủ Năng lượng để đánh (${attackSummary(game)}). Bấm một thẻ Năng lượng sáng vàng, rồi bấm Pokémon Chiến đấu để gắn thêm.`, target: 'hand-energy', cards: 'hand-energy' };
      }
      return { title: 'Chưa đủ Năng lượng', text: `Chưa đủ Năng lượng cho đòn nào (${attackSummary(game)}). Bấm "Kết thúc lượt"; lượt sau bạn rút thêm bài, gắn Năng lượng rồi tấn công.`, target: 'button', button: 'end' };
    },
    done: (game, ctx) => ctx.attacked || game.phase === 'over',
  },
  {
    id: 'after-attack', title: 'Đòn đầu tiên!', manual: true, cards: 'none', zones: ['1:active'], button: null, target: 'hp:1',
    text: () => 'Bạn vừa tấn công! Xem thanh HP của Pokémon máy giảm đi, con số sát thương hiện ngay trên thẻ. Pokémon nào hết HP bị hạ gục và bạn lấy 1 Giải thưởng. Máy cũng sẽ phản công, hãy theo dõi HP của bạn.',
  },
  {
    id: 'weakness', title: 'Điểm yếu', manual: true, cards: 'none', zones: [], button: null, target: 'center',
    text: () => 'Mỗi Pokémon có một hệ "Yếu" (xem trong bảng Xem thẻ). Bị đánh bằng đúng hệ đó thì sát thương nhân đôi: Lửa thắng Cỏ, Nước thắng Lửa, Điện thắng Nước. Hãy chọn Pokémon Chiến đấu phù hợp với đối thủ.',
  },
  {
    id: 'retreat', title: 'Rút lui', manual: true, cards: 'none', zones: ['0:bench'], button: 'retreat', target: 'button', nextLabel: 'Hiểu rồi',
    text: () => 'Pokémon yếu thế có thể "Rút lui" (nút bên dưới sân): bỏ bớt Năng lượng bằng chi phí rút lui rồi đổi cho Pokémon trên Băng ghế, một lần mỗi lượt. Khi Pokémon Chiến đấu của bạn bị hạ gục, bạn cũng phải chọn Pokémon băng ghế lên thay.',
  },
  {
    id: 'finish', title: 'Hoàn tất hướng dẫn!', manual: true, cards: 'none', zones: [], button: null, target: 'center', nextLabel: 'Chơi tiếp',
    text: () => 'Bạn đã nắm vòng chơi: đặt → gắn Năng lượng → tấn công. Hạ gục đủ 3 Pokémon của máy là thắng. Hãy tiếp tục ván này, hoặc bấm "Ván mới" bất cứ lúc nào. Muốn xem lại hướng dẫn thì bấm nút "Hướng dẫn".',
  },
];

const READY_INDEX = STEPS.findIndex(step => step.id === 'ready');

/** Bước đặc biệt khi người chơi phải chọn Pokémon thay thế (xen vào bất kỳ lúc nào). */
const PROMOTE_STEP: TutorialStep = {
  id: 'promote', title: 'Chọn Pokémon thay thế', manual: false, cards: 'bench', zones: ['0:bench'], button: null, target: 'zone:0:bench',
  text: 'Pokémon Chiến đấu của bạn đã bị hạ gục. Bấm một Pokémon trên Băng ghế (đang sáng) để đưa nó lên Chiến đấu.',
};

export interface TutorialView extends TutorialStep { index: number; total: number }

/**
 * Điều phối hướng dẫn từng bước. Bước "tự động" tiến theo trạng thái ván đấu thật (người chơi làm đúng việc là qua),
 * bước "manual" chờ bấm "Tiếp". Không chặn thao tác: người chơi làm khác đi thì hướng dẫn tự bắt kịp hoặc bỏ qua bước.
 */
export class Tutorial {
  private index = 0;
  private anchorTurn = 0;
  private running = false;
  private finished = false;

  get active(): boolean { return this.running; }
  get completed(): boolean { return this.finished; }
  get total(): number { return STEPS.length; }

  start(): void { this.index = 0; this.anchorTurn = 0; this.running = true; this.finished = false; }
  stop(): void { this.running = false; }

  /** Qua bước manual hiện tại; trả về true nếu hướng dẫn vừa kết thúc. */
  next(game: Game): boolean {
    if (!this.running) return false;
    this.index++;
    this.anchorTurn = game.turnNumber;
    if (this.index >= STEPS.length) { this.running = false; this.finished = true; return true; }
    return false;
  }

  /** Bước hiện tại sau khi tự tiến theo trạng thái; null khi hướng dẫn không chạy/đã xong. */
  current(game: Game, ctx: TutorialContext): TutorialView | null {
    if (!this.running) return null;
    if (game.phase === 'promote' && game.pending[0] === 0 && this.index >= READY_INDEX) return { ...PROMOTE_STEP, index: this.index, total: STEPS.length };
    for (let guard = 0; guard < STEPS.length && this.index < STEPS.length; guard++) {
      const step = STEPS[this.index];
      const skip = step.skip?.(game, ctx) ?? false;
      const done = !step.manual && (step.done?.(game, ctx, this.anchorTurn) ?? false);
      if (!skip && !done) break;
      this.index++;
      this.anchorTurn = game.turnNumber;
    }
    if (this.index >= STEPS.length) { this.running = false; this.finished = true; return null; }
    const step = STEPS[this.index], over = step.dyn?.(game, ctx) ?? {};
    return {
      id: step.id, title: over.title ?? step.title, text: over.text ?? step.text(game, ctx), manual: step.manual, cards: over.cards ?? step.cards,
      zones: over.zones ?? step.zones, button: over.button ?? step.button, target: over.target ?? step.target, nextLabel: step.nextLabel, index: this.index, total: STEPS.length,
    };
  }
}
