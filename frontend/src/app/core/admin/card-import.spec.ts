import { describe, expect, it } from 'vitest';
import {
  CARD_IMPORT_HEADERS,
  buildCardImportTemplate,
  parseCardImport,
  readFirstSheet,
  readXlsxSheet,
  slugify,
  validateCardSetImport,
} from './card-import';

const characters = [
  { id: 'char-an', code: 'CHAR-AN' },
  { id: 'char-binh', code: 'CHAR-BINH' },
];

function row(values: Record<number, string>): string[] {
  const cells: string[] = [];
  for (const [index, value] of Object.entries(values)) cells[Number(index)] = value;
  return cells;
}

const header = ['Mã thẻ', 'Tên thẻ', 'Slug', 'Hiệu ứng / Mô tả', 'Ghi chú luật', 'Trạng thái luật', 'Số bản', 'Thứ tự', 'Ảnh (URL)', 'Mã nhân vật'];

describe('parseCardImport', () => {
  it('maps Vietnamese headers, normalizes codes, generates slug and defaults', () => {
    const parsed = parseCardImport(
      [
        ['Danh sách thẻ'],
        ['Mã thẻ', 'Tên thẻ', 'Mô tả', 'Số bản', 'Mã nhân vật'],
        ['card-001', 'Ăn mì gói', 'Tiết kiệm 50k', '', 'char-an'],
      ],
      characters
    );

    expect(parsed.fileError).toBeNull();
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({
      line: 3,
      code: 'CARD-001',
      name: 'Ăn mì gói',
      slug: 'an-mi-goi',
      effectText: 'Tiết kiệm 50k',
      ruleStatus: 'CONFIRMED',
      copiesInDeck: 1,
      sortOrder: 1,
      artworkUrl: null,
      characterId: 'char-an',
      errors: [],
    });
  });

  it('accepts English headers and preserves explicit values', () => {
    const parsed = parseCardImport(
      [
        ['code', 'name', 'slug', 'effect', 'ruling notes', 'rule status', 'copies', 'sort order', 'image', 'character code'],
        ['CARD-002', 'Đi làm muộn', 'di-lam-muon', 'Mất 2 điểm', 'Áp dụng một lần', 'NEEDS_REVIEW', '2', '5', 'https://cdn.example.com/card.webp', ''],
      ],
      characters
    );

    expect(parsed.fileError).toBeNull();
    expect(parsed.rows[0]).toMatchObject({
      code: 'CARD-002',
      slug: 'di-lam-muon',
      ruleStatus: 'NEEDS_REVIEW',
      copiesInDeck: 2,
      sortOrder: 5,
      artworkUrl: 'https://cdn.example.com/card.webp',
      characterId: null,
      errors: [],
    });
  });

  it('reports row errors for duplicates, invalid values and unknown characters', () => {
    const parsed = parseCardImport(
      [
        header,
        ['CARD-001', 'Thẻ A', 'the-a', 'Hiệu ứng', '', 'CONFIRMED', '1', '0', '', ''],
        ['CARD-001', 'Thẻ B', 'the-a', 'Hiệu ứng', '', 'UNKNOWN', '0', '200000', 'ftp://example.com/a.png', 'CHAR-X'],
        ['CARD-003', '', '', '', '', '', '', '', '', ''],
      ],
      characters
    );

    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0].errors).toEqual([]);
    expect(parsed.rows[1].errors).toEqual(
      expect.arrayContaining([
        'Mã thẻ bị trùng với dòng 2.',
        'Slug bị trùng với dòng 2.',
        'Trạng thái luật chỉ nhận CONFIRMED hoặc NEEDS_REVIEW.',
        'Số bản phải là số nguyên từ 1 đến 1000.',
        'Thứ tự hiển thị phải là số nguyên từ 0 đến 100000.',
        'Ảnh phải là URL HTTPS công khai, /assets/... hoặc /media/cards/<hash>.(png|jpg|webp).',
        'Không tìm thấy nhân vật "CHAR-X" trong bản phát hành.',
      ])
    );
    expect(parsed.rows[2].errors).toEqual(
      expect.arrayContaining(['Thiếu tên thẻ.', 'Không tạo được slug từ tên thẻ; hãy nhập slug thủ công.', 'Thiếu hiệu ứng / mô tả thẻ.'])
    );
  });

  it('rejects a file without a recognizable header', () => {
    const parsed = parseCardImport([['Một', 'Hai'], ['a', 'b']], characters);
    expect(parsed.rows).toEqual([]);
    expect(parsed.fileError).toContain('Không tìm thấy dòng tiêu đề');
  });

  it('rejects a file missing required columns', () => {
    const parsed = parseCardImport([['Mã thẻ', 'Tên thẻ'], ['CARD-1', 'Thẻ']], characters);
    expect(parsed.rows).toEqual([]);
    expect(parsed.fileError).toContain('Hiệu ứng / Mô tả');
  });

  it('ignores blank rows and reports an empty sheet', () => {
    const parsed = parseCardImport([header, ['', '', '', '', '', '', '', '', '', '']], characters);
    expect(parsed.rows).toEqual([]);
    expect(parsed.fileError).toContain('không có dòng dữ liệu');
  });
});

