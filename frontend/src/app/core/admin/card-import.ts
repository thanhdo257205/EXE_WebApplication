export const CARD_IMPORT_TEMPLATE_FILENAME = 'mau-import-bo-the.xlsx';

export const CARD_IMPORT_HEADERS = [
  'Mã thẻ',
  'Tên thẻ',
  'Slug',
  'Hiệu ứng / Mô tả',
  'Ghi chú luật',
  'Trạng thái luật',
  'Số bản',
  'Thứ tự',
  'Ảnh (URL)',
  'Mã nhân vật',
] as const;

export type RuleStatus = 'CONFIRMED' | 'NEEDS_REVIEW';

export interface CardImportCharacter {
  id: string;
  code: string;
}

export interface CardImportRow {
  /** Số dòng thật trong file Excel (bắt đầu từ 1). */
  line: number;
  code: string;
  name: string;
  slug: string;
  effectText: string;
  rulingNotes: string | null;
  ruleStatus: RuleStatus;
  copiesInDeck: number;
  sortOrder: number;
  artworkUrl: string | null;
  characterId: string | null;
  characterCode: string | null;
  errors: string[];
}

export interface CardImportPreview {
  rows: CardImportRow[];
  fileError: string | null;
}

export interface CardSetImportDraft {
  code: string;
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
}

type ImportField =
  | 'code'
  | 'name'
  | 'slug'
  | 'effectText'
  | 'rulingNotes'
  | 'ruleStatus'
  | 'copiesInDeck'
  | 'sortOrder'
  | 'artworkUrl'
  | 'characterCode';

const HEADER_ALIASES: Record<ImportField, string[]> = {
  code: ['ma the', 'ma bai', 'ma', 'code', 'card code'],
  name: ['ten the', 'ten bai', 'ten', 'name', 'card name'],
  slug: ['slug', 'duong dan', 'duong dan slug'],
  effectText: ['hieu ung', 'hieu ung the', 'hieu ung mo ta', 'mo ta', 'mo ta hieu ung', 'effect', 'effect text', 'description'],
  rulingNotes: ['ghi chu luat', 'ghi chu', 'ruling notes', 'ruling', 'notes'],
  ruleStatus: ['trang thai luat', 'trang thai', 'rule status', 'rulestatus'],
  copiesInDeck: ['so ban', 'so ban trong bo', 'so luong ban', 'copies', 'copies in deck', 'copiesindeck'],
  sortOrder: ['thu tu', 'thu tu hien thi', 'sort order', 'sortorder'],
  artworkUrl: ['anh', 'anh the', 'anh url', 'artwork', 'artwork url', 'image', 'image url', 'url anh'],
  characterCode: ['ma nhan vat', 'nhan vat', 'ma cu dan', 'character', 'character code'],
};

const REQUIRED_HEADERS: Array<{ field: ImportField; label: string }> = [
  { field: 'code', label: 'Mã thẻ' },
  { field: 'name', label: 'Tên thẻ' },
  { field: 'effectText', label: 'Hiệu ứng / Mô tả' },
];

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]*$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}

