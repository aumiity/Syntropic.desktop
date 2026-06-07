// LabelPaper — the single presentational renderer for a drug-label sticker.
// Shared by the Settings designer preview (SAMPLE_CONTENT) and the per-product
// LabelsTab preview (composeLabelContent). The print path builds an HTML string
// separately (buildLabelHtml) but iterates the SAME SECTIONS + content map, so
// preview and print stay 1:1.
import type { CSSProperties } from 'react'
import {
  SECTIONS, buildSectionStyle, type SectionKey, type LabelSettingsForm,
} from '@/lib/label/sections'

interface Props {
  settings: LabelSettingsForm
  content: Partial<Record<SectionKey, string>>
  // Print date for the special shop row (right column). Omit to hide the date.
  date?: string
}

export function LabelPaper({ settings, content, date }: Props) {
  // Visible sections in order; for text sections, skip when there's no content
  // (lines always render). marginTop is killed on the first rendered element so
  // it sits flush at the padding edge (matches the print HTML `div:first-child`
  // rule).
  const visible = SECTIONS.filter(s => settings[`show_${s.key}` as keyof LabelSettingsForm])

  // The configured family. Multi-word names (e.g. "Bai Jamjuree") MUST be
  // quoted in CSS. We re-apply this on EVERY text element below — not just the
  // root — because the global `* { font-family }` rule in index.css sets the
  // family directly on each child, overriding inheritance from the root div.
  // Without re-applying inline, the preview silently falls back to the app font.
  const fontFamily = `'${settings.font_family}', sans-serif`

  let first = true
  return (
    // Physical-paper preview: bg-white/text-black literals are intentional
    // (real-world ink on paper, not themed UI) and exempt from the
    // no-color-literal rule.
    <div
      className="border-2 border-dashed border-border bg-white text-black shrink-0"
      style={{
        width:      `${settings.width_mm}mm`,
        height:     `${settings.height_mm}mm`,
        padding:    `${settings.pad_top}mm ${settings.pad_right}mm ${settings.pad_bottom}mm ${settings.pad_left}mm`,
        // Multi-word family names (e.g. "Bai Jamjuree") MUST be quoted in CSS,
        // else the browser parses each word as a separate fallback family.
        fontFamily: `'${settings.font_family}', sans-serif`,
        lineHeight: settings.line_spacing,
        boxSizing:  'border-box',
      }}
    >
      {visible.map(s => {
        const style: CSSProperties = buildSectionStyle(s, settings)
        if (s.kind === 'line') {
          if (first) { style.marginTop = 0; first = false }
          return <div key={s.key} style={style} />
        }
        style.fontFamily = fontFamily
        const text = content[s.key] ?? ''
        if (s.key === 'shop') {
          // Special: shop name left + print date right on one flex row.
          if (!text && !date) return null
          if (first) { style.marginTop = 0; first = false }
          style.whiteSpace = 'normal'
          // Spans need the family too — the `*` rule hits them directly.
          return (
            <div key={s.key} style={{ ...style, display: 'flex', justifyContent: 'space-between', gap: '4mm' }}>
              <span style={{ fontFamily }}>{text}</span>
              {date ? <span style={{ fontFamily }}>{date}</span> : null}
            </div>
          )
        }
        if (!text) return null
        if (first) { style.marginTop = 0; first = false }
        return <div key={s.key} style={style}>{text}</div>
      })}
    </div>
  )
}
