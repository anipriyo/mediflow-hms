// Small document-building helpers on top of docx-js.
import fs from 'node:fs';
import {
  Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType, ImageRun,
  BorderStyle, PageBreak, VerticalAlign, TableLayoutType,
} from 'docx';

export const C = {
  brand: '0D6962', brandLight: 'E6F6F3', brandMid: 'BFE9E1', ink: '0F172A', muted: '475569', line: 'CBD5E1',
  pass: '047857', passBg: 'D1FAE5', fail: 'B91C1C', failBg: 'FEE2E2', warnBg: 'FEF3C7', zebra: 'F8FAFC',
};
export const FONT = 'Calibri';

// Portrait A4: 11906 x 16838 DXA, margins 1134 (2 cm) → content 9638 DXA
export const PORTRAIT_W = 9638;
// Landscape A4 content width with 2 cm margins: 16838 - 2*1134 = 14570
export const LANDSCAPE_W = 14570;

let figNo = 0;
let tabNo = 0;
export const counters = { figures: [], tables: [] };

/** Parse a tiny markup: **bold**, `code`, _italic_ */
export function runs(text, base = {}) {
  if (Array.isArray(text)) return text;
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g;
  let last = 0;
  let m;
  const s = String(text ?? '');
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(new TextRun({ text: s.slice(last, m.index), font: FONT, ...base }));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(new TextRun({ text: tok.slice(2, -2), bold: true, font: FONT, ...base }));
    else if (tok.startsWith('`')) out.push(new TextRun({ text: tok.slice(1, -1), font: 'Consolas', size: (base.size || 21) - 2, color: base.color || '334155', bold: base.bold }));
    else out.push(new TextRun({ text: tok.slice(1, -1), italics: true, font: FONT, ...base }));
    last = m.index + tok.length;
  }
  if (last < s.length) out.push(new TextRun({ text: s.slice(last), font: FONT, ...base }));
  return out;
}

export const H1 = (t, opts = {}) => new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: opts.pageBreak ?? false, children: [new TextRun({ text: t, font: FONT })] });
export const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: t, font: FONT })] });
export const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: t, font: FONT })] });

export const P = (t, opts = {}) => new Paragraph({
  children: runs(t, opts.run || {}),
  alignment: opts.align || AlignmentType.JUSTIFIED,
  spacing: { after: opts.after ?? 120, before: opts.before ?? 0, line: 276, lineRule: 'auto' },
  keepNext: opts.keepNext,
  indent: opts.indent,
});

export const Small = (t, opts = {}) => P(t, { ...opts, run: { size: 18, color: C.muted, ...(opts.run || {}) } });

export const Bullets = (items, level = 0) => items.map((t) => new Paragraph({
  children: runs(t),
  numbering: { reference: 'bullets', level },
  spacing: { after: 60, line: 264, lineRule: 'auto' },
}));

export const Numbered = (items, ref = 'numbers') => items.map((t) => new Paragraph({
  children: runs(t),
  numbering: { reference: ref, level: 0 },
  spacing: { after: 60, line: 264, lineRule: 'auto' },
}));

export const Break = () => new Paragraph({ children: [new PageBreak()] });
export const Spacer = (after = 120) => new Paragraph({ children: [], spacing: { after } });

export function Callout(text, { fill = C.brandLight, border = C.brand } = {}) {
  return new Paragraph({
    children: runs(text),
    shading: { type: ShadingType.CLEAR, color: 'auto', fill },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: border, space: 8 } },
    spacing: { before: 120, after: 160, line: 276, lineRule: 'auto' },
    indent: { left: 160, right: 160 },
  });
}

const cellBorders = { top: { style: BorderStyle.SINGLE, size: 4, color: C.line }, bottom: { style: BorderStyle.SINGLE, size: 4, color: C.line }, left: { style: BorderStyle.SINGLE, size: 4, color: C.line }, right: { style: BorderStyle.SINGLE, size: 4, color: C.line } };

function cellContent(value, size, { bold = false, color } = {}) {
  const parts = Array.isArray(value) ? value : String(value ?? '').split('\n');
  return parts.map((line) => new Paragraph({ children: runs(line, { size, bold: bold || undefined, color }), spacing: { after: 20, line: 240, lineRule: 'auto' } }));
}

