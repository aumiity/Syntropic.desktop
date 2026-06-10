// LabelPaper — the single presentational renderer for a drug-label sticker.
// Shared by the Settings designer preview (SAMPLE_CONTENT) and the per-product
// LabelsTab preview (composeLabelContent). The print path builds an HTML string
// separately (buildLabelHtml) but iterates the SAME SECTIONS + content map, so
// preview and print stay 1:1.
import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import {
  SECTIONS, buildSectionStyle, type SectionKey, type LabelSettingsForm,
} from '@/lib/label/sections'
import { barcodeSvg } from '@/lib/label/barcode'
import { computeFitScale } from '@/lib/label/fit'

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
  // Two sections are never their OWN line — they fold into another section's
  // flex row (right side): `print_date` → into `shop`, `barcode` → into
  // `shop_phone`. Skip them here; the host row shows when EITHER its own text or
  // its folded-in partner is enabled.
  const visible = SECTIONS.filter(s => {
    if (s.key === 'print_date') return false
    if (s.key === 'barcode') return false
    if (s.key === 'shop') return !!settings.show_shop || !!settings.show_print_date
    if (s.key === 'shop_phone') return !!settings.show_shop_phone || !!settings.show_barcode
    return settings[`show_${s.key}` as keyof LabelSettingsForm]
  })

  // The configured family. Multi-word names (e.g. "Bai Jamjuree") MUST be
  // quoted in CSS. We re-apply this on EVERY text element below — not just the
  // root — because the global `* { font-family }` rule in index.css sets the
  // family directly on each child, overriding inheritance from the root div.
  // Without re-applying inline, the preview silently falls back to the app font.
  const fontFamily = `'${settings.font_family}', sans-serif`

  // Auto shrink-to-fit (mirrors the print path's LABEL_FIT_SCRIPT): measure the
  // natural content (.label-fit) against the printable area (.label-area) and,
  // if it overflows the fixed sticker, scale the whole block down uniformly so
  // the configured font stays the ceiling and the section hierarchy is kept.
  // The ratio is read from the same DOM under the same CSS zoom, so the preview
  // and the (un-zoomed) print window land on an identical scale. Transform is
  // applied imperatively because React owns only the style props it sets.
  const areaRef = useRef<HTMLDivElement>(null)
  const fitRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const measure = () => {
      const area = areaRef.current, fit = fitRef.current
      if (!area || !fit) return
      fit.style.transform = 'none' // back to natural size before measuring
      const k = computeFitScale(area.clientWidth, area.clientHeight, fit.scrollWidth, fit.scrollHeight)
      fit.style.transform = k < 1 ? `scale(${k})` : 'none'
    }
    measure()
    // Web fonts shift glyph metrics once they load — re-fit so the preview keeps
    // matching the print (which also waits for fonts before fitting).
    let cancelled = false
    const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts
    fonts?.ready?.then(() => { if (!cancelled) measure() }).catch(() => {})
    return () => { cancelled = true }
  }, [settings, content, date])

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
        overflow:   'hidden',
      }}
    >
      {/* .label-area = printable box (fills the padded inside); .label-fit =
          natural content the effect above scales down when it overflows. */}
      <div ref={areaRef} style={{ width: '100%', height: '100%' }}>
      <div ref={fitRef} style={{ transformOrigin: 'top left' }}>
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
        if (s.key === 'shop_phone') {
          // Special: phone (left, styled by `shop_phone`) + barcode (right, its
          // OWN offset + height), one flex row. Each toggles independently via
          // show_shop_phone / show_barcode; the barcode also needs an encodable
          // value (barcodeSvg → '' when blank). Bars only (no digits). Mirrors
          // the shop + print_date flex row.
          const phoneText = settings.show_shop_phone ? text : ''
          const svg = settings.show_barcode ? barcodeSvg(content.barcode ?? '', { displayValue: false }) : ''
          if (!phoneText && !svg) return null
          if (first) { style.marginTop = 0; first = false }
          style.whiteSpace = 'normal'
          // The shop_phone offset must move ONLY the phone, not the barcode. Lift
          // the offset off the flex CONTAINER and re-apply to the phone span; the
          // barcode keeps its OWN offset_*_barcode.
          const phoneTransform = style.transform
          style.transform = undefined
          // Fixed barcode BOX — width (barcode_width_mm) × height
          // (font_size_barcode). The SVG stretches to fill it (preserveAspectRatio
          // none, set in barcodeSvg), so a short code and a long code occupy the
          // SAME footprint. flexShrink:0 keeps the box from being squeezed; the
          // PHONE is the side that yields (it truncates).
          const barStyle: CSSProperties = {
            height:     `${settings.font_size_barcode}mm`,
            width:      `${settings.barcode_width_mm}mm`,
            maxWidth:   '100%',
            flexShrink: 0,
            display:    'inline-block',
            transform:  `translate(${settings.offset_x_barcode}mm, ${settings.offset_y_barcode}mm)`,
          }
          return (
            <div key={s.key} style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4mm' }}>
              <span style={{ fontFamily, transform: phoneTransform, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phoneText}</span>
              {svg ? (
                <img
                  src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
                  alt={content.barcode ?? ''}
                  style={barStyle}
                />
              ) : null}
            </div>
          )
        }
        if (!text) return null
        if (first) { style.marginTop = 0; first = false }
        return <div key={s.key} style={style}>{text}</div>
      })}
      </div>
      </div>
    </div>
  )
}
