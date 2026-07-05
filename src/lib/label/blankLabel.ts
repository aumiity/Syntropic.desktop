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
import {
  SECTIONS, buildSectionStyle, isFoldedSection, isSectionToggledOn,
  buildReservedSlotStyle, type LabelSettingsForm,
} from './sections'
import { styleToCss } from './html'

export interface BlankLabelShop {
  shop_name?: string | null
  shop_address?: string | null
  shop_phone?: string | null
  shop_line_id?: string | null
}

// Zero-width space — gives an otherwise-empty rule span a REAL text baseline that
// matches the prompt's, so the rule pins to the baseline metric (see writeRule).
const ZWSP = '​'

// A fillable write-on rule. KEY for cross-machine stability: the rule is pinned to
// the text BASELINE (its row uses align-items:baseline) and its thickness + drop
// below the baseline are font-relative (em), NOT millimetres. Because the rule
// shares the glyphs' baseline + font metrics, the browser rasterises both from the
// same reference — so they snap to the device-pixel grid TOGETHER and stay aligned
// across OS / display-scaling, instead of drifting a sub-pixel apart the way the
// old `margin-bottom:1mm` + align-items:flex-end rule did (which keyed off the
// line-box bottom and a mm offset that round independently of the glyphs).
// `sizing` is the horizontal flex/width rule (fill, fixed digit, fixed date, …).
function writeRule(sizing: string): string {
  return `<span style="${sizing};line-height:1;border-bottom:0.08em solid #000">${ZWSP}</span>`
}

// A positioned write-in row: leading prompt + a flexible underline to write on,
// optional trailing text (e.g. a unit hint) after the rule. The OUTER div carries
// the section's template style (font/offset/gap); the inner flex draws the line,
// baseline-aligned so prompt + rule rasterise together (writeRule).
function fieldRow(sectionCss: string, prompt: string, after = ''): string {
  const tail = after
    ? `<span style="white-space:nowrap;margin-left:1.5mm">${esc(after)}</span>`
    : ''
  return (
    `<div style="${sectionCss}">` +
    `<div style="display:flex;align-items:baseline;gap:1.5mm">` +
    `<span style="white-space:nowrap">${esc(prompt)}</span>` +
    writeRule('flex:1 1 auto;min-width:6mm') +
    tail +
    `</div></div>`
  )
}

// วิธีใช้ + ความถี่ on ONE write-in line, mirroring the real label where the two
// (separate) fields share the dosage row 2026-06-20: "รับประทานครั้งละ ___ วันละ
// ___ ครั้ง". Two underlines flex-share the row; carries the `dosage` template
// style so it moves with the merged dosage setting.
function dosageFreqRow(sectionCss: string): string {
  // First rule flexes to fill the row (dose can be "1 เม็ด", "ครึ่งเม็ด", …); the
  // frequency rule is a fixed short width — it only ever holds a single digit (วันละ
  // N ครั้ง), so a long flexing line there just wastes the row. Both are baseline-
  // pinned writeRule()s (cross-machine stable).
  return (
    `<div style="${sectionCss}">` +
    `<div style="display:flex;align-items:baseline;gap:1.5mm">` +
    `<span style="white-space:nowrap">${esc('รับประทานครั้งละ')}</span>` +
    writeRule('flex:1 1 auto;min-width:6mm') +
    `<span style="white-space:nowrap">${esc('วันละ')}</span>` +
    writeRule('flex:0 0 6mm') +
    `<span style="white-space:nowrap">${esc('ครั้ง')}</span>` +
    `</div></div>`
  )
}

// One group of circle-able choices: each word gets breathing room so a pen circle
// fits around it. The staff circles the one(s) that apply. nowrap keeps the whole
// group on ONE line (มื้อ + เวลา together) — padding/gap are kept tight so the six
// chips fit the sticker width; anything past the edge is clipped by overflow:hidden.
function choiceGroup(label: string, words: string[]): string {
  const chips = words
    .map(w => `<span style="display:inline-block;padding:0.4mm 1mm;white-space:nowrap">${esc(w)}</span>`)
    .join('')
  const lead = label ? `<span style="white-space:nowrap">${esc(label)}</span>` : ''
  return (
    `<div style="display:flex;align-items:baseline;gap:1.5mm">` +
    lead +
    `<span style="flex:1 1 auto;display:flex;flex-wrap:nowrap;gap:0 0.5mm;margin-left:-1mm">${chips}</span>` +
    `</div>`
  )
}

