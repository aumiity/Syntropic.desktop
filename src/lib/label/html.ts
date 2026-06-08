// Print-HTML builder for drug labels — the STRING counterpart of the React
// <LabelPaper> component. Both walk the same SECTIONS + buildSectionStyle +
// content map so the silent-print / PDF output matches the on-screen preview
// 1:1. Used by the Settings designer (SAMPLE_CONTENT) AND the per-product
// LabelsTab print action (composeLabelContent). The two render paths can't be
// one function (React vs HTML string), so they share everything below instead.
import type { CSSProperties } from 'react'
import { SECTIONS, buildSectionStyle, type LabelSettingsForm, type SectionKey } from './sections'
import { esc, buildPrintFontFaceCss } from '@/lib/print/fonts'
import { barcodeSvg } from './barcode'

// Inline React style object → a CSS declaration string (camelCase → kebab-case).
export function styleToCss(s: CSSProperties): string {
  return Object.entries(s)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}:${v}`)
    .join(';')
}

// Build the full label HTML (with embedded @font-face) used for both silent
// print and the PDF preview — single source so they render identically.
export async function buildLabelHtml(
  settings: LabelSettingsForm,
  content: Partial<Record<SectionKey, string>>,
  date: string,
): Promise<string> {
  const sectionsHtml = SECTIONS
    // `print_date` is folded into the shop flex row (see below), never its own
    // line; the shop row shows when EITHER the name or the date is enabled.
    .filter(s => {
      if (s.key === 'print_date') return false
      if (s.key === 'shop') return !!settings.show_shop || !!settings.show_print_date
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
      if (s.key === 'barcode') {
        // Bars only; height = section "ขนาด" (mm). Same SVG generator as the React
        // preview → print === preview.
        const svg = barcodeSvg(text, { displayValue: false })
        if (!svg) return ''
        const wrap = { ...buildSectionStyle(s, settings), textAlign: 'center' } as CSSProperties
        return `<div style="${styleToCss(wrap)}"><img src="data:image/svg+xml;utf8,${encodeURIComponent(svg)}" style="height:${settings.font_size_barcode}mm;max-width:100%;display:inline-block" /></div>`
      }
      if (!text) return ''
      const body = esc(text).replace(/\n/g, '<br>')
      return `<div style="${styleToCss(buildSectionStyle(s, settings))}">${body}</div>`
    })
    .join('')

  const fontFaceCss = await buildPrintFontFaceCss(settings.font_family)
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
  box-sizing: border-box;
}
div:first-child { margin-top: 0 !important; }
</style></head><body>${sectionsHtml}</body></html>`
}
