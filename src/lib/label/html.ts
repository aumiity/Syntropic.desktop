// Print-HTML builder for drug labels — the STRING counterpart of the React
// <LabelPaper> component. Both walk the same SECTIONS + buildSectionStyle +
// content map so the silent-print / PDF output matches the on-screen preview
// 1:1. Used by the Settings designer (SAMPLE_CONTENT) AND the per-product
// LabelsTab print action (composeLabelContent). The two render paths can't be
// one function (React vs HTML string), so they share everything below instead.
import type { CSSProperties } from 'react'
import { SECTIONS, buildSectionStyle, type LabelSettingsForm, type SectionKey } from './sections'
import { esc, buildPrintFontFaceCss, buildFallbackFontFaceCss } from '@/lib/print/fonts'
import { barcodeSvg } from './barcode'

// Inline React style object → a CSS declaration string (camelCase → kebab-case).
export function styleToCss(s: CSSProperties): string {
  return Object.entries(s)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}:${v}`)
    .join(';')
}

// Render just the label's inner section HTML (no doc wrapper, no @font-face).
// Shared by buildLabelHtml (single label) and buildLabelSheetHtml (multi-page),
// so on-screen preview, single print and the POS batch sheet stay 1:1.
export function renderLabelSectionsHtml(
  settings: LabelSettingsForm,
  content: Partial<Record<SectionKey, string>>,
  date: string,
): string {
  return SECTIONS
    // `print_date` folds into the shop flex row, `qty` into the shop_line_id row,
    // `barcode` into the product row, `expiry` into the dosage row (see below) —
    // never their own line; each host row shows when EITHER its own text or its
    // folded-in partner is enabled.
    .filter(s => {
      if (s.key === 'print_date') return false
      if (s.key === 'barcode') return false
      if (s.key === 'qty') return false
      if (s.key === 'expiry') return false
      if (s.key === 'shop') return !!settings.show_shop || !!settings.show_print_date
      if (s.key === 'shop_address') return !!settings.show_shop_address
      if (s.key === 'shop_line_id') return !!settings.show_shop_line_id || !!settings.show_qty
      if (s.key === 'product') return !!settings.show_product || !!settings.show_barcode
      if (s.key === 'dosage') return !!settings.show_dosage || !!settings.show_expiry
      return settings[`show_${s.key}` as keyof LabelSettingsForm]
    })
    .map(s => {
      if (s.kind === 'line') {
        return `<div style="${styleToCss(buildSectionStyle(s, settings))}"></div>`
      }
      // custom_text is config (settings.custom_text), not content — mirror the
      // same special-case as LabelPaper so print === preview.
      const text = s.key === 'custom_text' ? (settings.custom_text ?? '') : (content[s.key] ?? '')
      if (s.key === 'shop') {
        // Special: shop name (left, `shop` style) + print date (right, its OWN
        // `print_date` style + offset) on one flex row; each toggles separately.
        const showName = !!settings.show_shop
        const showDate = !!settings.show_print_date && !!date
        const nameText = showName ? text : ''
        if (!nameText && !showDate) return ''
        // Lift the shop offset OFF the flex container (it would drag the date too)
        // and re-apply it to the name span only; the date keeps its own offset.
        const secStyle = buildSectionStyle(s, settings)
        const shopTransform = secStyle.transform
        const style = {
          ...secStyle, transform: undefined,
          whiteSpace: 'normal', display: 'flex', justifyContent: 'space-between', gap: '4mm',
        } as CSSProperties
        const nameStyle: CSSProperties = { transform: shopTransform }
        const dateStyle: CSSProperties = {
          fontSize:   `${settings.font_size_print_date}pt`,
          fontWeight: settings.bold_print_date ? 'bold' : 'normal',
          transform:  `translate(${settings.offset_x_print_date}mm, ${settings.offset_y_print_date}mm)`,
        }
        const dateSpan = showDate ? `<span style="${styleToCss(dateStyle)}">${esc(date)}</span>` : ''
        return `<div style="${styleToCss(style)}"><span style="${styleToCss(nameStyle)}">${esc(nameText)}</span>${dateSpan}</div>`
      }
      if (s.key === 'shop_address') {
        // Special: ที่อยู่ร้าน + เบอร์โทร share one line (phone merged up
        // 2026-06-20, DISPLAY only — out.shop_address / out.shop_phone stay
        // SEPARATE content fields). One combined "ที่อยู่ร้าน / เบอร์โทร" line
        // styled by shop_address. (The QTY fold moved OFF this row onto the
        // header_line 2026-06-21.) show_shop_address governs the whole line. Must
        // mirror LabelPaper (dual-render).
        const addrText = settings.show_shop_address
          ? [text, content.shop_phone].filter(Boolean).join('  ')
          : ''
        if (!addrText) return ''
        const style = { ...buildSectionStyle(s, settings), whiteSpace: 'normal' } as CSSProperties
        return `<div style="${styleToCss(style)}">${esc(addrText)}</div>`
      }
      if (s.key === 'shop_line_id') {
        // Special: LINE ID (left, `shop_line_id` style) + QTY fold (right, its OWN
        // font/bold + offset) on one flex row — moved here from the shop_address row
        // 2026-06-21. show_shop_line_id governs the LINE ID text; show_qty the qty
        // ("[N]", no unit). qty shows even when LINE ID is empty (right-aligned on an
        // otherwise-blank row). Must mirror LabelPaper (dual-render).
        const lineIdText = settings.show_shop_line_id ? text : ''
        const qtyText = settings.show_qty ? (content.qty ?? '') : ''
        if (!lineIdText && !qtyText) return ''
        // Lift the shop_line_id offset OFF the flex container (it would drag the qty
        // too) and re-apply to the text span only; qty keeps its own.
        const secStyle = buildSectionStyle(s, settings)
        const lineIdTransform = secStyle.transform
        const style = {
          ...secStyle, transform: undefined,
          whiteSpace: 'normal', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '4mm',
        } as CSSProperties
        const lineIdStyle: CSSProperties = { transform: lineIdTransform, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
        const qtyStyle: CSSProperties = {
          fontSize:   `${settings.font_size_qty}pt`,
          fontWeight: settings.bold_qty ? 'bold' : 'normal',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          transform:  `translate(${settings.offset_x_qty}mm, ${settings.offset_y_qty}mm)`,
        }
        const qtySpan = qtyText ? `<span style="${styleToCss(qtyStyle)}">${esc(qtyText)}</span>` : ''
        return `<div style="${styleToCss(style)}"><span style="${styleToCss(lineIdStyle)}">${esc(lineIdText)}</span>${qtySpan}</div>`
      }
      if (s.key === 'product') {
        // Special: product name (left, `product` style) + BARCODE (right, its OWN
        // offset + height) on one flex row; show_product / show_barcode toggle
        // each. Barcode moved here from the shop_address row 2026-06-20 (swapped
        // with qty). Bars only (no digits). Same SVG generator as the React
        // preview → print === preview. Must mirror LabelPaper (dual-render).
        const nameText = settings.show_product ? text : ''
        const svg = settings.show_barcode ? barcodeSvg(content.barcode ?? '', { displayValue: false, flat: true }) : ''
        if (!nameText && !svg) return ''
        // Lift the product offset OFF the flex container (it would drag the barcode
        // too) and re-apply to the name span only; the barcode keeps its own.
        const secStyle = buildSectionStyle(s, settings)
        const nameTransform = secStyle.transform
        const style = {
          ...secStyle, transform: undefined,
          whiteSpace: 'normal', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4mm',
        } as CSSProperties
        const nameStyle: CSSProperties = { transform: nameTransform, minWidth: 0 }
        const nameSpan = nameText
          ? `<span style="${styleToCss(nameStyle)}">${esc(nameText).replace(/\n/g, '<br>')}</span>`
          : '<span></span>'
        const barImg = svg
          ? `<img src="data:image/svg+xml;utf8,${encodeURIComponent(svg)}" style="height:${settings.font_size_barcode}mm;width:${settings.barcode_width_mm}mm;max-width:100%;flex-shrink:0;display:inline-block;transform:translate(${settings.offset_x_barcode}mm, ${settings.offset_y_barcode}mm)" />`
          : ''
        return `<div style="${styleToCss(style)}">${nameSpan}${barImg}</div>`
      }
      if (s.key === 'dosage') {
        // Special: dosage text (left, `dosage` style) + expiry (right, its OWN
        // `expiry` font/bold + offset) on one flex row; each toggles separately
        // via show_dosage / show_expiry. Mirrors product + qty. expiry is
        // "EXP.dd/mm/yyyy", right-aligned, adjusted independently of dosage.
        // ความถี่ (frequency) is a SEPARATE content field (out.frequency, data
        // never merged) sharing the dosage line + dosage's font/bold/offset —
        // appended inline for DISPLAY only (one settings row 2026-06-20). Must
        // mirror LabelPaper (dual-render). show_dosage governs both.
        const dosageText = settings.show_dosage
          ? [text, content.frequency].filter(Boolean).join(' ')
          : ''
        const expiryText = settings.show_expiry ? (content.expiry ?? '') : ''
        if (!dosageText && !expiryText) return ''
        const secStyle = buildSectionStyle(s, settings)
        const dosageTransform = secStyle.transform
        const style = {
          ...secStyle, transform: undefined,
          whiteSpace: 'normal', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '4mm',
        } as CSSProperties
        const dosageStyle: CSSProperties = { transform: dosageTransform, minWidth: 0 }
        const expiryStyle: CSSProperties = {
          fontSize:   `${settings.font_size_expiry}pt`,
          fontWeight: settings.bold_expiry ? 'bold' : 'normal',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          transform:  `translate(${settings.offset_x_expiry}mm, ${settings.offset_y_expiry}mm)`,
        }
        const dosageSpan = dosageText
          ? `<span style="${styleToCss(dosageStyle)}">${esc(dosageText).replace(/\n/g, '<br>')}</span>`
          : '<span></span>'
        const expirySpan = expiryText ? `<span style="${styleToCss(expiryStyle)}">${esc(expiryText)}</span>` : ''
        return `<div style="${styleToCss(style)}">${dosageSpan}${expirySpan}</div>`
      }
      if (!text) return ''
      const body = esc(text).replace(/\n/g, '<br>')
      return `<div style="${styleToCss(buildSectionStyle(s, settings))}">${body}</div>`
    })
    .join('')
}

// Build the full single-label HTML (with embedded @font-face) used for silent
// print and the PDF preview — single source so they render identically.
export async function buildLabelHtml(
  settings: LabelSettingsForm,
  content: Partial<Record<SectionKey, string>>,
  date: string,
): Promise<string> {
  const sectionsHtml = renderLabelSectionsHtml(settings, content, date)
  const fontFaceCss = await buildPrintFontFaceCss(settings.font_family)
  // .label-area = the printable content box (fills the body inside its padding);
  // .label-fit = the content wrapper. NO auto shrink-to-fit (removed 2026-06-19):
  // sections render at their EXACT configured sizes (true WYSIWYG with the
  // designer) and `overflow: hidden` on the body clips anything that overflows
  // the fixed sticker — the owner adjusts by hand, nothing is silently scaled.
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
${fontFaceCss}
@page { size: ${settings.width_mm}mm ${settings.height_mm}mm; margin: 0; }
html, body { margin: 0; padding: 0; }
body {
  width: ${settings.width_mm}mm; height: ${settings.height_mm}mm;
  padding: ${settings.pad_top}mm ${settings.pad_right}mm ${settings.pad_bottom}mm ${settings.pad_left}mm;
  font-family: '${settings.font_family}', sans-serif;
  line-height: ${settings.line_spacing};
  color: #000; background: #fff;
  box-sizing: border-box; overflow: hidden;
}
.label-fit > div:first-child { margin-top: 0 !important; }
</style></head><body><div class="label-area" style="width:100%;height:100%"><div class="label-fit">${sectionsHtml}</div></div></body></html>`
}

