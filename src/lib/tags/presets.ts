// SSOT for the print-page layout presets. The print tab and both HTML builders
// resolve a preset key (e.g. '4up') into a concrete grid + font sizes here — no
// free cols/rows/gap. The cell width/height (mm) is COMPUTED from the real paper
// (label sticker W×H minus padding, or A4/A5), so a preset whose cells fall
// below MIN_CELL_MM is flagged tooSmall and the UI disables it.

import type { LabelSettingsForm } from '@/lib/label/sections'

export interface ResolvedLayout {
  cols: number
  rows: number
  gapMm: number
  fontNamePt: number
  fontPricePt: number
  fontMetaPt: number
  barcodeHeightMm: number
  cellWmm: number // computed from the actual paper
  cellHmm: number
  tooSmall: boolean // true → UI disables this preset for the current paper
  // Sticker only: the design is laid out at a FIXED reference box (refWmm×refHmm)
  // then scaled uniformly into the real cell — same look at any size. Price tags
  // don't use these (scale=1, ref=cell).
  scale: number
  refWmm: number
  refHmm: number
}

// A cell smaller than this can't fit a scannable barcode + readable text.
const MIN_CELL_W_MM = 18
const MIN_CELL_H_MM = 10

// --- Sticker layout: ONE fixed sticker size, count auto-derived from paper -----
// The single source of truth is the ideal sticker cell size below (STICKER_W×H)
// plus the design authored to fit it. The grid (cols×rows) is NOT chosen by the
// user — it's computed from the real label paper: "how many whole stickers of the
// ideal size fit". So every sticker always prints at the one good size, and a
// bigger sheet simply yields more of them. Tune the look in ONE place here.
//
// STICKER_W_MM / STICKER_H_MM — the ideal printed sticker size (the กำลังสวย one).
//   Changing these changes both the sticker size AND how many fit per sheet.
// STICKER_FONT_* / STICKER_BARCODE_H_MM — the design authored for that size.
const STICKER_W_MM = 40
const STICKER_H_MM = 15
const STICKER_FONT_NAME_PT = 8
const STICKER_FONT_META_PT = 7
const STICKER_BARCODE_H_MM = 7
// How much a sticker may shrink (per axis) to squeeze in ONE more per row/column.
// 0.9 = allow cells down to 90% of the ideal size. Without it, a plain floor()
// wastes nearly a whole row/column on "almost fits" cases (e.g. 80mm ÷ 42mm =
// 1.9 → 1 column, half the sheet wasted). Lower = packs more (smaller stickers);
// 1.0 = strict, never shrink to fit more.
const STICKER_FILL_TOLERANCE = 0.9

export function resolveStickerLayout(paper: LabelSettingsForm): ResolvedLayout {
  // gap 0: cells touch so the grid draws as ONE continuous single-line table.
  const gapMm = 0
  const areaW = Math.max(0, paper.width_mm - paper.pad_left - paper.pad_right)
  const areaH = Math.max(0, paper.height_mm - paper.pad_top - paper.pad_bottom)
  // Fit as many stickers as the paper allows, letting a near-miss cell shrink up
  // to STICKER_FILL_TOLERANCE rather than wasting the space (always ≥ 1). Cells
  // (areaW/cols) never fall below tolerance × ideal, so `scale` trims at most that.
  const cols = Math.max(1, Math.floor(areaW / (STICKER_W_MM * STICKER_FILL_TOLERANCE)))
  const rows = Math.max(1, Math.floor(areaH / (STICKER_H_MM * STICKER_FILL_TOLERANCE)))
  // Real cells split the paper evenly across that grid → always ≥ the ideal size,
  // so the fixed-size design sits centered in each cell with a little margin.
  const cellWmm = areaW / cols
  const cellHmm = areaH / rows
  // Normally 1 (print at the exact ideal size). Only shrinks if the paper is too
  // small to hold even one ideal sticker — never enlarges.
  const scale = Math.min(1, cellWmm / STICKER_W_MM, cellHmm / STICKER_H_MM)
  const tooSmall = areaW < STICKER_W_MM || areaH < STICKER_H_MM
  return {
    cols,
    rows,
    gapMm,
    fontNamePt: STICKER_FONT_NAME_PT,
    fontPricePt: STICKER_FONT_NAME_PT, // sticker has no separate price size (price is in the meta line)
    fontMetaPt: STICKER_FONT_META_PT,
    barcodeHeightMm: STICKER_BARCODE_H_MM,
    cellWmm,
    cellHmm,
    tooSmall,
    scale,
    refWmm: STICKER_W_MM,
    refHmm: STICKER_H_MM,
  }
}