export function isAllowedArtworkUrl(value: string): boolean {
  if (!value || value.length > 2048) return false;
  if (value.startsWith('/assets/') && !value.includes('..') && !value.includes('\\')) return true;
  if (/^\/media\/cards\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function validateCardSetImport(draft: CardSetImportDraft, existing: Array<{ code: string; slug: string }>): string | null {
  if (!draft.code || !CODE_PATTERN.test(draft.code) || draft.code.length > 40) {
    return 'Mã bộ thẻ bắt buộc, tối đa 40 ký tự, chỉ gồm chữ hoa, số, gạch ngang/gạch dưới (VD: SET-01).';
  }
  if (!draft.name || draft.name.length > 160) {
    return 'Tên bộ thẻ bắt buộc, tối đa 160 ký tự.';
  }
  if (!draft.slug || !SLUG_PATTERN.test(draft.slug) || draft.slug.length > 160) {
    return 'Đường dẫn (slug) bắt buộc, tối đa 160 ký tự, chữ thường và dấu gạch ngang.';
  }
  if (draft.description.length > 10000) {
    return 'Mô tả bộ thẻ tối đa 10000 ký tự.';
  }
  if (!Number.isInteger(draft.sortOrder) || draft.sortOrder < 0 || draft.sortOrder > 100000) {
    return 'Thứ tự hiển thị phải là số nguyên từ 0 đến 100000.';
  }
  if (existing.some(set => set.code === draft.code)) {
    return `Mã bộ thẻ "${draft.code}" đã tồn tại trong bản phát hành.`;
  }
  if (existing.some(set => set.slug === draft.slug)) {
    return `Slug bộ thẻ "${draft.slug}" đã tồn tại trong bản phát hành.`;
  }
  return null;
}

/** Đọc sheet đầu tiên của một file .xlsx thành lưới chuỗi. */
export async function readFirstSheet(file: File): Promise<string[][]> {
  return readXlsxSheet(new Uint8Array(await file.arrayBuffer()));
}

export async function readXlsxSheet(bytes: Uint8Array): Promise<string[][]> {
  const zip = readZipDirectory(bytes);
  const workbookEntry = zip.get('xl/workbook.xml');
  if (!workbookEntry) throw new Error('File không phải bảng tính Excel .xlsx hợp lệ (thiếu xl/workbook.xml).');

  const workbookXml = decodeBytes(await extractEntry(bytes, workbookEntry));
  const sheetPath = await resolveFirstSheetPath(zip, workbookXml, bytes);
  const sheetEntry = zip.get(sheetPath) ?? zip.get('xl/worksheets/sheet1.xml');
  if (!sheetEntry) throw new Error('Không tìm thấy sheet dữ liệu trong file Excel.');

  const sharedEntry = zip.get('xl/sharedStrings.xml');
  const shared = sharedEntry ? parseSharedStrings(decodeBytes(await extractEntry(bytes, sharedEntry))) : [];
  return parseSheetXml(decodeBytes(await extractEntry(bytes, sheetEntry)), shared);
}

/** Chuẩn hóa lưới ô Excel thành các dòng thẻ đã kiểm tra. */
export function parseCardImport(matrix: string[][], characters: CardImportCharacter[]): CardImportPreview {
  const headerIndex = matrix.findIndex((row, index) => index < 20 && Object.keys(mapHeaders(row)).length >= 2 && hasHeader(row, 'code') && hasHeader(row, 'name'));
  if (headerIndex < 0) {
    return {
      rows: [],
      fileError: 'Không tìm thấy dòng tiêu đề (cần có cột "Mã thẻ" và "Tên thẻ"). Hãy dùng file mẫu hoặc đặt tiêu đề ở hàng đầu tiên.',
    };
  }

  const mapping = mapHeaders(matrix[headerIndex]);
  const missing = REQUIRED_HEADERS.filter(header => mapping[header.field] === undefined).map(header => header.label);
  if (missing.length > 0) {
    return { rows: [], fileError: `Thiếu cột bắt buộc: ${missing.join(', ')}.` };
  }

  const characterByCode = new Map(characters.map(character => [character.code.trim().toUpperCase(), character.id]));
  const codeLines = new Map<string, number>();
  const slugLines = new Map<string, number>();
  const rows: CardImportRow[] = [];
  let dataIndex = 0;

  for (let index = headerIndex + 1; index < matrix.length; index++) {
    const cells = matrix[index] ?? [];
    const value = (field: ImportField): string => {
      const column = mapping[field];
      return column === undefined ? '' : String(cells[column] ?? '').trim();
    };

    if (!Object.keys(mapping).some(field => value(field as ImportField) !== '')) continue;
    dataIndex += 1;

    const line = index + 1;
    const errors: string[] = [];
    const code = value('code').toUpperCase();
    const name = value('name');
    const effectText = value('effectText');
    const rawSlug = value('slug').toLowerCase();
    const generatedSlug = slugify(name);
    const slug = rawSlug || generatedSlug;

    if (!code) errors.push('Thiếu mã thẻ.');
    else if (!CODE_PATTERN.test(code) || code.length > 40) {
      errors.push('Mã thẻ tối đa 40 ký tự, chỉ gồm chữ, số, gạch ngang/gạch dưới (VD: CARD-001).');
    }

    if (!name) errors.push('Thiếu tên thẻ.');
    else if (name.length > 160) errors.push('Tên thẻ tối đa 160 ký tự.');

    if (!slug) errors.push('Không tạo được slug từ tên thẻ; hãy nhập slug thủ công.');
    else if (!SLUG_PATTERN.test(slug) || slug.length > 160) {
      errors.push('Slug tối đa 160 ký tự, chỉ gồm chữ thường, số và dấu gạch ngang.');
    }

    if (!effectText) errors.push('Thiếu hiệu ứng / mô tả thẻ.');
    else if (effectText.length > 10000) errors.push('Hiệu ứng thẻ tối đa 10000 ký tự.');

    const rulingNotes = value('rulingNotes') || null;
    if (rulingNotes && rulingNotes.length > 10000) errors.push('Ghi chú luật tối đa 10000 ký tự.');

    const rawRuleStatus = value('ruleStatus').toUpperCase().replace(/\s+/g, '_');
    const ruleStatus: RuleStatus = rawRuleStatus === 'NEEDS_REVIEW' ? 'NEEDS_REVIEW' : 'CONFIRMED';
    if (rawRuleStatus && rawRuleStatus !== 'CONFIRMED' && rawRuleStatus !== 'NEEDS_REVIEW') {
      errors.push('Trạng thái luật chỉ nhận CONFIRMED hoặc NEEDS_REVIEW.');
    }

    const copiesText = value('copiesInDeck');
    const copiesInDeck = copiesText === '' ? 1 : Number(copiesText);
    if (!Number.isInteger(copiesInDeck) || copiesInDeck < 1 || copiesInDeck > 1000) {
      errors.push('Số bản phải là số nguyên từ 1 đến 1000.');
    }

    const sortText = value('sortOrder');
    const sortOrder = sortText === '' ? dataIndex : Number(sortText);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 100000) {
      errors.push('Thứ tự hiển thị phải là số nguyên từ 0 đến 100000.');
    }

    const artworkUrl = value('artworkUrl') || null;
    if (artworkUrl && !isAllowedArtworkUrl(artworkUrl)) {
      errors.push('Ảnh phải là URL HTTPS công khai, /assets/... hoặc /media/cards/<hash>.(png|jpg|webp).');
    }

    const rawCharacterCode = value('characterCode').toUpperCase();
    const characterCode = rawCharacterCode || null;
    let characterId: string | null = null;
    if (characterCode) {
      characterId = characterByCode.get(characterCode) ?? null;
      if (!characterId) errors.push(`Không tìm thấy nhân vật "${characterCode}" trong bản phát hành.`);
    }

    if (code) {
      const previous = codeLines.get(code);
      if (previous !== undefined) errors.push(`Mã thẻ bị trùng với dòng ${previous}.`);
      else codeLines.set(code, line);
    }
    if (slug) {
      const previous = slugLines.get(slug);
      if (previous !== undefined) errors.push(`Slug bị trùng với dòng ${previous}.`);
      else slugLines.set(slug, line);
    }

    rows.push({
      line,
      code,
      name,
      slug,
      effectText,
      rulingNotes,
      ruleStatus,
      copiesInDeck,
      sortOrder,
      artworkUrl,
      characterId,
      characterCode,
      errors,
    });
  }

  if (rows.length === 0) {
    return { rows: [], fileError: 'File Excel không có dòng dữ liệu thẻ nào bên dưới dòng tiêu đề.' };
  }
  return { rows, fileError: null };
}

/** Tạo workbook mẫu: sheet đầu tiên chỉ có tiêu đề, sheet thứ hai chứa hướng dẫn và ví dụ. */
export function buildCardImportTemplate(): Uint8Array {
  const cardsSheet = sheetXml([[...CARD_IMPORT_HEADERS]], [16, 24, 28, 46, 30, 18, 10, 10, 46, 16]);
  const guideSheet = sheetXml(
    [
      ['Hướng dẫn nhập bộ thẻ từ Excel'],
      [''],
      ['1. Chỉ sheet đầu tiên ("Thẻ bài") được đọc. Giữ nguyên dòng tiêu đề ở hàng 1, không thêm dòng trống phía trên.'],
      ['2. Cột bắt buộc: Mã thẻ, Tên thẻ, Hiệu ứng / Mô tả. Các cột còn lại có thể để trống.'],
      ['3. Slug để trống sẽ được tạo tự động từ tên thẻ. Mã thẻ được tự động chuyển thành chữ hoa.'],
      ['4. Trạng thái luật: CONFIRMED hoặc NEEDS_REVIEW (mặc định CONFIRMED).'],
      ['5. Số bản: 1–1000 (mặc định 1). Thứ tự để trống sẽ theo thứ tự dòng.'],
      ['6. Ảnh: URL HTTPS công khai, /assets/... hoặc /media/cards/<hash>.(png|jpg|webp) sau khi tải ảnh lên. Ảnh nhúng trong Excel không được hỗ trợ.'],
      ['7. Mã nhân vật phải tồn tại trong bản phát hành; để trống nếu thẻ không gắn nhân vật.'],
      ['8. Mã thẻ và slug không được trùng nhau trong file hoặc trùng với thẻ đã có.'],
      [''],
      ['Ví dụ (chỉ để tham khảo, không được đọc khi nhập):'],
      [...CARD_IMPORT_HEADERS],
      ['CARD-001', 'Ăn mì gói đêm khuya', 'an-mi-goi-dem-khuya', 'Tiết kiệm 50.000đ nhưng mất 1 điểm tinh thần.', '', 'CONFIRMED', '1', '1', 'https://example.com/anh-the.webp', 'CHAR-AN'],
    ],
    [16, 24, 28, 60, 24, 18, 10, 10, 46, 16]
  );

  return zipStore([
    { name: '[Content_Types].xml', data: encodeText(CONTENT_TYPES) },
    { name: '_rels/.rels', data: encodeText(ROOT_RELS) },
    { name: 'xl/workbook.xml', data: encodeText(WORKBOOK_XML) },
    { name: 'xl/_rels/workbook.xml.rels', data: encodeText(WORKBOOK_RELS) },
    { name: 'xl/styles.xml', data: encodeText(STYLES_XML) },
    { name: 'xl/worksheets/sheet1.xml', data: encodeText(cardsSheet) },
    { name: 'xl/worksheets/sheet2.xml', data: encodeText(guideSheet) },
  ]);
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
<sheet name="Thẻ bài" sheetId="1" r:id="rId1"/>
<sheet name="Hướng dẫn" sheetId="2" r:id="rId2"/>
</sheets>
</workbook>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function mapHeaders(row: string[] | undefined): Partial<Record<ImportField, number>> {
  const mapping: Partial<Record<ImportField, number>> = {};
  if (!row) return mapping;
  row.forEach((cell, index) => {
    const header = normalizeHeader(String(cell ?? ''));
    if (!header) return;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as Array<[ImportField, string[]]>) {
      if (mapping[field] === undefined && aliases.includes(header)) mapping[field] = index;
    }
  });
  return mapping;
}

function hasHeader(row: string[], field: ImportField): boolean {
  return row.some(cell => HEADER_ALIASES[field].includes(normalizeHeader(String(cell ?? ''))));
}

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localOffset: number;
  flags: number;
}

