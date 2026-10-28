import { describe, expect, it } from 'vitest';
import {
  CARD_IMPORT_HEADERS,
  buildCardImportTemplate,
  parseCardImport,
  readFirstSheet,
  readXlsxSheet,
  parseXlsxWorkbook,
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

  it('extracts embedded drawings and maps images to row lines', async () => {
    const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Thẻ bài" sheetId="1" r:id="rId1"/></sheets></workbook>`;
    const wbRels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;
    const sheet = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>Mã thẻ</t></is></c><c r="B1" t="inlineStr"><is><t>Tên thẻ</t></is></c><c r="C1" t="inlineStr"><is><t>Hiệu ứng / Mô tả</t></is></c></row>
<row r="2"><c r="A2" t="inlineStr"><is><t>CARD-010</t></is></c><c r="B2" t="inlineStr"><is><t>Thẻ Cú Đêm</t></is></c><c r="C2" t="inlineStr"><is><t>Cộng 1 điểm</t></is></c></row>
</sheetData></worksheet>`;
    const sheetRels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdDraw" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`;
    const drawing = `<?xml version="1.0" encoding="UTF-8"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<xdr:twoCellAnchor>
  <xdr:from><xdr:col>8</xdr:col><xdr:row>1</xdr:row></xdr:from>
  <xdr:to><xdr:col>9</xdr:col><xdr:row>2</xdr:row></xdr:to>
  <xdr:pic><xdr:blipFill><a:blip r:embed="rIdImg1"/></xdr:blipFill></xdr:pic>
</xdr:twoCellAnchor>
</xdr:wsDr>`;
    const drawingRels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
</Relationships>`;
    const fakePng = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

    const bytes = await zipDeflated([
      { name: 'xl/workbook.xml', xml: workbook },
      { name: 'xl/_rels/workbook.xml.rels', xml: wbRels },
      { name: 'xl/worksheets/sheet1.xml', xml: sheet },
      { name: 'xl/worksheets/_rels/sheet1.xml.rels', xml: sheetRels },
      { name: 'xl/drawings/drawing1.xml', xml: drawing },
      { name: 'xl/drawings/_rels/drawing1.xml.rels', xml: drawingRels },
      { name: 'xl/media/image1.png', data: fakePng },
    ]);

    const result = await parseXlsxWorkbook(bytes);
    expect(result.matrix).toHaveLength(2);
    expect(result.images.has(2)).toBe(true);
    const img = result.images.get(2)!;
    expect(img.name).toBe('image1.png');
    expect(img.mimeType).toBe('image/png');
    expect(img.bytes).toEqual(fakePng);

    const parsed = parseCardImport(result.matrix, characters, result.images);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].code).toBe('CARD-010');
    expect(parsed.rows[0].embeddedImage).toBeDefined();
    expect(parsed.rows[0].embeddedImage?.name).toBe('image1.png');
    expect(parsed.rows[0].errors).toEqual([]);
  });

  it('rejects a file that is not a ZIP archive', async () => {
    await expect(readXlsxSheet(new TextEncoder().encode('not a zip'))).rejects.toThrow('ZIP');
  });

  it('stops an entry whose expansion blows past the per-entry budget', async () => {
    // Raw deflate reaches roughly 1000:1 on zeros, so a sub-30 KB container buys a 26 MB buffer.
    const bytes = await zipDeflated([
      { name: 'xl/workbook.xml', xml: '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Thẻ bài" sheetId="1" r:id="rId1"/></sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', xml: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
      { name: 'xl/worksheets/sheet1.xml', data: new Uint8Array(26 * 1024 * 1024) },
    ]);
    await expect(readXlsxSheet(bytes)).rejects.toThrow(/giải nén vượt 25 MB/);
  });

  it('refuses an archive declaring more entries than the cap', async () => {
    const bytes = await zipDeflated(Array.from({ length: 2001 }, (_unused, index) => ({
      name: `xl/entry-${index}.bin`, data: new Uint8Array(0), stored: true,
    })));
    await expect(readXlsxSheet(bytes)).rejects.toThrow(/quá nhiều mục nén/);
  });

  it('rejects a row index far above the rows the sheet actually holds', async () => {
    const bytes = await workbookWithSheet(
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
      + '<row r="1"><c r="A1" t="inlineStr"><is><t>Mã thẻ</t></is></c></row>'
      + '<row r="4294967294"><c r="A4294967294" t="inlineStr"><is><t>bomb</t></is></c></row>'
      + '</sheetData></worksheet>');
    await expect(readXlsxSheet(bytes)).rejects.toThrow(/chỉ số dòng không hợp lệ/);
  });

  it('rejects a column reference that overflows the OOXML grid', async () => {
    const bytes = await workbookWithSheet(
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
      + '<row r="1"><c r="ZZZ1" t="inlineStr"><is><t>bomb</t></is></c></row>'
      + '</sheetData></worksheet>');
    await expect(readXlsxSheet(bytes)).rejects.toThrow(/chỉ số cột không hợp lệ/);
  });

  it('still reads a workbook that uses the last legal row and column indexes', async () => {
    const bytes = await workbookWithSheet(
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
      + '<row r="1"><c r="A1" t="inlineStr"><is><t>Mã thẻ</t></is></c></row>'
      + '<row r="50000"><c r="A50000" t="inlineStr"><is><t>CARD-050</t></is></c><c r="XFD50000" t="inlineStr"><is><t>cuối</t></is></c></row>'
      + '</sheetData></worksheet>');
    const matrix = await readXlsxSheet(bytes);
    expect(matrix[0]).toEqual(['Mã thẻ']);
    expect(matrix[49999][0]).toBe('CARD-050');
    expect(matrix[49999][16383]).toBe('cuối');
  });
});

/** Minimal one-sheet workbook carrying the given worksheet XML. */
async function workbookWithSheet(sheet: string): Promise<Uint8Array> {
  return zipDeflated([
    { name: 'xl/workbook.xml', xml: '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Thẻ bài" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', xml: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: 'xl/worksheets/sheet1.xml', xml: sheet },
  ]);
}

describe('slugify', () => {
  it('removes Vietnamese diacritics', () => {
    expect(slugify('Đời sống sinh viên')).toBe('doi-song-sinh-vien');
  });
});

async function zipDeflated(entries: Array<{ name: string; xml?: string; data?: Uint8Array; stored?: boolean }>): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const raw = entry.data ?? encoder.encode(entry.xml ?? '');
    const method = entry.stored ? 0 : 8;
    const compressed = entry.stored ? raw : await deflateRaw(raw);

    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, method, true);
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
    centralView.setUint16(10, method, true);
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
