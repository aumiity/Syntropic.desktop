// Build the A4/A5 price-tag print HTML. paperSize comes from
// document_settings.paper_size (no hardcoded A4). Layout (cols/rows/gap/fonts/
// barcode height) resolves from the preset per paper size. show_cut_lines draws
// a thin border on EVERY cell (incl. empty) so the sheet can be cut as a grid.
// Each cell wraps in .label-area > .label-fit + LABEL_FIT_SCRIPT for per-cell
// shrink-to-fit (and window.__labelFitReady for the print/preview handler).

import { barcodeSvg } from '@/lib/label/barcode'
import { LABEL_FIT_SCRIPT } from '@/lib/label/fit'
import { buildPrintFontFaceCss, esc } from '@/lib/print/fonts'
import { resolvePriceTagPreset } from './presets'
import type { PriceTagForm, TagCell } from './types'

function paperDims(paperSize: 'A4' | 'A5'): { w: number; h: number } {
  return paperSize === 'A5' ? { w: 148, h: 210 } : { w: 210, h: 297 }
}

function cellHtml(cell: TagCell, cfg: PriceTagForm, L: ReturnType<typeof resolvePriceTagPreset>): string {
  const parts: string[] = []
  if (cfg.show_name) {
    parts.push(
      `<div style="font-size:${L.fontNamePt}pt;line-height:1.2;text-align:center;` +
        `display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(cell.name)}</div>`,
    )
  }
  if (cfg.show_price) {
    parts.push(
      `<div style="font-size:${L.fontPricePt}pt;font-weight:700;text-align:center;line-height:1.1">` +
        `${cell.price.toFixed(2)} <span style="font-size:${L.fontMetaPt}pt;font-weight:400">บาท</span></div>`,
    )
  }
  const meta: string[] = []
  if (cfg.show_code && cell.code) meta.push(esc(cell.code))
  if (cfg.show_unit && cell.unit_name) meta.push(esc(cell.unit_name))
  if (meta.length) {
    parts.push(`<div style="font-size:${L.fontMetaPt}pt;text-align:center;color:#333">${meta.join(' · ')}</div>`)
  }
  if (cfg.show_barcode) {
    parts.push(
      `<div style="width:80%;height:${L.barcodeHeightMm}mm;margin:1mm auto 0">` +
        `${barcodeSvg(cell.barcode, { displayValue: false })}</div>`,
    )
  }
  return parts.join('')
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

  const cellsHtml = Array.from({ length: n }, (_, i) => {
    const cell = cells[i] ?? null
    const cellStyle = `box-sizing:border-box;overflow:hidden;padding:3mm;${border}`
    if (!cell) return `<div style="${cellStyle}"></div>`
    return (
      `<div class="label-area" style="${cellStyle}">` +
      `<div class="label-fit" style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%">` +
      `${cellHtml(cell, cfg, L)}` +
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
