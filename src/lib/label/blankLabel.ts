// "Write-your-own" blank label — a pre-printed dispensing form the staff fills in
// by hand. It is NOT product-driven (no real dose/frequency/lookups), BUT it now
// reuses the EXACT drug-label template the user configured in Settings: same
// SECTIONS order, same per-section font / bold / offset / gap (via buildSectionStyle)
// and same shop header. The only difference is the drug-info sections (product,
// dosage, frequency, timing, indication, advice) are rendered as blank write-in
// lines / circle-able choices "stamped" into their template positions instead of
// real text — so a printed blank reads identically to a real label, just empty
// where the medicine-specific data goes. This file is the single source of truth
// so the POS print path and the /products/print tab produce identical output.
import type { CSSProperties } from 'react'
import { esc, buildPrintFontFaceCss } from '@/lib/print/fonts'
import { SECTIONS, buildSectionStyle, type LabelSettingsForm } from './sections'
import { styleToCss } from './html'
import { todayBE } from './content'

export interface BlankLabelShop {
  shop_name?: string | null
  shop_address?: string | null
  shop_phone?: string | null
  shop_line_id?: string | null
}

// A positioned write-in row: leading prompt + a flexible underline to write on,
// optional trailing text (e.g. a unit hint) after the rule. The OUTER div carries
// the section's template style (font/offset/gap); the inner flex draws the line.
function fieldRow(sectionCss: string, prompt: string, after = ''): string {
  const tail = after
    ? `<span style="white-space:nowrap;margin-left:1.5mm">${esc(after)}</span>`
    : ''
  return (
    `<div style="${sectionCss}">` +
    `<div style="display:flex;align-items:flex-end;gap:1.5mm">` +
    `<span style="white-space:nowrap">${esc(prompt)}</span>` +
    `<span style="flex:1 1 auto;min-width:6mm;border-bottom:0.3mm solid #000"></span>` +
    tail +
    `</div></div>`
  )
}

// One group of circle-able choices: each word gets breathing room so a pen circle
// fits around it. The staff circles the one(s) that apply.
function choiceGroup(label: string, words: string[]): string {
  const chips = words
    .map(w => `<span style="display:inline-block;padding:0.4mm 2mm;white-space:nowrap">${esc(w)}</span>`)
    .join('')
  const lead = label ? `<span style="white-space:nowrap">${esc(label)}</span>` : ''
  return (
    `<div style="display:flex;align-items:baseline;gap:1.5mm">` +
    lead +
    `<span style="flex:1 1 auto;display:flex;flex-wrap:wrap;gap:0.5mm 1mm">${chips}</span>` +
    `</div>`
  )
}

// The timing section (มื้อ + เวลา) renders TWO circle rows stacked inside the one
// `timing` template position, mirroring the meal-relation + label-time split.
function timingRow(sectionCss: string): string {
  return (
    `<div style="${sectionCss}">` +
    `<div>${choiceGroup('', ['ก่อนอาหาร', 'หลังอาหาร', 'พร้อมอาหาร'])}</div>` +
    `<div style="margin-top:1mm">${choiceGroup('', ['เช้า', 'กลางวัน', 'เย็น', 'ก่อนนอน'])}</div>` +
    `</div>`
  )
}

// The shop name (left) + print date (right) flex row — a 1:1 copy of the real
// label's shop handling (renderLabelSectionsHtml): lift the shop offset OFF the
// flex container and re-apply to the name span only so the date keeps its own
// offset. The date prints today's date (Buddhist era, matching real labels) only
// when `printDate` is on; otherwise the right side is blank for hand-writing.
function shopRow(settings: LabelSettingsForm, shop: BlankLabelShop | null, printDate: boolean): string {
  const sec = SECTIONS.find(s => s.key === 'shop')!
  const name = settings.show_shop ? (shop?.shop_name?.trim() || '') : ''
  const showDate = printDate && !!settings.show_print_date
  if (!name && !showDate) return ''
  const secStyle = buildSectionStyle(sec, settings)
  const shopTransform = secStyle.transform
  const style = styleToCss({
    ...secStyle, transform: undefined,
    whiteSpace: 'normal', display: 'flex', justifyContent: 'space-between', gap: '4mm',
  } as CSSProperties)
  const nameSpan = name
    ? `<span style="${styleToCss({ transform: shopTransform })}">${esc(name)}</span>`
    : '<span></span>'
  const dateStyle: CSSProperties = {
    fontSize:   `${settings.font_size_print_date}pt`,
    fontWeight: settings.bold_print_date ? 'bold' : 'normal',
    transform:  `translate(${settings.offset_x_print_date}mm, ${settings.offset_y_print_date}mm)`,
  }
  const dateSpan = showDate ? `<span style="${styleToCss(dateStyle)}">${esc(todayBE())}</span>` : ''
  return `<div style="${style}">${nameSpan}${dateSpan}</div>`
}