function readZipDirectory(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error('File không phải định dạng .xlsx hợp lệ (thiếu ZIP end record).');

  const count = view.getUint16(eocd + 10, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries = new Map<string, ZipEntry>();
  let cursor = directoryOffset;

  for (let index = 0; index < count; index++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('Cấu trúc ZIP của file .xlsx bị hỏng.');
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    if (compressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error('File .xlsx dùng ZIP64 chưa được hỗ trợ. Hãy lưu lại với định dạng Excel thông thường.');
    }
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    entries.set(name, { name, method, compressedSize, localOffset, flags });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function extractEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  if (entry.flags & 1) throw new Error('File .xlsx đang được bảo vệ bằng mật khẩu; hãy bỏ mật khẩu trước khi nhập.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(entry.localOffset, true) !== 0x04034b50) throw new Error('Cấu trúc ZIP của file .xlsx bị hỏng.');
  const nameLength = view.getUint16(entry.localOffset + 26, true);
  const extraLength = view.getUint16(entry.localOffset + 28, true);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const data = bytes.subarray(start, start + entry.compressedSize);

  if (entry.method === 0) return data;
  if (entry.method !== 8) throw new Error(`File .xlsx dùng kiểu nén ZIP không hỗ trợ (${entry.method}).`);
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Trình duyệt không hỗ trợ giải nén .xlsx. Hãy dùng Chrome, Edge, Firefox hoặc Safari mới.');
  }
  const stream = new Response(arrayBufferOf(data)).body!.pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function arrayBufferOf(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

async function resolveFirstSheetPath(zip: Map<string, ZipEntry>, workbookXml: string, bytes: Uint8Array): Promise<string> {
  const sheetTag = /<sheet\b[^>]*>/i.exec(workbookXml)?.[0];
  const relationshipId = sheetTag ? /\br:id="([^"]+)"/i.exec(sheetTag)?.[1] : undefined;
  if (!relationshipId) return 'xl/worksheets/sheet1.xml';

  const relsEntry = zip.get('xl/_rels/workbook.xml.rels');
  if (!relsEntry) return 'xl/worksheets/sheet1.xml';
  const relsXml = decodeBytes(await extractEntry(bytes, relsEntry));
  const relTag = new RegExp(`<Relationship\\b[^>]*\\bId="${escapeRegExp(relationshipId)}"[^>]*>`, 'i').exec(relsXml)?.[0];
  const target = relTag ? /\bTarget="([^"]+)"/i.exec(relTag)?.[1] : undefined;
  return target ? resolveZipPath('xl/workbook.xml', decodeXml(target)) : 'xl/worksheets/sheet1.xml';
}

