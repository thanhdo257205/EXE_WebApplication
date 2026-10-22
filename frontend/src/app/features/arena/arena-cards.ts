/**
 * Dữ liệu 9 thẻ Pokémon mẫu (Base Set / Jungle) dùng cho sân đấu mô phỏng rút gọn.
 * Chỉ số theo thẻ in. Đây là bản mô phỏng của người hâm mộ để minh họa, không phải sản phẩm của
 * The Pokémon Company; không có tiến hóa/Huấn luyện viên/Pokémon Power trong bản rút gọn này.
 */
export type Energy = 'Fire' | 'Water' | 'Grass' | 'Lightning' | 'Psychic';
export type CostType = Energy | 'Colorless';
export type EffectId =
  | 'discard2' | 'discard1Fire' | 'hydroPump' | 'psychicPlus' | 'barrier' | 'thunderJolt'
  | 'leechSeed' | 'bubble' | 'withdraw' | 'tailWag' | 'quickAttack';

export interface AttackDef { name: string; cost: CostType[]; damage: number; text: string; effect?: EffectId }
export interface PokemonDef {
  id: string; slug: string; name: string; code: string; hp: number; type: CostType;
  weakness: Energy | null; retreat: number; attacks: AttackDef[]; poster: string;
}

const poster = (slug: string) => `/assets/cards/pokemon/${slug}-poster.webp`;

export const ARENA_POKEMON: readonly PokemonDef[] = [
  { id: 'charizard', slug: 'charizard', name: 'Charizard', code: 'BASE1-4', hp: 120, type: 'Fire', weakness: 'Water', retreat: 3, poster: poster('charizard'),
    attacks: [{ name: 'Fire Spin', cost: ['Fire', 'Fire', 'Fire', 'Fire'], damage: 100, text: 'Bỏ 2 Năng lượng khỏi Charizard.', effect: 'discard2' }] },
  { id: 'blastoise', slug: 'blastoise', name: 'Blastoise', code: 'BASE1-2', hp: 100, type: 'Water', weakness: 'Lightning', retreat: 3, poster: poster('blastoise'),
    attacks: [{ name: 'Hydro Pump', cost: ['Water', 'Water', 'Water'], damage: 40, text: '+10 cho mỗi Năng lượng Nước dư (tối đa +20).', effect: 'hydroPump' }] },
  { id: 'venusaur', slug: 'venusaur', name: 'Venusaur', code: 'BASE1-15', hp: 100, type: 'Grass', weakness: 'Fire', retreat: 2, poster: poster('venusaur'),
    attacks: [{ name: 'Solarbeam', cost: ['Grass', 'Grass', 'Grass', 'Grass'], damage: 60, text: '' }] },
  { id: 'mewtwo', slug: 'mewtwo', name: 'Mewtwo', code: 'BASE1-10', hp: 60, type: 'Psychic', weakness: 'Psychic', retreat: 3, poster: poster('mewtwo'),
    attacks: [
      { name: 'Psychic', cost: ['Psychic', 'Colorless'], damage: 10, text: '+10 cho mỗi Năng lượng trên Pokémon đối thủ.', effect: 'psychicPlus' },
      { name: 'Barrier', cost: ['Psychic', 'Psychic'], damage: 0, text: 'Bỏ 1 Năng lượng Tâm linh: chặn mọi sát thương và hiệu ứng lên Mewtwo ở lượt tới của đối thủ.', effect: 'barrier' },
    ] },
  { id: 'pikachu', slug: 'pikachu', name: 'Pikachu', code: 'BASE1-58', hp: 40, type: 'Lightning', weakness: null, retreat: 1, poster: poster('pikachu'),
    attacks: [
      { name: 'Gnaw', cost: ['Colorless'], damage: 10, text: '' },
      { name: 'Thunder Jolt', cost: ['Lightning', 'Colorless'], damage: 30, text: 'Tung đồng xu: sấp thì Pikachu tự nhận 10 sát thương.', effect: 'thunderJolt' },
    ] },
  { id: 'bulbasaur', slug: 'bulbasaur', name: 'Bulbasaur', code: 'BASE1-44', hp: 40, type: 'Grass', weakness: 'Fire', retreat: 1, poster: poster('bulbasaur'),
    attacks: [{ name: 'Leech Seed', cost: ['Grass', 'Grass'], damage: 20, text: 'Nếu gây sát thương, hồi 10 HP cho Bulbasaur.', effect: 'leechSeed' }] },
  { id: 'charmander', slug: 'charmander', name: 'Charmander', code: 'BASE1-46', hp: 50, type: 'Fire', weakness: 'Water', retreat: 1, poster: poster('charmander'),
    attacks: [
      { name: 'Scratch', cost: ['Colorless'], damage: 10, text: '' },
      { name: 'Ember', cost: ['Fire', 'Colorless'], damage: 30, text: 'Bỏ 1 Năng lượng Lửa khỏi Charmander.', effect: 'discard1Fire' },
    ] },
  { id: 'squirtle', slug: 'squirtle', name: 'Squirtle', code: 'BASE1-63', hp: 40, type: 'Water', weakness: 'Lightning', retreat: 1, poster: poster('squirtle'),
    attacks: [
      { name: 'Bubble', cost: ['Water'], damage: 10, text: 'Tung đồng xu: ngửa thì đối thủ bị Tê liệt.', effect: 'bubble' },
      { name: 'Withdraw', cost: ['Water', 'Colorless'], damage: 0, text: 'Tung đồng xu: ngửa thì chặn mọi sát thương lên Squirtle ở lượt tới của đối thủ.', effect: 'withdraw' },
    ] },
  { id: 'eevee', slug: 'eevee', name: 'Eevee', code: 'BASE2-51', hp: 50, type: 'Colorless', weakness: null, retreat: 1, poster: poster('eevee'),
    attacks: [
      { name: 'Tail Wag', cost: ['Colorless'], damage: 0, text: 'Tung đồng xu: ngửa thì Pokémon đối thủ không thể tấn công Eevee ở lượt tới.', effect: 'tailWag' },
      { name: 'Quick Attack', cost: ['Colorless', 'Colorless'], damage: 10, text: 'Tung đồng xu: ngửa thì +20 sát thương.', effect: 'quickAttack' },
    ] },
];

export const ENERGY_LABEL: Record<CostType, string> = { Fire: 'Lửa', Water: 'Nước', Grass: 'Cỏ', Lightning: 'Điện', Psychic: 'Tâm linh', Colorless: 'Vô sắc' };
/** Sắc thái Năng lượng (RGB 0..1) dùng cho shader và UI. */
export const ENERGY_RGB: Record<CostType, [number, number, number]> = {
  Fire: [1, 0.35, 0.12], Water: [0.2, 0.55, 1], Grass: [0.3, 0.85, 0.3], Lightning: [1, 0.88, 0.2], Psychic: [0.75, 0.35, 0.95], Colorless: [0.8, 0.8, 0.82],
};
/** Bộ bài mỗi bên: 9 Pokémon + 15 Năng lượng (24 lá). */
export const DECK_ENERGY: readonly Energy[] = [
  'Fire', 'Fire', 'Fire', 'Fire', 'Water', 'Water', 'Water', 'Grass', 'Grass', 'Grass', 'Grass', 'Lightning', 'Lightning', 'Psychic', 'Psychic',
];