// Build a MULTI-PAGE label sheet — one label per page (page-break between),
// printed in ONE spool job (POS batch print). Script-fallback fonts (Myanmar /
// Simplified Chinese) are embedded ONLY when the combined content needs them, so
// a Thai-only run stays light. Per-entry `settings` drives each page's section
// show/hide + styles (including per-label show_barcode); paper size, padding,
// line-height and base font come from `baseSettings` (all labels share one paper
// + font). The font-family STACK appends the matched fallback families before
// `sans-serif` so Burmese/Chinese glyphs resolve instead of printing as tofu.
export async function buildLabelSheetHtml(
  baseSettings: LabelSettingsForm,
  entries: Array<{ settings: LabelSettingsForm; content: Partial<Record<SectionKey, string>>; date: string }>,
): Promise<string> {
  const allText = entries.map(e => Object.values(e.content).filter(Boolean).join(' ')).join(' ')
  const fontFaceCss = await buildPrintFontFaceCss(baseSettings.font_family)
  const fallback = await buildFallbackFontFaceCss(allText)
  const familyStack = [baseSettings.font_family, ...fallback.families].map(f => `'${f}'`).join(', ') + ', sans-serif'

  const pageStyle = [
    `width:${baseSettings.width_mm}mm`,
    `height:${baseSettings.height_mm}mm`,
    `padding:${baseSettings.pad_top}mm ${baseSettings.pad_right}mm ${baseSettings.pad_bottom}mm ${baseSettings.pad_left}mm`,
    `box-sizing:border-box`, `overflow:hidden`, `break-after:page`, `page-break-after:always`,
  ].join(';')
  // Each page wraps its sections in .label-area > .label-fit. NO auto shrink-to-
  // fit (removed 2026-06-19): every label prints at its EXACT configured sizes;
  // `overflow:hidden` per page clips any overflow (matches the on-screen designer).
  const pages = entries
    .map(e => `<div class="label-page" style="${pageStyle}"><div class="label-area" style="width:100%;height:100%"><div class="label-fit">${renderLabelSectionsHtml(e.settings, e.content, e.date)}</div></div></div>`)
    .join('')

  return `<!doctype html><html><head><meta charset="utf-8">
<style>
${fontFaceCss}
${fallback.css}
@page { size: ${baseSettings.width_mm}mm ${baseSettings.height_mm}mm; margin: 0; }
html, body { margin: 0; padding: 0; }
body { font-family: ${familyStack}; line-height: ${baseSettings.line_spacing}; color: #000; background: #fff; }
.label-page:last-child { break-after: auto; page-break-after: auto; }
.label-page .label-fit > div:first-child { margin-top: 0 !important; }
</style></head><body>${pages}</body></html>`
}