function resolveZipPath(baseFile: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = baseFile.split('/');
  parts.pop();
  for (const segment of target.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }
  return parts.join('/');
}

function parseSharedStrings(xml: string): string[] {
  const values: string[] = [];
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) values.push(richText(match[1]));
  return values;
}

function parseSheetXml(xml: string, shared: string[]): string[][] {
  const sheetData = /<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/i.exec(xml)?.[1];
  if (!sheetData) return [];

  const rows: string[][] = [];
  const rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/gi;
  let rowMatch: RegExpExecArray | null;
  let lastRow = 0;

  while ((rowMatch = rowRe.exec(sheetData))) {
    const rowNumber = Number(/\br="(\d+)"/i.exec(rowMatch[1])?.[1] ?? lastRow + 1);
    lastRow = rowNumber;
    const cells: string[] = [];
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gi;
    let cellMatch: RegExpExecArray | null;
    let lastColumn = 0;

    while ((cellMatch = cellRe.exec(rowMatch[2] ?? ''))) {
      const attributes = cellMatch[1];
      const reference = /\br="([A-Z]+)\d+"/i.exec(attributes)?.[1];
      const column = reference ? columnIndex(reference) : lastColumn;
      lastColumn = column + 1;
      const type = /\bt="([^"]+)"/i.exec(attributes)?.[1] ?? 'n';
      cells[column] = cellValue(cellMatch[2] ?? '', type, shared);
    }

    for (let index = 0; index < cells.length; index++) if (cells[index] === undefined) cells[index] = '';
    rows[rowNumber - 1] = cells;
  }

  for (let index = 0; index < rows.length; index++) if (!rows[index]) rows[index] = [];
  return rows;
}

