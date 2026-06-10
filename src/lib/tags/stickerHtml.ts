// Build the barcode-sticker print HTML. Mirrors buildLabelSheetHtml
// (src/lib/label/html.ts): @page = the label sticker W×H, padding on each
// per-page div (needed once copies>1 → multiple pages), every cell wrapped in
// .label-area > .label-fit so LABEL_FIT_SCRIPT shrink-to-fits each cell and the
// print/preview handler can await window.__labelFitReady. Layout (cols/rows/gap/
// font sizes/barcode height) comes from the resolved preset, NOT free fields.

import type { LabelSettingsForm } from '@/lib/label/sections'
import { barcodeSvg } from '@/lib/label/barcode'
import { LABEL_FIT_SCRIPT } from '@/lib/label/fit'
import { buildPrintFontFaceCss, esc } from '@/lib/print/fonts'
import { resolveStickerPreset } from './presets'
import type { BarcodeStickerForm, TagCell } from './types'

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.min(hi, Math.max(lo, Math.round(n)))
}

function cellHtml(cell: TagCell, cfg: BarcodeStickerForm, L: ReturnType<typeof resolveStickerPreset>): string {
  const parts: string[] = []
  if (cfg.show_name) {
    parts.push(
      `<div style="font-size:${L.fontNamePt}pt;line-height:1.15;text-align:center;` +
        `display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(cell.name)}</div>`,
    )
  }
  parts.push(
    `<div style="width:100%;height:${L.barcodeHeightMm}mm;margin:0.5mm 0">` +
      `${barcodeSvg(cell.barcode, { displayValue: false })}</div>`,
  )
  if (cfg.show_digits) {
    parts.push(`<div style="font-size:${L.fontMetaPt}pt;text-align:center;letter-spacing:0.5px">${esc(cell.barcode)}</div>`)
  }
  if (cfg.show_price) {
    parts.push(`<div style="font-size:${L.fontPricePt}pt;font-weight:700;text-align:center">${cell.price.toFixed(2)}</div>`)
  }
  return parts.join('')
}

export async function buildBarcodeStickerHtml(
  paper: LabelSettingsForm,
  cfg: BarcodeStickerForm,
  cells: (TagCell | null)[],
  copies: number,
): Promise<string> {
  const L = resolveStickerPreset(cfg.preset, paper)
  const fontFaceCss = await buildPrintFontFaceCss(paper.font_family)
  const familyStack = `'${paper.font_family}', sans-serif`
  const n = L.cols * L.rows
  const pageCount = clamp(copies, 1, 50)

  const pagePadStyle = [
    `width:${paper.width_mm}mm`,
    `height:${paper.height_mm}mm`,
    `padding:${paper.pad_top}mm ${paper.pad_right}mm ${paper.pad_bottom}mm ${paper.pad_left}mm`,
    `box-sizing:border-box`,
    `overflow:hidden`,
    `break-after:page`,
    `page-break-after:always`,
    `display:grid`,
    `grid-template-columns:repeat(${L.cols},1fr)`,
    `grid-template-rows:repeat(${L.rows},1fr)`,
    `gap:${L.gapMm}mm`,
  ].join(';')

  const cellsHtml = Array.from({ length: n }, (_, i) => {
    const cell = cells[i] ?? null
    if (!cell) return `<div></div>`
    return (
      `<div class="label-area" style="overflow:hidden">` +
      `<div class="label-fit" style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%">` +
      `${cellHtml(cell, cfg, L)}` +
      `</div></div>`
    )
  }).join('')

  const pages = Array.from({ length: pageCount }, () => `<div class="sticker-page" style="${pagePadStyle}">${cellsHtml}</div>`).join('')

  return `<!doctype html><html><head><meta charset="utf-8">
<style>
${fontFaceCss}
@page { size: ${paper.width_mm}mm ${paper.height_mm}mm; margin: 0; }
html, body { margin: 0; padding: 0; }
body { font-family: ${familyStack}; color: #000; background: #fff; }
.sticker-page:last-child { break-after: auto; page-break-after: auto; }
svg { display: block; width: 100%; height: 100%; }
</style></head><body>${pages}<script>${LABEL_FIT_SCRIPT}</script></body></html>`
}
