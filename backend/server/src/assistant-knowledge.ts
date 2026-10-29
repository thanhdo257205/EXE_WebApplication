// Retrieval over the currently published release. Only public, already-published content is
// ever sent to an AI provider; drafts, users, orders and feedback never enter this module.
import type { Client } from '@libsql/client';
import { batchRead, type Row } from './db.ts';

export type KnowledgeKind = 'site' | 'release' | 'wiki' | 'card' | 'character' | 'set';
export interface KnowledgeDocument {
  id: string;
  kind: KnowledgeKind;
  title: string;
  text: string;
  url: string;
  normalized: string;
  tokens: Map<string, number>;
  titleTokens: Set<string>;
}
export interface PublishedKnowledge {
  releaseId: string;
  versionLabel: string;
  releaseTitle: string;
  documents: KnowledgeDocument[];
  frequency: Map<string, number>;
}
export interface RetrievedContext {
  documents: KnowledgeDocument[];
  context: string;
  sources: { title: string; url: string }[];
  /** Documents that matched at least one keyword, before the context budget capped the selection. */
  considered: number;
}

// Vietnamese diacritics are stripped so "cách chơi", "cach choi" and mixed typing retrieve the same content.
// Stopwords are matched on the accented form first: "thế" is noise but "thẻ" is a content word, and both
// normalize to "the".
const words = (value: string): string[] => value.replace(/\bboardgame\b/gi, 'board game').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
const stripMarks = (token: string): string => token.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');
export const normalizeVietnamese = (value: string): string => stripMarks(value.replace(/\bboardgame\b/gi, 'board game').toLowerCase());
const STOPWORDS = new Set([
  'là', 'của', 'và', 'có', 'cho', 'nào', 'gì', 'khi', 'một', 'các', 'những', 'tôi', 'mình', 'bạn', 'ở', 'thì', 'mà',
  'để', 'với', 'này', 'đó', 'đấy', 'như', 'thế', 'hay', 'muốn', 'cần', 'không', 'rồi', 'ạ', 'cũng', 'sẽ', 'đã',
  'đang', 'bởi', 'vì', 'nên', 'nếu', 'từ', 'đến', 'rất', 'chỉ', 'vậy', 'ai', 'bao', 'nhiêu', 'nhé', 'nha',
]);
const significant = (token: string): boolean => token.length > 1 || /\d/.test(token);
export const tokenize = (value: string): string[] => words(value).filter(token => !STOPWORDS.has(token)).map(stripMarks).filter(significant);

const document = (kind: KnowledgeKind, id: string, title: string, text: string, url: string): KnowledgeDocument => {
  const tokens = new Map<string, number>();
  for (const token of tokenize(`${title} ${text}`)) {
    if (significant(token)) tokens.set(token, (tokens.get(token) ?? 0) + 1);
  }
  return {
    id, kind, title, text, url,
    normalized: normalizeVietnamese(`${title} ${text}`),
    tokens,
    titleTokens: new Set(tokenize(title).filter(significant)),
  };
};

function splitLong(text: string, limit: number): string[] {
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n', limit);
    if (cut < limit * 0.4) cut = rest.lastIndexOf(' ', limit);
    if (cut < limit * 0.4) cut = limit;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}
