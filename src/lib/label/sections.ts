// Drug-label anatomy — the single source of truth shared by the Settings
// label-designer (sample preview + print-HTML builder) and the per-product
// LabelsTab preview. Keeping it here means a faithful 1:1 preview in both
// places renders the SAME sections, fonts, offsets and visibility toggles.
//
// Per-section model: EVERY text section owns its own font_size_<key> +
// bold_<key> + show_<key> + offset_x/y_<key> column — nothing is shared. Add a
// section here and (a) add the matching columns to label_settings (schema.ts
// CREATE TABLE + migration), (b) add the keys to LabelSettingsForm/LABEL_DEFAULTS
// below. The old shared "font_size_small" tier is retired (kept as a DEAD column).
//
// Sample/real text per section lives in ./content.ts (SAMPLE_CONTENT /
// composeLabelContent) — SECTIONS only carries layout metadata. EXCEPTION:
// `custom_text` is config, not content — its text comes from
// label_settings.custom_text, special-cased in LabelPaper + buildLabelHtml.
import type { CSSProperties } from 'react'

export type SectionKey =
  | 'shop' | 'print_date' | 'shop_address' | 'shop_phone' | 'shop_line_id'
  | 'product' | 'dosage' | 'timing' | 'indication' | 'advice' | 'barcode'
  | 'custom_text'
  | 'header_line'

// Text sections carry per-section font + bold (resolved by convention as
// font_size_<key> / bold_<key>); line sections are horizontal rules (no text,
// no font), but share the same show/X/Y controls so the user edits them
// uniformly with text rows.
export interface SectionDef {
  key: SectionKey
  label: string
  kind: 'text' | 'line'
}

// Single source of truth: drives the "ฟอนต์ & บรรทัด" sub-tab, the preview, and
// the print-HTML builder. Order is LOCKED (see docs/plans/label-section-split.md).
// Two flex rows are special-cased in LabelPaper/buildLabelHtml:
//   - `shop` row: shop name left + print date right.
//   - `shop_phone` row: phone left + BARCODE right (bars only).
// `print_date` and `barcode` keep their OWN settings columns (show/font/offset;
// for barcode, font_size = height in mm) and appear as their own rows in the
// settings table, but are NOT rendered as their own line — each is folded into
// its host row's right side and styled by its own columns. `custom_text` always
// renders LAST and pulls its text from label_settings.custom_text (config).
export const SECTIONS: SectionDef[] = [
  { kind: 'text', key: 'shop',         label: 'ชื่อร้าน' },
  { kind: 'text', key: 'print_date',   label: 'วันที่' },
  { kind: 'text', key: 'shop_address', label: 'ที่อยู่ร้าน' },
  { kind: 'text', key: 'shop_phone',   label: 'เบอร์โทรร้าน' },
  { kind: 'text', key: 'shop_line_id', label: 'LINE ID' },
  { kind: 'line', key: 'header_line',  label: 'เส้นคั่นส่วนหัว' },
  { kind: 'text', key: 'product',      label: 'ชื่อสินค้า' },
  { kind: 'text', key: 'dosage',       label: 'วิธีใช้' },
  { kind: 'text', key: 'timing',       label: 'มื้อ / เวลา' },
  { kind: 'text', key: 'indication',   label: 'สรรพคุณ' },
  { kind: 'text', key: 'advice',       label: 'คำแนะนำ' },
  { kind: 'text', key: 'barcode',      label: 'บาร์โค้ด' },
  { kind: 'text', key: 'custom_text',  label: 'ข้อความเพิ่มเติม' },
]

// Form keys are canonical DB column names — `Object.keys(form)` flows straight
// into the dynamic-SQL UPDATE in `settings:saveLabelSettings`, so any key here
// must be a real column on `label_settings`. `font_size_small` and the
// notes / footer_line / lot_expiry keys are DEAD (columns kept, sections
// removed/retired) — they stay in the interface + defaults so the load-filter
// doesn't drop the real columns and overwrite them as undefined on next save.
export interface LabelSettingsForm {
  printer_name: string
  width_mm: number
  height_mm: number
  pad_top: number; pad_right: number; pad_bottom: number; pad_left: number
  font_family: string
  // Per-section font size — one column per text section.
  font_size_shop: number; font_size_print_date: number
  font_size_shop_address: number; font_size_shop_phone: number; font_size_shop_line_id: number
  font_size_product: number; font_size_dosage: number; font_size_timing: number
  font_size_indication: number; font_size_advice: number; font_size_barcode: number
  // Barcode is sized by a box: font_size_barcode = HEIGHT (mm), barcode_width_mm
  // = WIDTH (mm). Bars stretch to fill so every product's barcode is the same
  // footprint regardless of digit count.
  barcode_width_mm: number
  font_size_custom_text: number
  font_size_small: number // DEAD — retired shared tier, kept for round-trip.
  // Per-section bold — one column per text section.
  bold_shop: number; bold_print_date: number
  bold_shop_address: number; bold_shop_phone: number; bold_shop_line_id: number
  bold_product: number; bold_dosage: number; bold_timing: number
  bold_indication: number; bold_advice: number; bold_barcode: number
  bold_custom_text: number
  line_spacing: number; section_gap: number
  // Free-text last line (config, not content). '' = nothing printed.
  custom_text: string
  show_shop: number; show_print_date: number
  show_shop_address: number; show_shop_phone: number; show_shop_line_id: number
  show_product: number; show_dosage: number; show_timing: number
  show_indication: number; show_advice: number; show_barcode: number
  show_custom_text: number
  show_header_line: number
  offset_x_shop: number; offset_y_shop: number
  offset_x_print_date: number; offset_y_print_date: number
  offset_x_shop_address: number; offset_y_shop_address: number
  offset_x_shop_phone: number; offset_y_shop_phone: number
  offset_x_shop_line_id: number; offset_y_shop_line_id: number
  offset_x_product: number; offset_y_product: number
  offset_x_dosage: number; offset_y_dosage: number
  offset_x_timing: number; offset_y_timing: number
  offset_x_indication: number; offset_y_indication: number
  offset_x_advice: number; offset_y_advice: number
  offset_x_barcode: number; offset_y_barcode: number
  offset_x_custom_text: number; offset_y_custom_text: number
  offset_x_header_line: number; offset_y_header_line: number
  // DEAD columns — sections removed but columns kept (see comment above).
  show_notes: number; show_lot_expiry: number; show_footer_line: number
  offset_x_notes: number; offset_y_notes: number
  offset_x_lot_expiry: number; offset_y_lot_expiry: number
  offset_x_footer_line: number; offset_y_footer_line: number
}

