// Print-page forms for the barcode-sticker / price-tag print tab. Keys map 1:1
// to the columns of barcode_sticker_settings / price_tag_settings (minus
// id/updated_at) so the dynamic-SQL save in electron/ipc/settings.ts stays
// allow-listed. The grid (cols/rows/gap) is a fixed preset resolved in
// ./presets.ts — only the per-element sticker sizes (font_name_pt / font_digits_pt
// / font_price_pt / barcode_h_mm) are user-tunable, fed into resolveStickerLayout
// to override the preset defaults.

export interface BarcodeStickerForm {
  preset: string
  show_name: number
  show_price: number
  show_digits: number
  // Per-element sticker sizes (override the preset defaults). Each maps to a
  // display-toggle row in the print tab: font_name_pt = product name (pt),
  // font_digits_pt = barcode digits (pt), font_price_pt = price (pt). The digits
  // and price still share ONE meta line — different pt just sizes each span.
  // barcode_h_mm / barcode_w_mm = the barcode box height/width (mm); the bars
  // stretch to fill it (so any code length keeps the same footprint).
  font_name_pt: number
  font_digits_pt: number
  font_price_pt: number
  barcode_h_mm: number
  barcode_w_mm: number
  // Horizontal alignment of the product-name line: 'left' | 'center' | 'right'.
  name_align: string
}

export interface PriceTagForm {
  preset: string
  show_name: number
  show_price: number
  show_barcode: number
  show_code: number
  show_unit: number
  show_cut_lines: number
  // 7-Eleven yellow background fill (option) — covers the top band (name+price).
  fill_yellow: number
  // Compact price (option): drop the .00 decimals AND the "บาท" suffix.
  price_compact: number
  // Vertical gap (mm) between stacked lines (name/price/date/barcode).
  line_gap_mm: number
  // Per-element sizes (read directly in priceTagHtml — same pattern as the
  // sticker form). name/price/code(=print date)/unit = pt; barcode = box
  // height (mm); bars stretch full width.
  font_name_pt: number
  font_price_pt: number
  font_code_pt: number
  font_unit_pt: number
  barcode_h_mm: number
  barcode_w_mm: number
}

export const BARCODE_STICKER_DEFAULTS: BarcodeStickerForm = {
  preset: '4up',
  show_name: 1,
  show_price: 1,
  show_digits: 1,
  // Match the historical fixed sticker sizes (STICKER_FONT_* / STICKER_BARCODE_H_MM in ./presets.ts).
  font_name_pt: 8,
  font_digits_pt: 7,
  font_price_pt: 7,
  barcode_h_mm: 7,
  barcode_w_mm: 34,
  name_align: 'center',
}

export const PRICE_TAG_DEFAULTS: PriceTagForm = {
  preset: '50up',
  show_name: 1,
  show_price: 1,
  show_barcode: 1,
  show_code: 0,
  show_unit: 1,
  show_cut_lines: 1,
  fill_yellow: 1,
  price_compact: 0,
  line_gap_mm: 1,
  font_name_pt: 9,
  font_price_pt: 18,
  font_code_pt: 7,
  font_unit_pt: 8,
  barcode_h_mm: 8,
  barcode_w_mm: 34,
}

// Ready-made price-tag styles (applied as a bundle over the current config; the
// locked '50up' grid is untouched). Values mirror the operator's two reference
// screenshots: style 1 = big price, no barcode, compact price; style 2 = full
// tag with barcode + decimals.
export const PRICE_TAG_STYLE_PRESETS: { key: string; label: string; values: Partial<PriceTagForm> }[] = [
  {
    key: 'style1', label: 'รูปแบบ 1',
    values: {
      show_name: 1, show_price: 1, show_code: 1, show_unit: 1, show_barcode: 0,
      show_cut_lines: 1, fill_yellow: 1, price_compact: 1, line_gap_mm: 3,
      font_name_pt: 9, font_price_pt: 36, font_code_pt: 10, font_unit_pt: 10, barcode_h_mm: 7,
    },
  },
  {
    key: 'style2', label: 'รูปแบบ 2',
    values: {
      show_name: 1, show_price: 1, show_code: 1, show_unit: 1, show_barcode: 1,
      show_cut_lines: 1, fill_yellow: 1, price_compact: 0, line_gap_mm: 1,
      font_name_pt: 9, font_price_pt: 20, font_code_pt: 8, font_unit_pt: 8, barcode_h_mm: 7,
    },
  },
]

// One assigned grid cell (null = empty slot).
export interface TagCell {
  product_id: number
  name: string         // trade_name
  unit_name: string
  price: number        // price_retail of the selected unit
  code: string         // products.code
  // The selected row's OWN barcode only — NO fallback to the base unit or to the
  // product code. Empty string when that row has no barcode of its own.
  barcode: string
  // 'own'  = the row has its own barcode (rendered as a real barcode)
  // 'none' = the row has no barcode → nothing is generated (name/price only)
  barcode_source: 'own' | 'none'
}
