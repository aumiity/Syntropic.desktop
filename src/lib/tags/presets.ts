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
}

// A cell smaller than this can't fit a scannable barcode + readable text.
const MIN_CELL_W_MM = 18
const MIN_CELL_H_MM = 10

// --- Sticker presets: a grid of N labels per die-cut sheet -------------------
// Each preset picks cols×rows so the cells stay as square as the paper allows;
// orientation is chosen per paper aspect (wide paper → more columns).
interface StickerSpec {
  count: number
  fontNamePt: number
  fontPricePt: number
  fontMetaPt: number
  barcodeHeightMm: number
}

const STICKER_SPECS: Record<string, StickerSpec> = {
  '1up': { count: 1, fontNamePt: 11, fontPricePt: 16, fontMetaPt: 8, barcodeHeightMm: 16 },
  '2up': { count: 2, fontNamePt: 10, fontPricePt: 14, fontMetaPt: 7.5, barcodeHeightMm: 13 },
  '4up': { count: 4, fontNamePt: 9, fontPricePt: 12, fontMetaPt: 7, barcodeHeightMm: 11 },
  '6up': { count: 6, fontNamePt: 8, fontPricePt: 11, fontMetaPt: 6.5, barcodeHeightMm: 9 },
  '8up': { count: 8, fontNamePt: 7.5, fontPricePt: 10, fontMetaPt: 6, barcodeHeightMm: 8 },
}

const STICKER_ORDER = ['1up', '2up', '4up', '6up', '8up']

const STICKER_LABEL: Record<string, string> = {
  '1up': '1 ดวงต่อแผ่น',
  '2up': '2 ดวงต่อแผ่น',
  '4up': '4 ดวงต่อแผ่น',
  '6up': '6 ดวงต่อแผ่น',
  '8up': '8 ดวงต่อแผ่น',
}

// Factor `count` into cols×rows, picking the split that makes each cell closest
// to square given the printable area aspect ratio.
function gridForCount(count: number, areaWmm: number, areaHmm: number): { cols: number; rows: number } {
  let best: { cols: number; rows: number } | null = null
  let bestScore = Infinity
  for (let cols = 1; cols <= count; cols++) {
    if (count % cols !== 0) continue
    const rows = count / cols
    const cellW = areaWmm / cols
    const cellH = areaHmm / rows
    // Closest to square = aspect ratio nearest 1.
    const aspect = cellW > cellH ? cellW / cellH : cellH / cellW
    if (aspect < bestScore) {
      bestScore = aspect
      best = { cols, rows }
    }
  }
  return best ?? { cols: 1, rows: count }
}

export function resolveStickerPreset(preset: string, paper: LabelSettingsForm): ResolvedLayout {
  const spec = STICKER_SPECS[preset] ?? STICKER_SPECS['4up']
  const gapMm = 2
  const areaW = Math.max(0, paper.width_mm - paper.pad_left - paper.pad_right)
  const areaH = Math.max(0, paper.height_mm - paper.pad_top - paper.pad_bottom)
  const { cols, rows } = gridForCount(spec.count, areaW, areaH)
  const cellWmm = cols > 0 ? (areaW - gapMm * (cols - 1)) / cols : 0
  const cellHmm = rows > 0 ? (areaH - gapMm * (rows - 1)) / rows : 0
  const tooSmall = cellWmm < MIN_CELL_W_MM || cellHmm < MIN_CELL_H_MM
  return {
    cols,
    rows,
    gapMm,
    fontNamePt: spec.fontNamePt,
    fontPricePt: spec.fontPricePt,
    fontMetaPt: spec.fontMetaPt,
    barcodeHeightMm: spec.barcodeHeightMm,
    cellWmm,
    cellHmm,
    tooSmall,
  }
}

export function stickerPresets(
  paper: LabelSettingsForm,
): { key: string; label: string; layout: ResolvedLayout }[] {
  return STICKER_ORDER.map((key) => ({
    key,
    label: STICKER_LABEL[key],
    layout: resolveStickerPreset(key, paper),
  }))
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
