// Build the barcode-sticker print HTML. @page = the label sticker W×H, padding on
// each per-page div (needed once copies>1 → multiple pages). Each cell renders the
// design at a FIXED reference box (refWmm×refHmm, fixed type/barcode) then scales
// it uniformly (CSS transform) to fill the real cell — one look at every paper
// size / count. LABEL_FIT_SCRIPT is still embedded so the print/preview handler
// can await window.__labelFitReady (fonts loaded) before snapshotting; it just
// finds no .label-fit elements to touch here. Layout comes from the resolved
// preset, NOT free fields.

import type { LabelSettingsForm } from '@/lib/label/sections'
import { barcodeSvg } from '@/lib/label/barcode'
import { LABEL_FIT_SCRIPT } from '@/lib/label/fit'
import { buildPrintFontFaceCss, esc } from '@/lib/print/fonts'
import { resolveStickerLayout } from './presets'
import type { BarcodeStickerForm, TagCell } from './types'

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.min(hi, Math.max(lo, Math.round(n)))
}

function priceStr(price: number): string {
  // "ราคา 10 บาท" — drop the .00 on whole numbers, keep 2 decimals otherwise.
  return Number.isInteger(price) ? String(price) : price.toFixed(2)
}

function cellHtml(cell: TagCell, cfg: BarcodeStickerForm, L: ReturnType<typeof resolveStickerLayout>): string {
  const parts: string[] = []
  // Top line: product name, bold, left-aligned. Font size is FIXED — a name too
  // long for the cell is truncated with an ellipsis (clip the characters), never
  // shrunk, so every sticker keeps the same type size.
  if (cfg.show_name) {
    parts.push(
      `<div style="font-size:${L.fontNamePt}pt;font-weight:700;line-height:1;` +
        `white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(cell.name)}</div>`,
    )
  }
  parts.push(
    `<div style="width:100%;height:${L.barcodeHeightMm}mm;margin:0;line-height:0">` +
      `${barcodeSvg(cell.barcode, { displayValue: false })}</div>`,
  )
  // Bottom line: barcode digits and/or "ราคา X บาท", joined by " | ".
  const meta: string[] = []
  if (cfg.show_digits) meta.push(esc(cell.barcode))
  if (cfg.show_price) meta.push(` ${priceStr(cell.price)} บาท`)
  if (meta.length) {
    parts.push(`<div style="font-size:${L.fontMetaPt}pt;line-height:1;white-space:nowrap">${meta.join(' | ')}</div>`)
  }
  return parts.join('')
}

export async function buildBarcodeStickerHtml(
  paper: LabelSettingsForm,
  cfg: BarcodeStickerForm,
  cells: (TagCell | null)[],
  copies: number,
): Promise<string> {
  const L = resolveStickerLayout(paper)
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
    // INNER cut lines only (scissor guides): draw a cell's right edge only when a
    // column follows it, and its bottom edge only when a row follows. The sheet's
    // outer rim has no border. Extra padding keeps content clear of the cut line.
    const col = i % L.cols
    const row = Math.floor(i / L.cols)
    const right = col < L.cols - 1 ? 'border-right:0.2mm solid #000;' : ''
    const bottom = row < L.rows - 1 ? 'border-bottom:0.2mm solid #000;' : ''
    // Minimal inset — just enough to keep content off the cut line.
    const frame = `overflow:hidden;${right}${bottom}box-sizing:border-box;padding:1mm`
    if (!cell) return `<div class="label-area" style="${frame}"></div>`
    // The design is authored at a FIXED reference box (refWmm×refHmm) with fixed
    // type/barcode, then scaled uniformly to fill the real cell — same look at any
    // size. Center it; transform scales the whole block as one (no distortion).
    const design =
      `<div style="width:${L.refWmm}mm;height:${L.refHmm}mm;transform:scale(${L.scale});transform-origin:center;` +
      `display:flex;flex-direction:column;justify-content:center;text-align:left">` +
      `${cellHtml(cell, cfg, L)}</div>`
    return (
      `<div class="label-area" style="${frame}">` +
      `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%">` +
      `${design}</div></div>`
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
