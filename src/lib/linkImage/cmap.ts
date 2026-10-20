/**
 * The code points a TrueType / OpenType font draws: the union of its Unicode
 * cmap subtables (formats 4 and 12 — what every font we ship has). Read once
 * per font file, so the link-preview image can leave out what no font of
 * ours draws before satori sees it (lib/linkImage/fonts).
 */
export function fontCoverage(bytes: Uint8Array): Set<number> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const covered = new Set<number>();
  const numTables = view.getUint16(4);
  let cmap = -1;
  for (let i = 0; i < numTables; i++) {
    const record = 12 + i * 16;
    if (String.fromCharCode(...bytes.subarray(record, record + 4)) === 'cmap') cmap = view.getUint32(record + 8);
  }
  if (cmap < 0) return covered;
  const subtables = view.getUint16(cmap + 2);
  const seen = new Set<number>();
  for (let i = 0; i < subtables; i++) {
    const platform = view.getUint16(cmap + 4 + i * 8);
    const encoding = view.getUint16(cmap + 6 + i * 8);
    const offset = cmap + view.getUint32(cmap + 8 + i * 8);
    // Unicode: platform 0, or Windows' BMP (1) and full repertoire (10).
    if (!(platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10))) || seen.has(offset)) continue;
    seen.add(offset);
    const format = view.getUint16(offset);
    if (format === 4) readFormat4(view, offset, covered);
    else if (format === 12) readFormat12(view, offset, covered);
  }
  return covered;
}

function readFormat4(view: DataView, at: number, covered: Set<number>) {
  const segments = view.getUint16(at + 6) / 2;
  const ends = at + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const rangeOffsets = deltas + segments * 2;
  for (let s = 0; s < segments; s++) {
    const end = view.getUint16(ends + s * 2);
    const start = view.getUint16(starts + s * 2);
    const delta = view.getInt16(deltas + s * 2);
    const rangeOffsetAt = rangeOffsets + s * 2;
    const rangeOffset = view.getUint16(rangeOffsetAt);
    for (let c = start; c <= end && c !== 0xffff; c++) {
      let glyph: number;
      if (rangeOffset === 0) glyph = (c + delta) & 0xffff;
      else {
        glyph = view.getUint16(rangeOffsetAt + rangeOffset + (c - start) * 2);
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph !== 0) covered.add(c);
    }
  }
}

function readFormat12(view: DataView, at: number, covered: Set<number>) {
  const groups = view.getUint32(at + 12);
  for (let g = 0; g < groups; g++) {
    const group = at + 16 + g * 12;
    const start = view.getUint32(group);
    const end = view.getUint32(group + 4);
    const startGlyph = view.getUint32(group + 8);
    for (let c = start; c <= end; c++) if (startGlyph + (c - start) !== 0) covered.add(c);
  }
}