export const LABEL_DEFAULTS: LabelSettingsForm = {
  printer_name: '',
  width_mm: 80, height_mm: 50,  // GPP-recommended pharmacy standard
  pad_top: 3, pad_right: 3, pad_bottom: 3, pad_left: 3,
  font_family: 'Bai Jamjuree',
  // All sections default to 10pt.
  font_size_shop: 10, font_size_print_date: 10,
  font_size_shop_address: 10, font_size_shop_phone: 10, font_size_shop_line_id: 10,
  font_size_product: 10, font_size_dosage: 10, font_size_timing: 10,
  font_size_indication: 10, font_size_advice: 10, font_size_barcode: 10,
  barcode_width_mm: 40,
  font_size_custom_text: 10,
  font_size_small: 10, // DEAD
  // Bold only the shop name / address / phone / product name (date not bold).
  bold_shop: 1, bold_print_date: 0,
  bold_shop_address: 1, bold_shop_phone: 1, bold_shop_line_id: 0,
  bold_product: 1, bold_dosage: 0, bold_timing: 0,
  bold_indication: 0, bold_advice: 0, bold_barcode: 0,
  bold_custom_text: 0,
  line_spacing: 1.5, section_gap: 2,
  custom_text: '',
  show_shop: 1, show_print_date: 1,
  show_shop_address: 1, show_shop_phone: 1, show_shop_line_id: 1,
  show_product: 1, show_dosage: 1, show_timing: 1,
  show_indication: 1, show_advice: 1, show_barcode: 0,
  show_custom_text: 1,
  show_header_line: 1,
  offset_x_shop: 0, offset_y_shop: 0,
  offset_x_print_date: 0, offset_y_print_date: 0,
  offset_x_shop_address: 0, offset_y_shop_address: 0,
  offset_x_shop_phone: 0, offset_y_shop_phone: 0,
  offset_x_shop_line_id: 0, offset_y_shop_line_id: 0,
  offset_x_product: 0, offset_y_product: 0,
  offset_x_dosage: 0, offset_y_dosage: 0,
  offset_x_timing: 0, offset_y_timing: 0,
  offset_x_indication: 0, offset_y_indication: 0,
  offset_x_advice: 0, offset_y_advice: 0,
  offset_x_barcode: 0, offset_y_barcode: 0,
  offset_x_custom_text: 0, offset_y_custom_text: 0,
  offset_x_header_line: 0, offset_y_header_line: 0,
  // DEAD columns kept so load-filter preserves them on round-trip.
  show_notes: 0, show_lot_expiry: 0, show_footer_line: 0,
  offset_x_notes: 0, offset_y_notes: 0,
  offset_x_lot_expiry: 0, offset_y_lot_expiry: 0,
  offset_x_footer_line: 0, offset_y_footer_line: 0,
}

export function buildSectionStyle(def: SectionDef, form: LabelSettingsForm): CSSProperties {
  const ox = form[`offset_x_${def.key}` as keyof LabelSettingsForm] as number
  const oy = form[`offset_y_${def.key}` as keyof LabelSettingsForm] as number
  const base: CSSProperties = {
    transform: `translate(${ox}mm, ${oy}mm)`,
    marginTop: `${form.section_gap}pt`,
    position:  'relative',
  }
  if (def.kind === 'line') {
    return { ...base, borderTop: '0.5pt solid #000', width: '100%' }
  }
  const fontSize = form[`font_size_${def.key}` as keyof LabelSettingsForm] as number
  const bold = form[`bold_${def.key}` as keyof LabelSettingsForm] as number
  return {
    ...base,
    fontSize:   `${fontSize}pt`,
    fontWeight: bold ? 'bold' : 'normal',
    whiteSpace: 'pre-line',
  }
}