// The timing section (มื้อ + เวลา) renders its circle-able choices on ONE line
// inside the `timing` template position, mirroring the real label where meal-relation
// + label-time print together on the timing row.
function timingRow(sectionCss: string): string {
  return (
    `<div style="${sectionCss}">` +
    choiceGroup('', ['ก่อนอาหาร', 'หลังอาหาร', 'เช้า', 'เที่ยง', 'เย็น', 'ก่อนนอน']) +
    `</div>`
  )
}

// The shop name (left) + date (right) flex row — a 1:1 copy of the real label's
// shop handling (renderLabelSectionsHtml): lift the shop offset OFF the flex
// container and re-apply to the name span only so the date keeps its own offset.
// On a blank this is a WRITE-IN line — "วันที่ ____" with a rule to fill by hand —
// not today's printed date (the staff dates it themselves). Gated by the same
// `show_print_date` setting as the real label; otherwise the right side is blank.
function shopRow(settings: LabelSettingsForm, shop: BlankLabelShop | null): string {
  const sec = SECTIONS.find(s => s.key === 'shop')!
  const name = settings.show_shop ? (shop?.shop_name?.trim() || '') : ''
  const showDate = !!settings.show_print_date
  if (!name && !showDate) return ''
  const secStyle = buildSectionStyle(sec, settings)
  const shopTransform = secStyle.transform
  const style = styleToCss({
    ...secStyle, transform: undefined,
    whiteSpace: 'normal', display: 'flex', justifyContent: 'space-between', gap: '4mm',
  } as CSSProperties)
  const nameSpan = name
    ? `<span style="${styleToCss({ transform: shopTransform, whiteSpace: 'nowrap' })}">${esc(name)}</span>`
    : '<span></span>'
  // The date block stays right-anchored (space-between) but its write-rule can
  // SHRINK (flex 0 1 18mm, min 6mm) so a wide shop name + "วันที่" + rule never
  // overflows the paper edge — the rule gives up width first, keeping everything on
  // the sticker. minWidth:0 lets the container shrink below its content size.
  const dateStyle = styleToCss({
    fontSize:   `${settings.font_size_print_date}pt`,
    fontWeight: settings.bold_print_date ? 'bold' : 'normal',
    transform:  `translate(${settings.offset_x_print_date}mm, ${settings.offset_y_print_date}mm)`,
    display: 'flex', alignItems: 'baseline', gap: '1.5mm', whiteSpace: 'nowrap', minWidth: 0,
  } as CSSProperties)
  const dateSpan = showDate
    ? `<span style="${dateStyle}">` +
        `<span>${esc('วันที่')}</span>` +
        writeRule('flex:0 1 18mm;min-width:10mm') +
      `</span>`
    : ''
  return `<div style="${style}">${nameSpan}${dateSpan}</div>`
}

// LINE ID (left) + qty box (right) on ONE flex row — a 1:1 copy of the real
// label's shop_line_id row (renderLabelSectionsHtml in html.ts), where the qty fold
// sits on the right of the LINE row. On a blank, qty is per-dispense so it becomes a
// compact "[ ___ ]" fill-in box (mirrors the real "[N]" format), styled with qty's OWN font/bold/offset so
// the row height matches the filled label 1:1. CRITICAL: the row renders whenever
// EITHER the LINE id text OR qty would show (mirrors the real label's
// `show_shop_line_id || show_qty` filter). The old code gated the row on the LINE id
// alone — so with LINE id hidden but qty on, the blank dropped this row while the
// sample kept it, and every row below drifted up out of alignment.
function lineIdQtyRow(settings: LabelSettingsForm, shop: BlankLabelShop | null): string {
  const lineIdText = settings.show_shop_line_id && shop?.shop_line_id?.trim()
    ? 'LINE: ' + shop.shop_line_id.trim()
    : ''
  const showQty = !!settings.show_qty
  if (!lineIdText && !showQty) return ''
  const sec = SECTIONS.find(s => s.key === 'shop_line_id')!
  const secStyle = buildSectionStyle(sec, settings)
  // Lift the LINE id offset OFF the flex container (it would drag the qty too) and
  // re-apply to the LINE id span only; the qty write-in keeps its own offset.
  const lineIdTransform = secStyle.transform
  const style = styleToCss({
    ...secStyle, transform: undefined,
    whiteSpace: 'normal', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '4mm',
  } as CSSProperties)
  const lineIdSpan =
    `<span style="${styleToCss({ transform: lineIdTransform, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}">${esc(lineIdText)}</span>`
  const qtyStyle = styleToCss({
    fontSize:   `${settings.font_size_qty}pt`,
    fontWeight: settings.bold_qty ? 'bold' : 'normal',
    whiteSpace: 'nowrap', flexShrink: 0,
    display: 'flex', alignItems: 'baseline', gap: '0.3mm',
    transform:  `translate(${settings.offset_x_qty}mm, ${settings.offset_y_qty}mm)`,
  } as CSSProperties)
  // Compact "[ ___ ]" fill-in box — mirrors the real label's "[N]" qty format and
  // stays short so it never crowds the LINE id. ("จำนวน ___" was too wide.)
  const qtySpan = showQty
    ? `<span style="${qtyStyle}"><span>${esc('[')}</span>${writeRule('flex:0 0 6mm;min-width:5mm')}<span>${esc(']')}</span></span>`
    : ''
  return `<div style="${style}">${lineIdSpan}${qtySpan}</div>`
}