describe('validateCardSetImport', () => {
  const draft = { code: 'SET-01', name: 'Bộ mùa hè', slug: 'bo-mua-he', description: '', sortOrder: 0 };

  it('accepts a new card set', () => {
    expect(validateCardSetImport(draft, [])).toBeNull();
  });

  it('rejects duplicate code and slug in the release', () => {
    expect(validateCardSetImport(draft, [{ code: 'SET-01', slug: 'khac' }])).toContain('đã tồn tại');
    expect(validateCardSetImport(draft, [{ code: 'SET-02', slug: 'bo-mua-he' }])).toContain('đã tồn tại');
  });

  it('rejects invalid codes and sort order', () => {
    expect(validateCardSetImport({ ...draft, code: 'set 01' }, [])).toContain('Mã bộ thẻ');
    expect(validateCardSetImport({ ...draft, sortOrder: -1 }, [])).toContain('Thứ tự');
  });
});

describe('xlsx template', () => {
  it('round-trips the generated template through the reader', async () => {
    const bytes = buildCardImportTemplate();
    const file = new File([arrayBufferOf(bytes)], 'mau.xlsx');
    const sheet = await readFirstSheet(file);

    expect(sheet[0]).toEqual([...CARD_IMPORT_HEADERS]);
    expect(sheet).toHaveLength(1);
  });
});

describe('readXlsxSheet', () => {
  it('reads deflated sheets, shared strings, inline strings and absolute sheet targets', async () => {
    const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Thẻ bài" sheetId="1" r:id="rId7"/></sheets></workbook>`;
    const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/data.xml"/>
</Relationships>`;
    const shared = `<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<si><r><t>Mã </t></r><r><t>thẻ</t></r></si><si><t>Tên thẻ</t></si><si><t>Mô tả</t></si><si><t>Thẻ mùa hè</t></si>
</sst>`;
    const sheet = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
<row r="3"><c r="A3" t="inlineStr"><is><t>card-001</t></is></c><c r="B3" t="s"><v>3</v></c><c r="C3" t="inlineStr"><is><t>Mô tả &amp; ghi chú</t></is></c></row>
</sheetData></worksheet>`;

    const bytes = await zipDeflated([
      { name: 'xl/workbook.xml', xml: workbook },
      { name: 'xl/_rels/workbook.xml.rels', xml: rels },
      { name: 'xl/sharedStrings.xml', xml: shared },
      { name: 'xl/worksheets/data.xml', xml: sheet },
    ]);

    const matrix = await readXlsxSheet(bytes);
    expect(matrix[0]).toEqual(['Mã thẻ', 'Tên thẻ', 'Mô tả']);
    expect(matrix[1]).toEqual([]);
    expect(matrix[2]).toEqual(['card-001', 'Thẻ mùa hè', 'Mô tả & ghi chú']);
  });

  it('rejects a file that is not a ZIP archive', async () => {
    await expect(readXlsxSheet(new TextEncoder().encode('not a zip'))).rejects.toThrow('ZIP');
  });
});

describe('slugify', () => {
  it('removes Vietnamese diacritics', () => {
    expect(slugify('Đời sống sinh viên')).toBe('doi-song-sinh-vien');
  });
});

async function zipDeflated(entries: Array<{ name: string; xml: string }>): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const raw = encoder.encode(entry.xml);
    const compressed = await deflateRaw(raw);

    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 8, true);
    localView.setUint32(18, compressed.length, true);
    localView.setUint32(22, raw.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    localParts.push(local, compressed);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 8, true);
    centralView.setUint32(20, compressed.length, true);
    centralView.setUint32(24, raw.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centralParts.push(central);

    offset += local.length + compressed.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  const parts = [...localParts, ...centralParts, end];
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let cursor = 0;
  for (const part of parts) {
    output.set(part, cursor);
    cursor += part.length;
  }
  return output;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(arrayBufferOf(data)).body!.pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function arrayBufferOf(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}