// Walk SECTIONS in the LOCKED template order, rendering each at its configured
// position (buildSectionStyle). Shop rows carry REAL shop data; drug-info sections
// become blank write-in rows / circle choices; qty / expiry / barcode are skipped
// (per-dispense data that is meaningless on a generic blank). Visibility honours
// the same show_* toggles as the real label, so a section hidden in Settings is
// hidden here too. Empty rows are filtered so the `.label-fit > :first-child`
// margin reset lands on the true first row.
function renderBlankInner(settings: LabelSettingsForm, shop: BlankLabelShop | null, printDate: boolean): string {
  const out: string[] = []
  for (const sec of SECTIONS) {
    const css = styleToCss(buildSectionStyle(sec, settings))
    switch (sec.key) {
      case 'shop':
        out.push(shopRow(settings, shop, printDate)); break
      case 'print_date': break // folded into the shop row
      case 'shop_address':
        if (settings.show_shop_address && shop?.shop_address?.trim())
          out.push(`<div style="${css}">${esc(shop.shop_address.trim())}</div>`)
        break
      case 'shop_phone':
        if (settings.show_shop_phone && shop?.shop_phone?.trim())
          out.push(`<div style="${css}">${esc('โทร. ' + shop.shop_phone.trim())}</div>`)
        break
      case 'shop_line_id':
        if (settings.show_shop_line_id && shop?.shop_line_id?.trim())
          out.push(`<div style="${css}">${esc('LINE: ' + shop.shop_line_id.trim())}</div>`)
        break
      case 'header_line':
        if (settings.show_header_line) out.push(`<div style="${css}"></div>`)
        break
      case 'product':
        if (settings.show_product) out.push(fieldRow(css, 'ชื่อยา')); break
      case 'qty': break // no quantity on a generic blank
      case 'dosage':
        if (settings.show_dosage) out.push(fieldRow(css, 'รับประทานครั้งละ')); break
      case 'expiry': break // no lot expiry on a generic blank
      case 'frequency':
        if (settings.show_frequency) out.push(fieldRow(css, 'ความถี่ วันละ', 'ครั้ง')); break
      case 'timing':
        if (settings.show_timing) out.push(timingRow(css)); break
      case 'indication':
        if (settings.show_indication) out.push(fieldRow(css, 'อาการ')); break
      case 'advice':
        if (settings.show_advice) out.push(fieldRow(css, 'คำแนะนำ')); break
      case 'barcode': break // a barcode needs a real product
      case 'custom_text':
        if (settings.show_custom_text && settings.custom_text?.trim())
          out.push(`<div style="${css}">${esc(settings.custom_text).replace(/\n/g, '<br>')}</div>`)
        break
    }
  }
  return out.filter(Boolean).join('')
}

// Build the full print/preview document for the blank label: `copies` pages, one
// blank form per page, page-break between, in a single spool job. `copies = 1`
// also serves the on-screen iframe preview (preview = print 1:1). Mirrors the page
// wrapper of buildLabelSheetHtml — NO auto shrink-to-fit (matches the real label
// since 2026-06-19): sections render at their EXACT configured sizes and
// `overflow:hidden` clips anything past the sticker edge.
export async function buildBlankLabelHtml(
  settings: LabelSettingsForm,
  shop: BlankLabelShop | null,
  copies: number,
  printDate = false,
): Promise<string> {
  const n = Math.max(1, Math.min(99, Math.floor(copies) || 1))
  const fontFaceCss = await buildPrintFontFaceCss(settings.font_family)
  const inner = renderBlankInner(settings, shop, printDate)

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
    `</style></head><body>${pages}</body></html>`
  )
}
