// Fixed "write-your-own" blank label — a generic pre-printed form the staff fills
// in by hand (write the dose, circle the meal relation + times). It is NOT the
// product-driven drug label: there is no SECTIONS model, no per-section config,
// no editor. ONE fixed layout, rendered here as the single source of truth so the
// POS print dialog and the /products/print tab produce identical output.
//
// Reuses the drug-label print plumbing: the configured label paper size / padding
// / font from label_settings, the @font-face embedder, and the auto shrink-to-fit
// script (LABEL_FIT_SCRIPT) so the fixed form scales down onto smaller stickers.
import { esc, buildPrintFontFaceCss } from '@/lib/print/fonts'
import { LABEL_FIT_SCRIPT } from './fit'
import type { LabelSettingsForm } from './sections'

export interface BlankLabelShop {
  shop_name?: string | null
  shop_address?: string | null
  shop_phone?: string | null
}

// A labelled write-in line: leading text + a flexible underline to write on,
// optional trailing text (e.g. a unit hint) on the right of the rule.
function writeLine(label: string, after = ''): string {
  const tail = after
    ? `<span style="white-space:nowrap">${esc(after)}</span>`
    : ''
  return (
    `<div style="display:flex;align-items:flex-end;gap:1.5mm;margin-top:2mm">` +
    `<span style="white-space:nowrap">${esc(label)}</span>` +
    `<span style="flex:1 1 auto;min-width:6mm;border-bottom:0.3mm solid #000"></span>` +
    tail +
    `</div>`
  )
}

// A row of circle-able choices: each word gets breathing room so a pen circle
// fits around it. The staff circles the one(s) that apply.
function choiceRow(label: string, words: string[]): string {
  const chips = words
    .map(w => `<span style="display:inline-block;padding:0.4mm 2mm;white-space:nowrap">${esc(w)}</span>`)
    .join('')
  return (
    `<div style="display:flex;align-items:baseline;gap:1.5mm;margin-top:2mm">` +
    `<span style="white-space:nowrap">${esc(label)}</span>` +
    `<span style="flex:1 1 auto;display:flex;flex-wrap:wrap;gap:0.5mm 1mm">${chips}</span>` +
    `</div>`
  )
}

// The inner body of the blank label (the content inside .label-fit). Shop header
// (name + address/phone) is printed when available so the form still reads as the
// pharmacy's own dispensing label; everything below is blank for hand-writing.
function renderBlankInner(shop: BlankLabelShop | null): string {
  const name = shop?.shop_name?.trim() || ''
  const addr = shop?.shop_address?.trim() || ''
  const phone = shop?.shop_phone?.trim() ? `โทร. ${shop.shop_phone.trim()}` : ''
  const sub = [addr, phone].filter(Boolean).join('  ·  ')

  const header = name
    ? `<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:2mm">` +
        `<span style="font-weight:bold">${esc(name)}</span>` +
        `<span style="font-size:0.8em;white-space:nowrap">วันที่ ____/____/____</span>` +
      `</div>`
    : `<div style="text-align:right;font-size:0.8em">วันที่ ____/____/____</div>`
  const subRow = sub ? `<div style="font-size:0.8em;margin-top:0.5mm">${esc(sub)}</div>` : ''
  const divider = `<div style="border-top:0.4mm solid #000;margin-top:1.5mm"></div>`

  return (
    header +
    subRow +
    divider +
    writeLine('ชื่อยา / อาการ') +
    writeLine('รับประทานครั้งละ') +
    choiceRow('มื้อ', ['ก่อนอาหาร', 'หลังอาหาร', 'พร้อมอาหาร']) +
    choiceRow('เวลา', ['เช้า', 'กลางวัน', 'เย็น', 'ก่อนนอน'])
  )
}

// Build the full print/preview document for the blank label: `copies` pages, one
// blank form per page, page-break between, in a single spool job. `copies = 1`
// also serves the on-screen iframe preview (preview = print 1:1). Mirrors the
// page wrapper + fit-script structure of buildLabelSheetHtml.
export async function buildBlankLabelHtml(
  settings: LabelSettingsForm,
  shop: BlankLabelShop | null,
  copies: number,
): Promise<string> {
  const n = Math.max(1, Math.min(99, Math.floor(copies) || 1))
  const fontFaceCss = await buildPrintFontFaceCss(settings.font_family)
  const inner = renderBlankInner(shop)

  const pageStyle = [
    `width:${settings.width_mm}mm`,
    `height:${settings.height_mm}mm`,
    `padding:${settings.pad_top}mm ${settings.pad_right}mm ${settings.pad_bottom}mm ${settings.pad_left}mm`,
    `box-sizing:border-box`,
    `overflow:hidden`,
    `break-after:page`,
    `page-break-after:always`,
  ].join(';')

  const pages = Array.from({ length: n })
    .map(
      () =>
        `<div class="label-page" style="${pageStyle}">` +
        `<div class="label-area" style="width:100%;height:100%">` +
        `<div class="label-fit">${inner}</div></div></div>`,
    )
    .join('')

  return (
    `<!doctype html><html><head><meta charset="utf-8">\n` +
    `<style>\n${fontFaceCss}\n` +
    `@page { size: ${settings.width_mm}mm ${settings.height_mm}mm; margin: 0; }\n` +
    `html, body { margin: 0; padding: 0; }\n` +
    `body { font-family: '${settings.font_family}', sans-serif; line-height: ${settings.line_spacing}; color: #000; background: #fff; }\n` +
    `.label-page:last-child { break-after: auto; page-break-after: auto; }\n` +
    `.label-page .label-fit > div:first-child { margin-top: 0 !important; }\n` +
    `</style></head><body>${pages}<script>${LABEL_FIT_SCRIPT}</script></body></html>`
  )
}
