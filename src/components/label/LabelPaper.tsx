// LabelPaper — the single presentational renderer for a drug-label sticker.
// Shared by the Settings designer preview (SAMPLE_CONTENT) and the per-product
// LabelsTab preview (composeLabelContent). The print path builds an HTML string
// separately (buildLabelHtml) but iterates the SAME SECTIONS + content map, so
// preview and print stay 1:1.
import type { CSSProperties } from 'react'
import {
  SECTIONS, buildSectionStyle, type SectionKey, type LabelSettingsForm,
} from '@/lib/label/sections'
import { barcodeSvg } from '@/lib/label/barcode'

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
  // `print_date` is never its own line — it's folded into the shop flex row
  // (right side), so skip it here. The shop row shows when EITHER the shop name
  // or the date is enabled.
  const visible = SECTIONS.filter(s => {
    if (s.key === 'print_date') return false
    if (s.key === 'shop') return !!settings.show_shop || !!settings.show_print_date
    return settings[`show_${s.key}` as keyof LabelSettingsForm]
  })

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
      className="bg-white text-black shrink-0"
      style={{
        width:      `${settings.width_mm}mm`,
        height:     `${settings.height_mm}mm`,
        padding:    `${settings.pad_top}mm ${settings.pad_right}mm ${settings.pad_bottom}mm ${settings.pad_left}mm`,
        // Match the receipt preview's shadow depth (ReceiptSettingsTab) so both
        // paper previews read at the same elevation.
        boxShadow:  '0 4px 5px rgb(0 0 0 / 0.20), 0 12px 14px rgb(0 0 0 / 0.16)',
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
        // custom_text is config (label_settings.custom_text), not content — it's
        // the free-text last line typed in the designer. Everything else maps
        // through the content text map.
        const text = s.key === 'custom_text' ? (settings.custom_text ?? '') : (content[s.key] ?? '')
        if (s.key === 'shop') {
          // Special: shop name (left, styled by `shop`) + print date (right,
          // styled by its OWN `print_date` columns) on one flex row. Each side
          // toggles independently via show_shop / show_print_date.
          const showName = !!settings.show_shop
          const showDate = !!settings.show_print_date && !!date
          const nameText = showName ? text : ''
          if (!nameText && !showDate) return null
          if (first) { style.marginTop = 0; first = false }
          style.whiteSpace = 'normal'
          // The shop offset must move ONLY the name, not the date. Lift the offset
          // transform off the flex CONTAINER (it would shift both children) and
          // re-apply it to the name span alone; the date keeps its OWN offset.
          const shopTransform = style.transform
          style.transform = undefined
          // Date span uses print_date's font/bold + its own offset nudge. Spans
          // need the family too — the `*` rule hits them directly.
          const dateStyle: CSSProperties = {
            fontFamily,
            fontSize:   `${settings.font_size_print_date}pt`,
            fontWeight: settings.bold_print_date ? 'bold' : 'normal',
            transform:  `translate(${settings.offset_x_print_date}mm, ${settings.offset_y_print_date}mm)`,
          }
          return (
            <div key={s.key} style={{ ...style, display: 'flex', justifyContent: 'space-between', gap: '4mm' }}>
              <span style={{ fontFamily, transform: shopTransform }}>{nameText}</span>
              {showDate ? <span style={dateStyle}>{date}</span> : null}
            </div>
          )
        }
        if (s.key === 'barcode') {
          // Bars only (no digits). Height = the section's "ขนาด" value, read as mm
          // (font_size_barcode is repurposed for barcode height). barcodeSvg → ''
          // when blank/unencodable, so the row simply disappears.
          const svg = barcodeSvg(text, { displayValue: false })
          if (!svg) return null
          if (first) { style.marginTop = 0; first = false }
          return (
            <div key={s.key} style={{ ...style, textAlign: 'center' }}>
              <img
                src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
                alt={text}
                style={{ height: `${settings.font_size_barcode}mm`, maxWidth: '100%', display: 'inline-block' }}
              />
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