function cellValue(inner: string, type: string, shared: string[]): string {
  if (type === 's') {
    const index = Number(tagText(inner, 'v'));
    return shared[index] ?? '';
  }
  if (type === 'inlineStr') return richText(tagInner(inner, 'is'));
  if (type === 'str') return decodeXml(tagText(inner, 'v'));
  if (type === 'b') return tagText(inner, 'v') === '1' ? 'TRUE' : 'FALSE';
  return decodeXml(tagText(inner, 'v'));
}

function richText(xml: string): string {
  const withoutPhonetic = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/gi, '');
  const parts: string[] = [];
  const re = /<t\b[^>]*>([\s\S]*?)<\/t>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(withoutPhonetic))) parts.push(decodeXml(match[1]));
  return parts.join('');
}

function tagInner(xml: string, tag: string): string {
  return new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(xml)?.[1] ?? '';
}

function tagText(xml: string, tag: string): string {
  return decodeXml(tagInner(xml, tag));
}

function columnIndex(letters: string): number {
  let index = 0;
  for (const letter of letters.toUpperCase()) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

function columnName(index: number): string {
  let value = index + 1;
  let name = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function sheetXml(rows: Array<Array<string | number>>, widths: number[]): string {
  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, column) => {
          if (value === '') return '';
          const reference = `${columnName(column)}${rowIndex + 1}`;
          if (typeof value === 'number') return `<c r="${reference}"><v>${value}</v></c>`;
          const style = rowIndex === 0 ? ' s="1"' : '';
          return `<c r="${reference}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join('');

  const columns = `<cols>${widths
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join('')}</cols>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${columns}<sheetData>${body}</sheetData></worksheet>`;
}

function encodeText(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function decodeBytes(value: Uint8Array): string {
  return new TextDecoder('utf-8').decode(value);
}

function decodeXml(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (_, entity: string) => {
    switch (entity) {
      case 'amp': return '&';
      case 'lt': return '<';
      case 'gt': return '>';
      case 'quot': return '"';
      case 'apos': return "'";
    }
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : `&${entity};`;
    }
    return `&${entity};`;
  });
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function zipStore(entries: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const checksum = crc32(entry.data);

    const local = new Uint8Array(30 + name.length + entry.data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, entry.data.length, true);
    localView.setUint32(22, entry.data.length, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true);
    local.set(name, 30);
    local.set(entry.data, 30 + name.length);
    localParts.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, entry.data.length, true);
    centralView.setUint32(24, entry.data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centralParts.push(central);

    offset += local.length;
  }

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  return concatBytes([...localParts, ...centralParts, end]);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

let crcTable: Uint32Array | null = null;

function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index++) {
      let value = index;
      for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      crcTable[index] = value >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
