/**
 * Position-based parser for PIB MSP press-release tables.
 *
 * Handles both layouts seen so far:
 *  - Kharif: S.No | Crop | Variety | MSP | Cost | Margin% | MSP prev | MSP 2013-14 | Incr. over prev | Incr. over 2013-14 (+ "(86%)" below)
 *  - Rabi:   S.No | Crop | MSP | Cost | Margin% | MSP prev | Increase
 * Rows are located by their numeric cells; crop/variety names and category headings are attached by position.
 */
import { CROP_DICTIONARY } from './cropDictionary';
import type { ExtractedCropRecord } from './pdfExtractorClient';

export interface PosItem {
  str: string;
  x: number;
  y: number;
  page: number;
}

const NUM_RX = /^(\d+(?:\.\d+)?|-)$/;
const PCT_RX = /^\((\d+(?:\.\d+)?)%\)$/;
const CATEGORY_RX = /^(Cereals|Pulses|Oilseeds|Commercial|Fibres?|Nutri[- ]?cereals|Cash crops?)$/i;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const pos = (i: { page: number; y: number }) => i.page * 100000 - i.y;

function toNum(s: string): number | null {
  return s === '-' ? null : parseFloat(s);
}

function resolveCrop(name: string): { id: string; name: string; aliases: string[]; known: boolean } {
  const lower = name.toLowerCase();
  for (const def of Object.values(CROP_DICTIONARY)) {
    if (def.name.toLowerCase() === lower || def.aliases.some(a => a.toLowerCase() === lower)) {
      return { id: def.canonical_id, name: def.name, aliases: def.aliases, known: true };
    }
  }
  return { id: slug(name), name, aliases: [], known: false };
}

