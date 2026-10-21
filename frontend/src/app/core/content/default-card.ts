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

export interface SampleCard extends PublicCard {
  frontTextureUrl?: string;
  sourceUrl?: string;
}

const POKEMON_SAMPLES = [
  ['charizard', 'Charizard', 'base1-4'],
  ['blastoise', 'Blastoise', 'base1-2'],
  ['venusaur', 'Venusaur', 'base1-15'],
  ['mewtwo', 'Mewtwo', 'base1-10'],
  ['pikachu', 'Pikachu', 'base1-58'],
  ['bulbasaur', 'Bulbasaur', 'base1-44'],
  ['charmander', 'Charmander', 'base1-46'],
  ['squirtle', 'Squirtle', 'base1-63'],
  ['eevee', 'Eevee', 'base2-51'],
] as const;

/** Local demonstration artwork; never mixed into a published game release. */
export const SAMPLE_CARDS: SampleCard[] = [
  SAMPLE_CARD,
  ...POKEMON_SAMPLES.map(([slug, name, sourceId], index): SampleCard => ({
    ...SAMPLE_CARD,
    id: `sample-pokemon-${slug}`,
    slug: `${slug}-3d`,
    sortOrder: index + 1,
    code: `POKÉMON · ${sourceId.toUpperCase()}`,
    name: `${name} · Pokémon TCG`,
    effectText: `${name} — thẻ Pokémon TCG dùng để minh họa xoay, lật và zoom 3D. Không thuộc bộ thẻ hoặc luật của Nhà Này Hơi Báo!`,
    artworkUrl: `/assets/cards/pokemon/${slug}-poster.webp`,
    frontTextureUrl: `/assets/cards/pokemon/${slug}.webp`,
    sourceUrl: `https://api.tcgdex.net/v2/en/cards/${sourceId}`,
  })),
];

/** Thẻ linh vật do người dùng cung cấp (ảnh Sân Trường), tách khỏi nhóm Pokémon. */
export const MASCOT_CARD: SampleCard = {
  ...SAMPLE_CARD,
  id: 'sample-linh-vat-hoang-nam',
  slug: 'linh-vat-hoang-nam',
  sortOrder: POKEMON_SAMPLES.length + 1,
  code: 'LINH VẬT · SÂN TRƯỜNG',
  name: 'Linh Vật Hoàng Nam',
  effectText: 'Thẻ minh họa linh vật Hoàng Nam để xoay, lật và zoom 3D. Không phải thẻ hoặc luật chính thức của Nhà Này Hơi Báo!',
  artworkUrl: '/assets/cards/linh-vat-hoang-nam-poster.webp',
  frontTextureUrl: '/assets/cards/linh-vat-hoang-nam.webp',
  sourceUrl: undefined,
};
SAMPLE_CARDS.push(MASCOT_CARD);

export function findSampleCard(slug: string): SampleCard | undefined {
  return SAMPLE_CARDS.find(card => card.slug === slug);
}
