// LabelPaper — the single presentational renderer for a drug-label sticker.
// Shared by the Settings designer preview (SAMPLE_CONTENT) and the per-product
// LabelsTab preview (composeLabelContent). The print path builds an HTML string
// separately (buildLabelHtml) but iterates the SAME SECTIONS + content map, so
// preview and print stay 1:1.
import { type CSSProperties } from 'react'
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
  // Four sections are never their OWN line — they fold into another section's
  // flex row (right side): `print_date` → into `shop`, `qty` → into
  // `shop_address`, `barcode` → into `product`, `expiry` → into `dosage`. Skip
  // them here; the host row shows when EITHER its own text or its folded-in
  // partner is enabled.
  const visible = SECTIONS.filter(s => {
    if (s.key === 'print_date') return false
    if (s.key === 'barcode') return false
    if (s.key === 'qty') return false
    if (s.key === 'expiry') return false
    if (s.key === 'shop') return !!settings.show_shop || !!settings.show_print_date
    if (s.key === 'shop_address') return !!settings.show_shop_address || !!settings.show_qty
    if (s.key === 'product') return !!settings.show_product || !!settings.show_barcode
    if (s.key === 'dosage') return !!settings.show_dosage || !!settings.show_expiry
    return settings[`show_${s.key}` as keyof LabelSettingsForm]
  })

  // The configured family. Multi-word names (e.g. "Bai Jamjuree") MUST be
  // quoted in CSS. We re-apply this on EVERY text element below — not just the
  // root — because the global `* { font-family }` rule in index.css sets the
  // family directly on each child, overriding inheritance from the root div.
  // Without re-applying inline, the preview silently falls back to the app font.
  const fontFamily = `'${settings.font_family}', sans-serif`

  // NO auto shrink-to-fit (removed 2026-06-19, owner decision): the drug label
  // renders at the EXACT configured font sizes / offsets so the designer is true
  // WYSIWYG — what you set + nudge is what prints. If content overflows the fixed
  // sticker the paper's `overflow:hidden` simply clips it (same as print); the
  // owner adjusts sizes / positions by hand rather than letting the whole block
  // get silently scaled down. (The print path drops LABEL_FIT_SCRIPT to match;
  // tags / stickers / blank form keep their own fit — that's intentional there.)

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
      {/* .label-area / .label-fit wrappers kept to mirror the print HTML
          structure 1:1 (no scaling here — content renders at its natural,
          configured size and the paper above clips any overflow). */}
      <div style={{ width: '100%', height: '100%' }}>
      <div style={{ transformOrigin: 'top left' }}>
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
        if (s.key === 'shop_address') {
          // Special: ที่อยู่ร้าน + เบอร์โทร share one line (phone merged up
          // 2026-06-20, DISPLAY only — out.shop_address / out.shop_phone stay
          // SEPARATE content fields). Left = address + phone, styled by
          // shop_address; right = QTY fold (its OWN font/bold + offset), moved
          // here from the product row 2026-06-20 (swapped with the barcode).
          // show_shop_address governs the text; show_qty the qty ("[N]", no unit).
          const addrText = settings.show_shop_address
            ? [text, content.shop_phone].filter(Boolean).join('  ')
            : ''
          const qtyText = settings.show_qty ? (content.qty ?? '') : ''
          if (!addrText && !qtyText) return null
          if (first) { style.marginTop = 0; first = false }
          style.whiteSpace = 'normal'
          // The shop_address offset must move ONLY the text, not the qty. Lift it
          // off the flex CONTAINER and re-apply to the text span; qty keeps its own.
          const addrTransform = style.transform
          style.transform = undefined
          const qtyStyle: CSSProperties = {
            fontFamily,
            fontSize:   `${settings.font_size_qty}pt`,
            fontWeight: settings.bold_qty ? 'bold' : 'normal',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            transform:  `translate(${settings.offset_x_qty}mm, ${settings.offset_y_qty}mm)`,
          }
          return (
            <div key={s.key} style={{ ...style, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '4mm' }}>
              <span style={{ fontFamily, transform: addrTransform, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{addrText}</span>
              {qtyText ? <span style={qtyStyle}>{qtyText}</span> : null}
            </div>
          )
        }
        if (s.key === 'product') {
          // Special: product name (left, styled by `product`) + BARCODE (right,
          // its OWN offset + height), one flex row. Barcode moved here from the
          // shop_address row 2026-06-20 (swapped with qty). show_product governs
          // the name; show_barcode the barcode (needs an encodable value,
          // barcodeSvg → '' when blank). Bars only (no digits).
          const nameText = settings.show_product ? text : ''
          const svg = settings.show_barcode ? barcodeSvg(content.barcode ?? '', { displayValue: false, flat: true }) : ''
          if (!nameText && !svg) return null
          if (first) { style.marginTop = 0; first = false }
          style.whiteSpace = 'normal'
          // The product offset must move ONLY the name, not the barcode. Lift it
          // off the flex CONTAINER and re-apply to the name span; the barcode keeps
          // its OWN offset_*_barcode.
          const nameTransform = style.transform
          style.transform = undefined
          // Fixed barcode BOX — width (barcode_width_mm) × height
          // (font_size_barcode); the SVG stretches to fill it so any code length
          // keeps the SAME footprint. flexShrink:0 keeps the box; the NAME yields.
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
              <span style={{ fontFamily, transform: nameTransform, minWidth: 0 }}>{nameText}</span>
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
        if (s.key === 'dosage') {
          // Special: dosage text (left, styled by `dosage`) + expiry (right, its
          // OWN font/bold + offset) on one flex row. Each toggles independently
          // via show_dosage / show_expiry. Mirrors product + qty. expiry is
          // "EXP.dd/mm/yyyy", right-aligned, adjusted independently of dosage.
          // ความถี่ (frequency) is a SEPARATE content field (out.frequency, data
          // never merged) but shares the dosage line + dosage's font/bold/offset —
          // appended inline for DISPLAY only (merged into one settings row
          // 2026-06-20; no own line/control). show_dosage governs both.
          const dosageText = settings.show_dosage
            ? [text, content.frequency].filter(Boolean).join(' ')
            : ''
          const expiryText = settings.show_expiry ? (content.expiry ?? '') : ''
          if (!dosageText && !expiryText) return null
          if (first) { style.marginTop = 0; first = false }
          style.whiteSpace = 'normal'
          // The dosage offset must move ONLY the dosage text, not the expiry. Lift
          // it off the flex CONTAINER and re-apply to the dosage span; expiry keeps
          // its own offset_*_expiry.
          const dosageTransform = style.transform
          style.transform = undefined
          const expiryStyle: CSSProperties = {
            fontFamily,
            fontSize:   `${settings.font_size_expiry}pt`,
            fontWeight: settings.bold_expiry ? 'bold' : 'normal',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            transform:  `translate(${settings.offset_x_expiry}mm, ${settings.offset_y_expiry}mm)`,
          }
          return (
            <div key={s.key} style={{ ...style, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '4mm' }}>
              <span style={{ fontFamily, transform: dosageTransform, minWidth: 0 }}>{dosageText}</span>
              {expiryText ? <span style={expiryStyle}>{expiryText}</span> : null}
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