// --- Price-tag presets: a grid of N tags per A4/A5 sheet ----------------------
interface PriceTagSpec {
  cols: number
  rows: number
  fontNamePt: number
  fontPricePt: number
  fontMetaPt: number
  barcodeHeightMm: number
}

// Defined for A4 (210×297). cols/rows are fixed per preset; A5 reuses the same
// grid on a half-size sheet (cells come out ~half, fonts shrink proportionally).
const PRICE_TAG_SPECS: Record<string, PriceTagSpec> = {
  '4up': { cols: 2, rows: 2, fontNamePt: 16, fontPricePt: 36, fontMetaPt: 11, barcodeHeightMm: 14 },
  '8up': { cols: 2, rows: 4, fontNamePt: 14, fontPricePt: 28, fontMetaPt: 10, barcodeHeightMm: 12 },
  '12up': { cols: 3, rows: 4, fontNamePt: 12, fontPricePt: 22, fontMetaPt: 9, barcodeHeightMm: 10 },
  '24up': { cols: 4, rows: 6, fontNamePt: 10, fontPricePt: 16, fontMetaPt: 8, barcodeHeightMm: 8 },
}

const PRICE_TAG_ORDER = ['4up', '8up', '12up', '24up']

const PRICE_TAG_LABEL: Record<string, string> = {
  '4up': '4 ป้ายต่อแผ่น',
  '8up': '8 ป้ายต่อแผ่น',
  '12up': '12 ป้ายต่อแผ่น',
  '24up': '24 ป้ายต่อแผ่น',
}

// A4 / A5 dimensions (mm).
function paperDims(paperSize: 'A4' | 'A5'): { w: number; h: number } {
  return paperSize === 'A5' ? { w: 148, h: 210 } : { w: 210, h: 297 }
}

export function resolvePriceTagPreset(preset: string, paperSize: 'A4' | 'A5'): ResolvedLayout {
  const spec = PRICE_TAG_SPECS[preset] ?? PRICE_TAG_SPECS['8up']
  const gapMm = 0 // cut-line grid: cells touch, margins live inside each cell
  const pagePadMm = 6
  const { w, h } = paperDims(paperSize)
  const areaW = w - pagePadMm * 2
  const areaH = h - pagePadMm * 2
  const cellWmm = spec.cols > 0 ? areaW / spec.cols : 0
  const cellHmm = spec.rows > 0 ? areaH / spec.rows : 0
  // A5 is ~half A4 area → scale fonts/barcode down so they keep their proportion.
  const scale = paperSize === 'A5' ? 0.72 : 1
  const tooSmall = cellWmm < MIN_CELL_W_MM || cellHmm < MIN_CELL_H_MM
  return {
    cols: spec.cols,
    rows: spec.rows,
    gapMm,
    fontNamePt: spec.fontNamePt * scale,
    fontPricePt: spec.fontPricePt * scale,
    fontMetaPt: spec.fontMetaPt * scale,
    barcodeHeightMm: spec.barcodeHeightMm * scale,
    cellWmm,
    cellHmm,
    tooSmall,
    // Price tags render directly at cell size (no uniform-scale-to-fit step).
    scale: 1,
    refWmm: cellWmm,
    refHmm: cellHmm,
  }
}

export function priceTagPresets(
  paperSize: 'A4' | 'A5',
): { key: string; label: string; layout: ResolvedLayout }[] {
  return PRICE_TAG_ORDER.map((key) => ({
    key,
    label: PRICE_TAG_LABEL[key],
    layout: resolvePriceTagPreset(key, paperSize),
  }))
}
