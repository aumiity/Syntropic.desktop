// Print-page forms for the barcode-sticker / price-tag print tab. Keys map 1:1
// to the columns of barcode_sticker_settings / price_tag_settings (minus
// id/updated_at) so the dynamic-SQL save in electron/ipc/settings.ts stays
// allow-listed. There is NO free cols/rows/gap/font_size — layout is a fixed
// preset resolved in ./presets.ts.

export interface BarcodeStickerForm {
  preset: string
  show_name: number
  show_price: number
  show_digits: number
}

export interface PriceTagForm {
  preset: string
  show_name: number
  show_price: number
  show_barcode: number
  show_code: number
  show_unit: number
  show_cut_lines: number
}

export const BARCODE_STICKER_DEFAULTS: BarcodeStickerForm = {
  preset: '4up',
  show_name: 1,
  show_price: 1,
  show_digits: 1,
}

export const PRICE_TAG_DEFAULTS: PriceTagForm = {
  preset: '8up',
  show_name: 1,
  show_price: 1,
  show_barcode: 0,
  show_code: 0,
  show_unit: 1,
  show_cut_lines: 1,
}

// One assigned grid cell (null = empty slot).
export interface TagCell {
  product_id: number
  name: string         // trade_name
  unit_name: string
  price: number        // price_retail of the selected unit
  code: string         // products.code
  barcode: string      // resolved: unit.barcode → product.barcode → product.code
  // 'own'  = the barcode belongs to the selected row itself (base → p.barcode,
  //          unit → u.barcode)
  // 'base' = a unit row fell back to p.barcode (scanning yields the base-unit
  //          price — must warn)
  // 'code' = fell through to products.code (warn — not a real barcode)
  barcode_source: 'own' | 'base' | 'code'
}
