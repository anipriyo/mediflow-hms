// Small document-building helpers on top of docx-js.
import fs from 'node:fs';
import {
  Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType, ImageRun,
  BorderStyle, PageBreak, VerticalAlign, TableLayoutType, ExternalHyperlink,
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

// Words that must keep their case after a sentence break (commands, units, abbreviations).
const KEEP_CASE = new Set(['npm', 'npx', 'mg/dL', 'e.g', 'i.e']);

/** Capitalise the first letter of `rest` unless it starts with an identifier, code or a lowercase-only name. */
function capFirst(rest) {
  const m = rest.match(/^((?:\*\*|_)?)([^\s,;:)]*)/);
  const word = m[2].replace(/\.$/, '');
  if (!word || !/^[a-z]/.test(word) || /[\d_@/`=]/.test(word) || KEEP_CASE.has(word) || /^[a-z]+\.[a-z]/.test(word)) return rest;
  return m[1] + word[0].toUpperCase() + rest.slice(m[1].length + 1);
}

/** True if position i in s sits inside an unclosed round bracket of the same sentence. */
function insideBrackets(s, i) {
  const before = s.slice(0, i);
  return (before.match(/\(/g) || []).length > (before.match(/\)/g) || []).length;
}

/**
 * A colon after a longer clause that introduces a lowercase list ("manage doctor profiles: department, fee, ...")
 * becomes brackets around the list, or is dropped after "are/is/include". Lists that already contain
 * brackets or separators fall back to a comma.
 */
function listColons(s) {
  let out = '';
  let i = 0;
  for (;;) {
    const j = s.indexOf(':', i);
    if (j < 0) return out + s.slice(i);
    const m = s.slice(j + 1).match(/^(\*\*|_)?(\s+)(?=[a-z])/);
    const sentence = s.slice(0, j).split(/(?<!\be\.g|\bi\.e|\bincl)[.!?]\s/).pop();
    if (!m || insideBrackets(s, j) || sentence.trim().split(/\s+/).length <= 6) {
      out += s.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    const marker = m[1] || '';
    const start = j + 1 + m[0].length;
    const endRel = s.slice(start).search(/(?<!\be\.g|\bi\.e|\bincl)[.!?;](\s|$)/);
    const end = endRel < 0 ? s.length : start + endRel;
    const body = s.slice(start, end);
    out += s.slice(i, j);
    if (/\b(are|is|was|were|include|includes)$/.test(sentence.trimEnd())) out += `${marker} ${body}`;
    else if (!/[()[\]:;]/.test(body)) out += `${marker} (${body})`;
    else out += `, namely${marker} ${body}`;
    i = end;
  }
}

/**
 * House style for the report text: no em dash, en dash, semicolon or colon.
 * Times become 09.30, ranges become "A to B", "Label: text" becomes "Label. Text",
 * semicolons become sentence breaks (commas inside brackets), URLs lose their scheme,
 * route parameters become {id} and permission names become area.action.
 */
export function clean(input) {
  let s = String(input ?? '');
  if (/^\s*[—–-]\s*$/.test(s)) return 'n/a';
  const links = [];
  s = s.replace(/\]\(([^)\s]+)\)/g, (_m, url) => `](\u0000${links.push(url) - 1}\u0001)`);
  s = s
    .replace(/npm run test:coverage/g, 'npx vitest run --coverage')
    .replace(/npm run test:e2e/g, 'npx playwright test')
    .replace(/npm run test:(unit|integration)/g, 'npx vitest run tests/$1')
    .replace(/npm run test:all/g, 'npx vitest run and npx playwright test')
    .replace(/https?:\/\//g, '')
    .replace(/\blocalhost:(\d+)/g, 'localhost port $1')
    .replace(/\b(\d{3,5}):((?:19|20)\d\d)\b/g, '$1 ($2)')
    .replace(/"(\w+)":\s*/g, '"$1" = ')
    .replace(/(^|[;,]\s*)([a-z][\w.]*): (\d)/g, '$1$2 $3')
    .replace(/(?<!\d)(\d{1,2}):(\d{2})(?::(\d{2}))?(?!\d)/g, (_m, h, mm, ss) => `${h}.${mm}${ss ? `.${ss}` : ''}`)
    .replace(/\/:([A-Za-z]\w*)/g, '/{$1}')
    .replace(/\b([a-z]+):([a-z_]+)\b/g, '$1.$2')
    .replace(/^((?:PART|Part|APPENDIX|Appendix) [A-Z])\s*[\u2013\u2014]\s*/, '$1. ')
    // Ranges and spans
    .replace(/(\S)\s*[–—]\s*(?=[\w₹(])/g, (m, a, off, str) => {
      const next = str.slice(off + m.length, off + m.length + 12);
      const isRange = /[\d)]$/.test(a) && /^[\dA-Z(₹]/.test(next) && !/\s[–—]\s[A-Z][a-z]/.test(m + next);
      return isRange || !/\s/.test(m) ? `${a} to ` : `${a}, `;
    })
    .replace(/^\s*[–—]\s*/g, '')
    .replace(/\s*[–—]\s*/g, ', ');
  s = listColons(s);
  // Colons and semicolons → sentence breaks ("Label: text" → "Label. Text"), commas inside brackets
  // or where a long clause introduces a lowercase list.
  const CODE_LIKE = /^[/{"'\d]|[=?&_@{}"]/;
  for (let pass = 0; pass < 500 && /[:;]/.test(s); pass++) {
    s = s.replace(/([:;])(\*\*|_|`)?(\s*)([^\s:;]*)/, (m, ch, marker = '', ws, word, off, str) => {
      if (!ws && !word) return /[.!?]$/.test(str.slice(0, off)) ? marker : `.${marker}`;
      const shortItem = ch === ';' && /^[a-z]/.test(word) && str.slice(0, off).split(/[.;,!?]\s/).pop().trim().split(/\s+/).length <= 4;
      const codeList = ch === ';' && (CODE_LIKE.test(word) || shortItem);
      if (insideBrackets(str, off) || codeList) return `,${marker}${ws || ' '}${word}`;
      return `.${marker}${ws || ' '}${capFirst(word)}`;
    });
  }
  s = s.replace(/,\s*,/g, ',').replace(/\.\s*\./g, '.').replace(/\s+,/g, ',');
  return s.replace(/\u0000(\d+)\u0001/g, (_m, k) => links[Number(k)]);
}