/** Wiki bodies are split at paragraph boundaries so one long page cannot crowd out every other source. */
export function chunkMarkdown(markdown: string, limit = 1_200): string[] {
  const blocks = markdown.replace(/\r/g, '').split(/\n{2,}/).map(block => block.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const block of blocks) {
    for (const piece of splitLong(block, limit)) {
      if (current && current.length + piece.length + 2 > limit) { chunks.push(current); current = ''; }
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

const ruleLabel = (value: string): string => value === 'CONFIRMED' ? 'đã xác nhận' : 'cần duyệt lại';

// Mirrors the settled facts in frontend/src/app/shared/game-facts.ts; card/character/set counts come from the release itself.
const siteText = (cards: number, characters: number, sets: number): string => [
  'Nhà Này Hơi Báo! là board game tương tác xã hội thuộc thương hiệu Chưa Giàu Đã Lớn, lấy bối cảnh đời sống sinh viên Việt Nam lần đầu tự lập.',
  `Một ván dành cho 4 người, chọn từ 8 nhân vật (4 nam, 4 nữ). Bản nội dung đang phát hành có ${cards} thẻ thuộc ${sets} bộ. Thời lượng thiết kế 40–60 phút; mục tiêu học luật trong 15 phút với Quick Start.`,
  'Mỗi tháng, mỗi người giữ một mục tiêu cá nhân bí mật. Mọi lựa chọn đều có giá bằng Tiền hoặc Sức.',
  'Cuối tháng cả nhà trả hóa đơn bằng Quỹ Chung: mỗi người góp kín 0–4 Tiền, hóa đơn cơ bản 8 Tiền; thiếu quỹ thì Nhà Chung mất Tim.',
  'Người chơi được thương lượng, mặc cả và hứa hẹn, nhưng lời hứa suông không được luật bảo vệ. Nhà càng yếu, chi phí tháng sau càng có thể tăng.',
  'Các mục trên website: Wiki luật (/wiki), Hướng dẫn cách chơi (/cach-choi), Thư viện thẻ (/thu-vien), Hồ sơ cư dân (/cu-dan), Quỹ nhà chung (/quy-nha), Sân đấu mô phỏng (/san-dau), Cửa hàng (/cua-hang).',
  `Số liệu nội dung đang phát hành: ${characters} nhân vật, ${cards} thẻ, ${sets} bộ thẻ.`,
].join('\n');

/** Loads the current published release and flattens it into retrievable documents. */
export async function loadKnowledge(db: Client): Promise<PublishedKnowledge | null> {
  const current = "(SELECT id FROM content_releases WHERE current_slot=1 AND status='PUBLISHED' AND published_at IS NOT NULL)";
  const [releases, wikis, cards, characters, sets] = await batchRead(db, [
    { sql: 'SELECT id,version_label,title,release_notes,published_at FROM content_releases WHERE current_slot=1 AND status=\'PUBLISHED\' AND published_at IS NOT NULL' },
    { sql: `SELECT i.slug,i.page_type,r.title,r.summary,r.body_markdown FROM wiki_page_revisions r JOIN wiki_pages i ON i.id=r.page_id WHERE r.release_id=${current} ORDER BY r.sort_order,i.id` },
    { sql: `SELECT g.slug,g.code AS card_code,cs.code AS set_code,sr.name AS set_name,ch.code AS character_code,cr.name AS character_name,r.name,r.effect_text,r.ruling_notes,r.rule_status,r.copies_in_deck FROM card_revisions r JOIN game_cards g ON g.id=r.card_id JOIN card_set_revisions sr ON sr.card_set_id=r.card_set_id AND sr.release_id=r.release_id JOIN card_sets cs ON cs.id=sr.card_set_id LEFT JOIN character_revisions cr ON cr.character_id=r.character_id AND cr.release_id=r.release_id LEFT JOIN game_characters ch ON ch.id=cr.character_id WHERE r.release_id=${current} ORDER BY r.sort_order,g.id` },
    { sql: `SELECT i.slug,i.code,r.name,r.biography,r.ability_text FROM character_revisions r JOIN game_characters i ON i.id=r.character_id WHERE r.release_id=${current} ORDER BY r.sort_order,i.id` },
    { sql: `SELECT i.slug,i.code,r.name,r.description FROM card_set_revisions r JOIN card_sets i ON i.id=r.card_set_id WHERE r.release_id=${current} ORDER BY r.sort_order,i.id` },
  ]);
  const release: Row | undefined = releases[0];
  if (!release) return null;

  const documents: KnowledgeDocument[] = [];
  documents.push(document('site', 'site', 'Giới thiệu dự án Nhà Này Hơi Báo!', siteText(cards.length, characters.length, sets.length), '/'));
  documents.push(document('release', release.id, `Bản phát hành ${release.version_label}: ${release.title}`,
    [release.release_notes ? `Ghi chú phát hành: ${release.release_notes}` : '', `Ngày phát hành: ${release.published_at}.`].filter(Boolean).join('\n'), '/wiki'));

  for (const page of wikis) {
    const chunks = chunkMarkdown(page.body_markdown);
    chunks.forEach((chunk, index) => {
      const summary = index === 0 && page.summary ? `Tóm tắt: ${page.summary}\n\n` : '';
      documents.push(document('wiki', `${page.slug}#${index}`, `${page.title}${index ? ` (phần ${index + 1})` : ''}`,
        `${summary}${chunk}\n\nLoại bài: ${page.page_type}.`, `/wiki/${page.slug}`));
    });
  }
  for (const card of cards) {
    documents.push(document('card', card.card_code, `Thẻ ${card.name} (${card.card_code})`,
      [
        `Mã thẻ: ${card.card_code}. Bộ: ${card.set_name} (${card.set_code}). Nhân vật: ${card.character_name ?? 'không gắn nhân vật'}. Số bản trong bộ: ${card.copies_in_deck}.`,
        `Hiệu ứng: ${card.effect_text}`,
        card.ruling_notes ? `Ghi chú luật: ${card.ruling_notes}` : '',
        `Trạng thái luật: ${ruleLabel(card.rule_status)}.`,
      ].filter(Boolean).join('\n'), `/thu-vien/${card.slug}`));
  }
  for (const character of characters) {
    documents.push(document('character', character.code, `Nhân vật ${character.name} (${character.code})`,
      [`Tiểu sử: ${character.biography}`, character.ability_text ? `Kỹ năng: ${character.ability_text}` : ''].filter(Boolean).join('\n'), `/cu-dan/${character.slug}`));
  }
  for (const set of sets) {
    documents.push(document('set', set.code, `Bộ thẻ ${set.name} (${set.code})`,
      set.description ? `Mô tả: ${set.description}` : `Bộ thẻ ${set.name}.`, '/thu-vien'));
  }

  const frequency = new Map<string, number>();
  for (const entry of documents) for (const token of entry.tokens.keys()) frequency.set(token, (frequency.get(token) ?? 0) + 1);
  return { releaseId: release.id, versionLabel: release.version_label, releaseTitle: release.title, documents, frequency };
}

const MAX_DOCUMENTS = 6;
const MAX_DOCUMENT_CHARS = 1_400;
const MAX_CONTEXT_CHARS = 4_200;

/** Lexical ranking with inverse document frequency; the published corpus is small enough that embeddings are unnecessary. */
export function retrieve(knowledge: PublishedKnowledge, question: string): RetrievedContext {
  const tokens = [...new Set(tokenize(question).filter(significant))].slice(0, 12);
  const phrase = tokens.join(' ');
  const ranked: { doc: KnowledgeDocument; score: number }[] = [];
  for (const doc of knowledge.documents) {
    let score = 0, matched = 0;
    for (const token of tokens) {
      const count = doc.tokens.get(token) ?? 0;
      const inTitle = doc.titleTokens.has(token);
      if (!count && !inTitle) continue;
      matched++;
      const weight = Math.log(1 + knowledge.documents.length / (1 + (knowledge.frequency.get(token) ?? 0)));
      score += (inTitle ? 8 : 0) + Math.min(count, 5) * (1 + weight);
    }
    if (!matched) continue;
    if (tokens.length > 1 && doc.normalized.includes(phrase)) score += 8;
    if (doc.kind === 'wiki' || doc.kind === 'site') score *= 1.15;
    ranked.push({ doc, score });
  }
  ranked.sort((a, b) => b.score - a.score);
  let selected = ranked.slice(0, MAX_DOCUMENTS).map(entry => entry.doc);
  if (!selected.length) selected = knowledge.documents.filter(doc => doc.kind === 'site' || doc.kind === 'wiki').slice(0, MAX_DOCUMENTS);

  const documents: KnowledgeDocument[] = [];
  const sources: { title: string; url: string }[] = [];
  const blocks: string[] = [];
  const considered = ranked.length;
  let total = 0;
  for (const doc of selected) {
    const text = doc.text.length > MAX_DOCUMENT_CHARS ? `${doc.text.slice(0, MAX_DOCUMENT_CHARS - 3)}...` : doc.text;
    const block = `[${documents.length + 1}] ${doc.title}\nNguồn: ${doc.url}\n${text}`;
    if (total + block.length > MAX_CONTEXT_CHARS) break;
    documents.push(doc);
    blocks.push(block);
    total += block.length + 2;
    // Keep sources 1:1 with the numbered documents so a [n] citation points at the same UI entry.
    sources.push({ title: doc.title, url: doc.url });
  }
  return { documents, context: blocks.join('\n\n'), sources, considered };
}
