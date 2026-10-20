import type { PublicCard, PublicCardSet } from './public-content.service';
export const DEFAULT_CARD_MODEL = '/assets/models/default-card.glb';
export const DEFAULT_CARD_POSTER = '/assets/models/default-card-poster.webp';
export const SAMPLE_CARD_SET: PublicCardSet = {
  id: 'sample-card-set',
  slug: 'the-mau',
  sortOrder: 0,
  code: 'MẪU',
  name: 'Bộ thẻ minh họa',
  description: 'Thẻ mặc định để trải nghiệm xoay, lật và phóng to 3D.',
};
export const SAMPLE_CARD: PublicCard = {
  id: 'sample-pokemon-card',
  slug: 'pokemon-card-3d',
  sortOrder: 0,
  code: 'THẺ MẪU',
  cardSetId: SAMPLE_CARD_SET.id,
  characterId: null,
  name: 'Pokémon Card 3D',
  effectText:
    'Thẻ minh họa tương tác từ model được cung cấp. Không phải thẻ hoặc luật chính thức của Nhà Này Hơi Báo!',
  rulingNotes: null,
  ruleStatus: 'NEEDS_REVIEW',
  copiesInDeck: 1,
  artworkUrl: DEFAULT_CARD_POSTER,
};
