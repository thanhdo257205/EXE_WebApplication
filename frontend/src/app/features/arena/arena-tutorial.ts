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
  /** Nhãn nút "Tiếp" (mặc định "Tiếp"). */
  nextLabel?: string;
}

export interface TutorialContext {
  canAct: boolean;
  /** Có đòn đánh nào đang dùng được không. */
  canAttack: boolean;
}

interface StepDef extends Omit<TutorialStep, 'text' | 'title'> {
  title: string;
  text: (game: Game, ctx: TutorialContext) => string;
  /** Tự qua khi true (chỉ với bước không manual). `anchorTurn` là số lượt lúc bước bắt đầu. */
  done?: (game: Game, ctx: TutorialContext, anchorTurn: number) => boolean;
  /** Bỏ qua hẳn bước này khi true (điều kiện để thực hiện không còn/không có). */
  skip?: (game: Game, ctx: TutorialContext) => boolean;
}

const mine = (game: Game) => game.sides[0];
const hasHandPokemon = (game: Game) => mine(game).hand.some(card => card.kind === 'pokemon');
const hasHandEnergy = (game: Game) => mine(game).hand.some(card => card.kind === 'energy');

const STEPS: StepDef[] = [
  {
    id: 'welcome', title: 'Chào mừng đến sân đấu!', manual: true, cards: 'none', zones: [], button: null, nextLabel: 'Bắt đầu hướng dẫn',
    text: () => 'Đây là ván đấu thẻ với máy. Hướng dẫn này mất khoảng 2 phút: bạn sẽ đặt Pokémon, gắn Năng lượng và tấn công ngay trong ván thật. Bạn đi trước.',
  },
  {
    id: 'board', title: 'Làm quen với sân', manual: true, cards: 'none', zones: ['0:active', '0:bench', '0:deck', '0:discard', '0:prize', '1:active', '1:bench'], button: null,
    text: () => 'Bàn của bạn ở phía dưới, của máy ở phía trên. Giữa sân là ô Chiến đấu (Pokémon đang đánh nhau), hàng ô nhỏ là Băng ghế (chỗ dự bị, tối đa 3). Bên phải là chồng Bài và Bỏ, bên trái là Giải thưởng. Mục tiêu: hạ gục Pokémon của máy để lấy đủ 3 Giải thưởng.',
  },
  {
    id: 'place-active', title: 'Bước 1 · Đặt Pokémon Chiến đấu', manual: false, cards: 'hand-pokemon', zones: ['0:active'], button: null,
    text: () => 'Thẻ trong tay nằm ở mép dưới. Bấm một thẻ Pokémon (đang sáng vàng) để chọn, rồi bấm lần nữa hoặc nút "Đặt xuống bàn" để đặt nó làm Pokémon Chiến đấu. Rê chuột lên thẻ để xem HP và đòn đánh.',
    done: game => mine(game).active !== null,
    skip: game => game.phase !== 'setup' && mine(game).active !== null,
  },
  {
    id: 'place-bench', title: 'Bước 2 · Thêm Pokémon dự bị', manual: true, cards: 'hand-pokemon', zones: ['0:bench'], button: null, nextLabel: 'Xong, tiếp tục',
    text: game => `Bạn có thể đặt thêm tối đa ${RULES.bench} Pokémon lên Băng ghế. Chúng chưa đánh được nhưng sẵn sàng thay khi Pokémon Chiến đấu bị hạ gục. Hiện có ${mine(game).bench.length}/${RULES.bench}. Đặt thêm nếu muốn rồi bấm "Xong, tiếp tục".`,
    skip: game => game.phase !== 'setup' || !hasHandPokemon(game) && mine(game).bench.length === 0,
  },
  {
    id: 'ready', title: 'Bước 3 · Sẵn sàng', manual: false, cards: 'none', zones: [], button: 'ready',
    text: () => 'Máy đã đặt Pokémon của nó (đang úp, sẽ lật khi trận bắt đầu). Bấm nút "Sẵn sàng — bắt đầu trận" ở dưới sân.',
    done: game => game.phase !== 'setup',
  },
  {
    id: 'wait', title: 'Chờ một chút…', manual: false, cards: 'none', zones: [], button: null,
    text: () => 'Lượt của máy đang diễn ra. Khi tới lượt bạn, bạn sẽ tự động rút 1 lá từ chồng Bài.',
    done: game => game.phase === 'over' || game.phase === 'promote' || (game.phase === 'main' && game.turn === 0),
  },
  {
    id: 'hp', title: 'HP và Năng lượng', manual: true, cards: 'none', zones: ['0:active', '1:active'], button: null,
    text: () => 'Thanh màu phía trên thẻ là HP còn lại (xanh → vàng → đỏ). Những quả cầu màu dưới thẻ là Năng lượng đã gắn. Số chính xác nằm ở "Bảng theo dõi" bên phải. Pokémon hết HP sẽ bị hạ gục.',
  },
  {
    id: 'attach', title: 'Bước 4 · Gắn Năng lượng', manual: false, cards: 'hand-energy', zones: ['0:active'], button: null,
    text: () => 'Mỗi lượt bạn được gắn 1 Năng lượng. Bấm một thẻ Năng lượng (đang sáng vàng), rồi bấm Pokémon của bạn để gắn. Đòn đánh cần đủ Năng lượng đúng hệ; ô "Vô sắc" dùng loại nào cũng được.',
    done: game => game.attached || game.phase !== 'main' || game.turn !== 0,
    skip: game => game.phase === 'main' && game.turn === 0 && !game.attached && !hasHandEnergy(game),
  },
  {
    id: 'attack', title: 'Bước 5 · Tấn công hoặc kết thúc lượt', manual: false, cards: 'none', zones: ['1:active'], button: 'attack',
    text: (game, ctx) => game.turnNumber === 1
      ? 'Người đi trước không được tấn công ở lượt đầu, nên hãy bấm "Kết thúc lượt". Từ lượt sau bạn sẽ có nút đòn đánh sáng lên khi đủ Năng lượng.'
      : ctx.canAttack
        ? 'Nút đòn đánh bên dưới sân đã sáng lên: bấm để tấn công Pokémon của máy. Tấn công xong là hết lượt.'
        : 'Chưa đủ Năng lượng cho đòn nào (xem chi phí trên nút). Hãy bấm "Kết thúc lượt"; lượt sau gắn thêm Năng lượng rồi tấn công.',
    done: (game, _ctx, anchor) => game.turnNumber !== anchor || game.phase === 'over' || game.phase === 'promote',
    skip: game => game.phase === 'over',
  },
  {
    id: 'weakness', title: 'Điểm yếu', manual: true, cards: 'none', zones: [], button: null,
    text: () => 'Mỗi Pokémon có một hệ "Yếu" (xem trong bảng Xem thẻ). Bị đánh bằng đúng hệ đó thì sát thương nhân đôi: Lửa thắng Cỏ, Nước thắng Lửa, Điện thắng Nước. Hãy chọn Pokémon Chiến đấu phù hợp với đối thủ.',
  },
  {
    id: 'retreat', title: 'Rút lui và Giải thưởng', manual: true, cards: 'none', zones: ['0:bench', '0:prize'], button: 'retreat', nextLabel: 'Hiểu rồi',
    text: () => 'Pokémon yếu thế có thể "Rút lui": bỏ bớt Năng lượng bằng chi phí rút lui rồi đổi cho Pokémon trên Băng ghế (một lần mỗi lượt). Khi hạ gục một Pokémon của máy bạn lấy 1 Giải thưởng; đủ 3 là thắng. Khi Pokémon Chiến đấu của bạn bị hạ gục, bạn phải chọn Pokémon băng ghế lên thay.',
  },
  {
    id: 'finish', title: 'Hoàn tất hướng dẫn!', manual: true, cards: 'none', zones: [], button: null, nextLabel: 'Chơi tiếp',
    text: () => 'Bạn đã nắm được vòng chơi: đặt → gắn Năng lượng → tấn công. Hãy tiếp tục ván này, hoặc bấm "Ván mới" bất cứ lúc nào. Muốn xem lại hướng dẫn thì bấm nút "Hướng dẫn".',
  },
];

/** Bước đặc biệt khi người chơi phải chọn Pokémon thay thế (xen vào bất kỳ lúc nào). */
const PROMOTE_STEP: TutorialStep = {
  id: 'promote', title: 'Chọn Pokémon thay thế', manual: false, cards: 'bench', zones: ['0:bench'], button: null,
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
    if (game.phase === 'promote' && game.pending[0] === 0 && this.index > 3) return { ...PROMOTE_STEP, index: this.index, total: STEPS.length };
    for (let guard = 0; guard < STEPS.length && this.index < STEPS.length; guard++) {
      const step = STEPS[this.index];
      const skip = step.skip?.(game, ctx) ?? false;
      const done = !step.manual && (step.done?.(game, ctx, this.anchorTurn) ?? false);
      if (!skip && !done) break;
      this.index++;
      this.anchorTurn = game.turnNumber;
    }
    if (this.index >= STEPS.length) { this.running = false; this.finished = true; return null; }
    const step = STEPS[this.index];
    return { id: step.id, title: step.title, text: step.text(game, ctx), manual: step.manual, cards: step.cards, zones: step.zones, button: step.button, nextLabel: step.nextLabel, index: this.index, total: STEPS.length };
  }
}