/** Captions "Kind – subject" become "Kind (subject)" unless the subject already has brackets. */
export function cleanCaption(text) {
  const m = String(text ?? '').match(/^(.*?)\s+[\u2013\u2014]\s+(.*)$/);
  return clean(m && !/[()]/.test(m[2]) ? `${m[1]} (${m[2]})` : text);
}

/** Parse a tiny markup: **bold**, `code`, _italic_, [text](url). Text is passed through clean() first. */
export function runs(text, base = {}) {
  if (Array.isArray(text)) return text;
  text = clean(text);
  const out = [];
  // _italic_ only at word edges, so identifiers like SAMPLE_COLLECTED keep their underscores
  const re = /(\[[^\]]+\]\([^)\s]+\)|\*\*[^*]+\*\*|`[^`]+`|(?<!\w)_[^_]+_(?!\w))/g;
  let last = 0;
  let m;
  const s = String(text ?? '');
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(new TextRun({ text: s.slice(last, m.index), font: FONT, ...base }));
    const tok = m[0];
    if (tok.startsWith('[')) {
      const [, label, link] = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      out.push(new ExternalHyperlink({ link, children: [new TextRun({ text: label, font: FONT, ...base, color: C.brand, underline: {} })] }));
    } else if (tok.startsWith('**')) out.push(new TextRun({ text: tok.slice(2, -2), bold: true, font: FONT, ...base }));
    else if (tok.startsWith('`')) out.push(new TextRun({ text: tok.slice(1, -1), font: 'Consolas', size: (base.size || 21) - 2, color: base.color || '334155', bold: base.bold }));
    else out.push(new TextRun({ text: tok.slice(1, -1), italics: true, font: FONT, ...base }));
    last = m.index + tok.length;
  }
  if (last < s.length) out.push(new TextRun({ text: s.slice(last), font: FONT, ...base }));
  return out;
}

let standalone = false;
/** Standalone mode: each part is its own document, so part headings drop the "PART X" prefix. */
export const setStandalone = (value) => { standalone = Boolean(value); };
export const isStandalone = () => standalone;
/** Part heading, "PART A – TITLE" in the combined report or just "TITLE" in a standalone document. */
export const PartH1 = (letter, title) => H1(standalone ? title : `PART ${letter} – ${title}`, { pageBreak: true });

export const H1 = (t, opts = {}) => new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: opts.pageBreak ?? false, children: [new TextRun({ text: clean(t), font: FONT })] });
export const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: clean(t), font: FONT })] });
export const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: clean(t), font: FONT })] });

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
  counters.tables.push(`Table ${tabNo}. ${cleanCaption(text)}`);
  const para = new Paragraph({ children: [new TextRun({ text: `Table ${tabNo}. `, bold: true, font: FONT, size: 18, color: C.brand }), new TextRun({ text: cleanCaption(text), font: FONT, size: 18, color: C.muted })], spacing: { before: 200, after: 80 }, keepNext: true });
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
  counters.figures.push(`Figure ${figNo}. ${cleanCaption(caption)}`);
  const { w, h } = pngSize(file);
  const scale = Math.min(maxW / w, maxH / h, 1);
  const width = Math.round(w * scale);
  const height = Math.round(h * scale);
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 60, line: 240, lineRule: 'auto' }, children: [new ImageRun({ type: 'png', data: fs.readFileSync(file), transformation: { width, height } })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: `Figure ${figNo}. `, bold: true, font: FONT, size: 18, color: C.brand }), new TextRun({ text: cleanCaption(caption), font: FONT, size: 18, color: C.muted })] }),
  ];
}

export function resetCounters() {
  figNo = 0;
  tabNo = 0;
  counters.figures.length = 0;
  counters.tables.length = 0;
}
