// Build the A4/A5 price-tag print HTML. paperSize comes from
// document_settings.paper_size (no hardcoded A4). Layout (cols/rows/gap/fonts/
// barcode height) resolves from the preset per paper size. show_cut_lines draws
// a thin border on EVERY cell (incl. empty) so the sheet can be cut as a grid.
// Each cell wraps in .label-area > .label-fit + LABEL_FIT_SCRIPT for per-cell
// shrink-to-fit (and window.__labelFitReady for the print/preview handler).

import { barcodeSvg } from '@/lib/label/barcode'
import { LABEL_FIT_SCRIPT } from '@/lib/label/fit'
import { buildPrintFontFaceCss, esc } from '@/lib/print/fonts'
import { formatDate } from '@/lib/utils'
import { resolvePriceTagPreset } from './presets'
import type { PriceTagForm, TagCell } from './types'

function paperDims(paperSize: 'A4' | 'A5'): { w: number; h: number } {
  return paperSize === 'A5' ? { w: 148, h: 210 } : { w: 210, h: 297 }
}

// 7-Eleven-style layout, split into a YELLOW top band (name + price) and a WHITE
// bottom (print date + barcode pinned to the very bottom). Per-element sizes are
// read STRAIGHT from the form (same pattern as the sticker builder); the preset
// (L) only supplies the grid. `printDate` = the day this sheet is printed.
function cellHtml(cell: TagCell, cfg: PriceTagForm, printDate: string): string {
  // "บาท" rides at ~45% of the price size (kept proportional, no separate field).
  const bahtPt = Math.max(6, Math.round(cfg.font_price_pt * 0.45))
  const gap = cfg.line_gap_mm >= 0 ? cfg.line_gap_mm : 1

  // name — left, bold, single line; CLIPPED horizontally (no wrap, no "…"). Use
  // overflow-x:clip + overflow-y:visible so Thai lower vowels (ุ/ู) and tone marks
  // are NOT cut off (plain overflow:hidden clips them vertically).
  const name = cfg.show_name
    ? `<div style="font-size:${cfg.font_name_pt}pt;font-weight:700;line-height:1.25;` +
        `white-space:nowrap;overflow-x:clip;overflow-y:visible">${esc(cell.name)}</div>`
    : ''

  // price line — big PRICE on the right (unit moved down to the date line).
  // price_compact option: drop the decimals AND the "บาท" suffix.
  const priceText = cfg.price_compact ? cell.price.toFixed(0) : cell.price.toFixed(2)
  const bahtTag = cfg.price_compact ? '' : `<span style="font-size:${bahtPt}pt">บาท</span>`
  const priceRow = cfg.show_price
    ? `<div style="display:flex;align-items:baseline;justify-content:flex-end;gap:1mm;white-space:nowrap">` +
        `<span style="font-size:${cfg.font_price_pt}pt;font-weight:800;line-height:0.95">${priceText}</span>${bahtTag}</div>`
    : ''

  // TOP band — name + price. Yellow fill (option) bleeds to the top/side edges
  // (the cell itself has no padding now) and STOPS right after the price line.
  const topBg = cfg.fill_yellow ? 'background:#FFE600;' : ''
  const top = `<div style="${topBg}padding:1.5mm 2mm;display:flex;flex-direction:column;gap:${gap}mm">${name}${priceRow}</div>`

  // unit (left) + print date (right) on ONE row — the date replaces the old code.
  const showUnit = !!(cfg.show_unit && cell.unit_name)
  const dateBlock = (cfg.show_code || showUnit)
    ? `<div style="display:flex;align-items:baseline;justify-content:space-between;gap:2mm;white-space:nowrap;color:#000">` +
        `<span style="font-size:${cfg.font_unit_pt}pt;line-height:1.15">${showUnit ? esc(cell.unit_name) : ''}</span>` +
        `<span style="font-size:${cfg.font_code_pt}pt;line-height:1.15">${cfg.show_code ? printDate : ''}</span></div>`
    : ''

  // barcode — STRICT (only the row's own). FULL width + FLAT bars (no EAN guard
  // "tails"), pinned to the bottom edge (margin-top:auto) like 7-11.
  const barcode = (cfg.show_barcode && cell.barcode)
    ? `<div style="width:100%;height:${cfg.barcode_h_mm}mm;margin-top:auto">` +
        `${barcodeSvg(cell.barcode, { displayValue: false, flat: true, stretch: true })}</div>`
    : ''

  // BOTTOM section — white; date then barcode (barcode pinned to the bottom).
  const bottom = `<div style="flex:1;min-height:0;display:flex;flex-direction:column;gap:${gap}mm;padding:1mm 2mm 1.5mm">${dateBlock}${barcode}</div>`

  return `<div style="width:100%;height:100%;display:flex;flex-direction:column;text-align:left">${top}${bottom}</div>`
}

export async function buildPriceTagHtml(
  cfg: PriceTagForm,
  cells: (TagCell | null)[],
  paperSize: 'A4' | 'A5',
): Promise<string> {
  const L = resolvePriceTagPreset(cfg.preset, paperSize)
  const fontFaceCss = await buildPrintFontFaceCss('Sarabun')
  const familyStack = `'Sarabun', sans-serif`
  const { w, h } = paperDims(paperSize)
  const n = L.cols * L.rows
  const border = cfg.show_cut_lines ? 'border:0.3pt solid #000;' : ''
  // The cell has NO padding now — the yellow band/sections own their insets so the
  // fill can bleed to the edges (7-11 style). Date = the day this sheet is printed.
  const printDate = formatDate(new Date().toISOString())

  const cellsHtml = Array.from({ length: n }, (_, i) => {
    const cell = cells[i] ?? null
    const cellStyle = `box-sizing:border-box;overflow:hidden;${border}`
    if (!cell) return `<div style="${cellStyle}"></div>`
    return (
      `<div class="label-area" style="${cellStyle}">` +
      `<div class="label-fit" style="display:flex;flex-direction:column;width:100%;height:100%">` +
      `${cellHtml(cell, cfg, printDate)}` +
      `</div></div>`
    )
  }).join('')

  const pageStyle = [
    `width:${w}mm`,
    `height:${h}mm`,
    `padding:6mm`,
    `box-sizing:border-box`,
    `display:grid`,
    `grid-template-columns:repeat(${L.cols},1fr)`,
    `grid-template-rows:repeat(${L.rows},1fr)`,
    `gap:${L.gapMm}mm`,
  ].join(';')

  return `<!doctype html><html><head><meta charset="utf-8">
<style>
${fontFaceCss}
@page { size: ${paperSize}; margin: 0; }
html, body { margin: 0; padding: 0; }
body { font-family: ${familyStack}; color: #000; background: #fff; }
svg { display: block; width: 100%; height: 100%; }
</style></head><body><div class="tag-page" style="${pageStyle}">${cellsHtml}</div><script>${LABEL_FIT_SCRIPT}</script></body></html>`
}