export function parseMspTable(
  items: PosItem[],
  season: string,
  marketingYear: string
): ExtractedCropRecord[] {
  const clean = items.filter(i => i.str.trim() && !/^[\^*]+$/.test(i.str.trim()));

  // 1. group into lines and find data rows (>= 5 numeric/dash cells)
  const lines: { page: number; y: number; items: PosItem[] }[] = [];
  for (const it of clean) {
    let l = lines.find(l => l.page === it.page && Math.abs(l.y - it.y) < 3);
    if (!l) lines.push((l = { page: it.page, y: it.y, items: [] }));
    l.items.push(it);
  }
  lines.sort((a, b) => pos(a) - pos(b));

  interface Row {
    page: number;
    y: number;
    serial: number | null;
    values: (number | null)[];
    lastX: number;
    firstValueX: number;
    pct: number | null;
    variantParts: PosItem[];
    cropParts: PosItem[];
    category: string | null;
  }
  const rows: Row[] = [];
  for (const l of lines) {
    // serial number sits in the leftmost column (x < 80); value cells are to its right
    const serialCell = l.items.find(i => i.x < 80 && /^\d{1,2}\.?$/.test(i.str.trim())) ?? null;
    const cells = l.items.filter(i => i.x >= 80 && NUM_RX.test(i.str.trim())).sort((a, b) => a.x - b.x);
    if (cells.length < 5) continue;
    const n = cells.length >= 7 ? 7 : 5;
    const vals = cells.slice(-n);
    rows.push({
      page: l.page,
      y: l.y,
      serial: serialCell ? parseInt(serialCell.str, 10) : null,
      values: vals.map(c => toNum(c.str.trim())),
      lastX: vals[vals.length - 1].x,
      firstValueX: vals[0].x,
      pct: null,
      variantParts: [],
      cropParts: [],
      category: null,
    });
  }
  if (rows.length === 0) return [];

  const mspX = Math.min(...rows.map(r => r.firstValueX));
  const nameItems = clean
    .filter(i => !NUM_RX.test(i.str.trim()) && !/^\d+\.$/.test(i.str.trim()))
    .filter(i => i.x >= 80 && i.x < mspX - 5)
    .filter(i => rows.some(r => r.page === i.page && Math.abs(r.y - i.y) <= 45));
  const cropColX = Math.min(...nameItems.map(i => i.x), Infinity);

  // 2. "(86%)" under the last column
  for (const it of clean) {
    const m = it.str.trim().match(PCT_RX);
    if (!m) continue;
    const cand = rows
      .filter(r => r.page === it.page && r.y > it.y && Math.abs(r.lastX - it.x) < 25)
      .sort((a, b) => a.y - b.y)[0];
    if (cand && cand.pct === null) cand.pct = parseFloat(m[1]);
  }

  // 3. categories (in reading order) and names (nearest row on same page)
  const cats = clean
    .filter(i => i.x >= 80 && i.x < mspX - 5 && CATEGORY_RX.test(i.str.trim()))
    .sort((a, b) => pos(a) - pos(b));
  for (const r of rows) {
    const before = cats.filter(c => pos(c) < pos(r));
    r.category = before.length ? before[before.length - 1].str.trim() : null;
  }
  for (const it of nameItems) {
    if (CATEGORY_RX.test(it.str.trim())) continue;
    const near = rows
      .filter(r => r.page === it.page)
      .map(r => ({ r, d: Math.abs(r.y - it.y) }))
      .sort((a, b) => a.d - b.d)[0];
    if (!near || near.d > 45) continue;
    (it.x > cropColX + 15 ? near.r.variantParts : near.r.cropParts).push(it);
  }

  // 4. group rows into blocks (a serial number starts a new crop; serial-less rows are variants)
  const records: ExtractedCropRecord[] = [];
  let blockCrop = '';
  let blockSerial: number | null = null;
  const joinParts = (parts: PosItem[]) =>
    parts
      .sort((a, b) => pos(a) - pos(b) || a.x - b.x)
      .map(p => p.str.replace(/[\^*]/g, '').trim())
      .join(' ')
      .replace(/\s*\/\s*/g, '/')
      .replace(/\s+/g, ' ')
      .trim();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.serial !== null) {
      blockSerial = r.serial;
      // collect crop-column parts of this row and any following serial-less rows
      const group = [r];
      for (let j = i + 1; j < rows.length && rows[j].serial === null; j++) group.push(rows[j]);
      blockCrop = joinParts(group.flatMap(g => g.cropParts));
    }
    let group = blockCrop;
    let variant = joinParts(r.variantParts).replace(/^\(|\)$/g, '').trim() || null;
    // "Soybean (Yellow)" printed as one cell: split into crop + variety unless it is a known canonical name
    const combined = !variant && blockCrop.match(/^(.+?)\s*\((.+)\)$/);
    if (combined && !resolveCrop(blockCrop).known) {
      group = combined[1];
      variant = combined[2];
    }
    const fullName = variant ? `${group} (${variant})` : group;
    const crop = resolveCrop(fullName);

    const v = r.values;
    const full = v.length === 7;
    const [msp, cost, margin, prev] = v;
    const inc = full ? v[5] : v[4];
    const base = full ? v[4] : null;
    const incBase = full ? v[6] : null;

    const errors: string[] = [];
    if (!msp || msp <= 0) errors.push('MSP must be a positive number');
    const prevYear = (() => {
      const m = marketingYear.match(/^(\d{4})-(\d{2})$/);
      if (!m) return null;
      const y = parseInt(m[1], 10) - 1;
      return `${y}-${String(y % 100 + 1).padStart(2, '0')}`;
    })();

    records.push({
      crop_id: crop.id,
      crop_name: crop.name,
      crop_aliases: crop.aliases,
      season,
      marketing_year: marketingYear,
      msp,
      unit: 'INR/quintal',
      cost_of_production: cost,
      margin_percent: margin,
      validation_status: errors.length ? 'error' : 'valid',
      validation_errors: errors,
      serial_no: blockSerial,
      crop_group: group || null,
      variety: variant,
      category: r.category ? r.category[0].toUpperCase() + r.category.slice(1).toLowerCase() : `${season} crops`,
      prev_year_label: prevYear,
      prev_year_msp: prev,
      increase_abs: inc,
      base_year_label: full ? '2013-14' : null,
      base_year_msp: base,
      increase_over_base_abs: incBase,
      increase_over_base_pct: full ? r.pct : null,
      notes: cost === null ? ['Cost data not separately compiled for this variety'] : [],
    });
  }
  return records;
}