/**
 * Table with header row. columns: [{ header, width (DXA) }]; rows: array of arrays of strings
 * opts: { size (half-points), statusCol (index) to colour PASS/FAIL, totalWidth, zebra }
 */
export function DataTable(columns, rows, opts = {}) {
  const size = opts.size || 18;
  const total = columns.reduce((s, c) => s + c.width, 0);
  const header = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: columns.map((c) => new TableCell({
      width: { size: c.width, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: C.brand },
      borders: cellBorders,
      margins: { top: 60, bottom: 60, left: 90, right: 90 },
      verticalAlign: VerticalAlign.CENTER,
      children: cellContent(c.header, size, { bold: true, color: 'FFFFFF' }),
    })),
  });
  const body = rows.map((r, i) => new TableRow({
    cantSplit: opts.cantSplit ?? true,
    children: r.map((v, j) => {
      let fill = opts.zebra !== false && i % 2 === 1 ? C.zebra : 'FFFFFF';
      let color;
      let bold = j === 0 && opts.boldFirst;
      if (opts.statusCol === j) {
        const s = String(v).toUpperCase();
        if (s.startsWith('PASS') || s === 'FIXED' || s === 'CLOSED') { fill = C.passBg; color = C.pass; bold = true; }
        else if (s.startsWith('FAIL') || s === 'OPEN') { fill = C.failBg; color = C.fail; bold = true; }
        else if (s === 'DEFERRED' || s.startsWith('NOT')) { fill = C.warnBg; bold = true; }
      }
      return new TableCell({
        width: { size: columns[j].width, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, color: 'auto', fill },
        borders: cellBorders,
        margins: { top: 50, bottom: 50, left: 90, right: 90 },
        children: cellContent(v, size, { bold, color }),
      });
    }),
  }));
  return new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: columns.map((c) => c.width), layout: TableLayoutType.FIXED, rows: [header, ...body] });
}

export function TableCaption(text) {
  tabNo += 1;
  counters.tables.push(`Table ${tabNo}: ${text}`);
  const para = new Paragraph({ children: [new TextRun({ text: `Table ${tabNo}: `, bold: true, font: FONT, size: 18, color: C.brand }), new TextRun({ text, font: FONT, size: 18, color: C.muted })], spacing: { before: 200, after: 80 }, keepNext: true });
  para.__caption = true;
  return para;
}

/** Content that must be placed on landscape pages (handled by the section builder). */
export const Landscape = (...children) => ({ __landscape: children.flat(Infinity) });

/** Flatten nested arrays and move each table caption above its table. */
export function arrange(children) {
  const flat = children.flat(Infinity);
  const out = [];
  for (let i = 0; i < flat.length; i += 1) {
    const el = flat[i];
    const next = flat[i + 1];
    if (el instanceof Table && next && next.__caption) {
      out.push(next, el);
      i += 1;
    } else {
      out.push(el);
    }
  }
  return out;
}

/** Key/value two-column table */
export function KVTable(pairs, widths = [2600, PORTRAIT_W - 2600], opts = {}) {
  return DataTable([{ header: opts.h1 || 'Item', width: widths[0] }, { header: opts.h2 || 'Details', width: widths[1] }], pairs, { boldFirst: true, ...opts });
}

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

/** Figure with caption; maxW/maxH in pixels at 96 dpi (602 px ≈ 15.9 cm). */
export function Figure(file, caption, { maxW = 640, maxH = 860 } = {}) {
  figNo += 1;
  counters.figures.push(`Figure ${figNo}: ${caption}`);
  const { w, h } = pngSize(file);
  const scale = Math.min(maxW / w, maxH / h, 1);
  const width = Math.round(w * scale);
  const height = Math.round(h * scale);
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 60, line: 240, lineRule: 'auto' }, children: [new ImageRun({ type: 'png', data: fs.readFileSync(file), transformation: { width, height } })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: `Figure ${figNo}: `, bold: true, font: FONT, size: 18, color: C.brand }), new TextRun({ text: caption, font: FONT, size: 18, color: C.muted })] }),
  ];
}

export function resetCounters() {
  figNo = 0;
  tabNo = 0;
  counters.figures.length = 0;
  counters.tables.length = 0;
}
