// Print-HTML builder for drug labels — the STRING counterpart of the React
// <LabelPaper> component. Both walk the same SECTIONS + buildSectionStyle +
// content map so the silent-print / PDF output matches the on-screen preview
// 1:1. Used by the Settings designer (SAMPLE_CONTENT) AND the per-product
// LabelsTab print action (composeLabelContent). The two render paths can't be
// one function (React vs HTML string), so they share everything below instead.
import type { CSSProperties } from 'react'
import { SECTIONS, buildSectionStyle, type LabelSettingsForm, type SectionKey } from './sections'
import { esc, buildPrintFontFaceCss } from '@/lib/print/fonts'

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
    .filter(s => settings[`show_${s.key}` as keyof LabelSettingsForm])
    .map(s => {
      if (s.kind === 'line') {
        return `<div style="${styleToCss(buildSectionStyle(s, settings))}"></div>`
      }
      const text = content[s.key] ?? ''
      if (s.key === 'shop') {
        // Special: shop name left + print date right on one flex row.
        if (!text && !date) return ''
        const style = {
          ...buildSectionStyle(s, settings),
          whiteSpace: 'normal', display: 'flex', justifyContent: 'space-between', gap: '4mm',
        } as CSSProperties
        return `<div style="${styleToCss(style)}"><span>${esc(text)}</span><span>${esc(date)}</span></div>`
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