// Walk SECTIONS in the LOCKED template order, rendering each at its configured
// position (buildSectionStyle). Shop rows carry REAL shop data; drug-info sections
// become blank write-in rows / circle choices; qty becomes a compact "[ ___ ]" box on
// the shop_line_id row (lineIdQtyRow); expiry / barcode are skipped (per-dispense data
// meaningless on a generic blank, and they fold onto host rows that still render so
// alignment holds). Visibility honours
// the same show_* toggles as the real label, so a section hidden in Settings is
// hidden here too. Empty rows are filtered so the `.label-fit > :first-child`
// margin reset lands on the true first row.
function renderBlankInner(settings: LabelSettingsForm, shop: BlankLabelShop | null): string {
  const out: string[] = []
  for (const sec of SECTIONS) {
    // Lines are INDEPENDENT (option 1, owner decision 2026-06-29) — same as the
    // real label. Folded rows get no slot; a row toggled OFF reserves an
    // invisible placeholder (buildReservedSlotStyle) so the rows below keep their
    // position and the blank stays in lock-step with the real label's rhythm. A
    // row toggled ON but with no write-in data still collapses (pushes '' →
    // filtered) exactly as before.
    if (isFoldedSection(sec.key)) continue
    if (!isSectionToggledOn(sec.key, settings)) {
      const slot = styleToCss(buildReservedSlotStyle(sec, settings))
      out.push(`<div style="${slot}">${sec.kind === 'line' ? '' : '&nbsp;'}</div>`)
      continue
    }
    const css = styleToCss(buildSectionStyle(sec, settings))
    switch (sec.key) {
      case 'shop':
        out.push(shopRow(settings, shop)); break
      case 'print_date': break // folded into the shop row
      case 'shop_address': {
        // ที่อยู่ร้าน + เบอร์โทร share one line (phone merged up 2026-06-20).
        // Gated by show_shop_address (the merged setting). Barcode never prints
        // on a blank, so no fold here.
        if (!settings.show_shop_address) break
        const addr = shop?.shop_address?.trim() || ''
        const phone = shop?.shop_phone?.trim() || ''
        const merged = [addr, phone].filter(Boolean).join('  ')
        if (merged) out.push(`<div style="${css}">${esc(merged)}</div>`)
        break
      }
      case 'shop_phone': break // merged into the shop_address row (no own line)
      case 'shop_line_id':
        // LINE id (left) + จำนวน write-in (right) — mirrors the real label's
        // shop_line_id row so the blank keeps the same vertical rhythm (see
        // lineIdQtyRow). Empty string when neither would show → filtered below.
        out.push(lineIdQtyRow(settings, shop)); break
      case 'header_line':
        if (settings.show_header_line) out.push(`<div style="${css}"></div>`)
        break
      case 'product':
        if (settings.show_product) out.push(fieldRow(css, 'ชื่อ')); break
      case 'qty': break // qty folds onto the shop_line_id row (จำนวน write-in) — no own line
      case 'dosage':
        // วิธีใช้ + ความถี่ on one shared line (frequency is no longer its own
        // section as of 2026-06-20 — it folds into the dosage row).
        if (settings.show_dosage) out.push(dosageFreqRow(css)); break
      case 'expiry': break // no lot expiry on a generic blank
      case 'frequency': break // merged into the dosage row (no own line)
      case 'timing':
        if (settings.show_timing) out.push(timingRow(css)); break
      case 'indication':
        if (settings.show_indication) out.push(fieldRow(css, 'ข้อบ่งใช้:')); break
      case 'advice':
        if (settings.show_advice) out.push(fieldRow(css, 'คำแนะนำ:')); break
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
): Promise<string> {
  const n = Math.max(1, Math.min(99, Math.floor(copies) || 1))
  const fontFaceCss = await buildPrintFontFaceCss(settings.font_family)
  const inner = renderBlankInner(settings, shop)

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
