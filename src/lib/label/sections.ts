// Drug-label anatomy — the single source of truth shared by the Settings
// label-designer (sample preview + print-HTML builder) and the per-product
// LabelsTab preview. Keeping it here means a faithful 1:1 preview in both
// places renders the SAME sections, fonts, offsets and visibility toggles.
//
// Sample/real text per section lives in ./content.ts (SAMPLE_CONTENT /
// composeLabelContent) — SECTIONS only carries layout metadata.
import type { CSSProperties } from 'react'

export type SectionKey =
  | 'shop' | 'shop_address' | 'product' | 'dosage' | 'timing' | 'indication'
  | 'advice' | 'barcode'
  | 'header_line'

// Text sections carry font + bold; line sections are horizontal rules (no text,
// no font), but share the same show/X/Y controls so the user edits them
// uniformly with text rows.
export type SectionDef =
  | {
      key: SectionKey
      label: string
      kind: 'text'
      fontSizeKey: 'font_size_shop' | 'font_size_product' | 'font_size_dosage' | 'font_size_small'
      boldKey: 'bold_shop' | 'bold_product' | 'bold_dosage' | null
    }
  | {
      key: SectionKey
      label: string
      kind: 'line'
    }

// Single source of truth: drives the "บรรทัด" sub-tab, the preview, and the
// print-HTML builder. Order is LOCKED (see docs/plans/label-restructure.md §6).
// `shop` is special-cased in LabelPaper/buildLabelHtml: shop name left + print
// date right on a single flex row.
export const SECTIONS: SectionDef[] = [
  { kind: 'text', key: 'shop',         label: 'ชื่อร้าน (+ วันที่)', fontSizeKey: 'font_size_shop',    boldKey: 'bold_shop'    },
  { kind: 'text', key: 'shop_address', label: 'ที่อยู่ร้าน',         fontSizeKey: 'font_size_small',   boldKey: null           },
  { kind: 'line', key: 'header_line',  label: 'เส้นคั่นส่วนหัว' },
  { kind: 'text', key: 'product',      label: 'ชื่อสินค้า',          fontSizeKey: 'font_size_product', boldKey: 'bold_product' },
  { kind: 'text', key: 'dosage',       label: 'วิธีใช้',             fontSizeKey: 'font_size_dosage',  boldKey: 'bold_dosage'  },
  { kind: 'text', key: 'timing',       label: 'มื้อ / เวลา',         fontSizeKey: 'font_size_dosage',  boldKey: null           },
  { kind: 'text', key: 'indication',   label: 'สรรพคุณ',            fontSizeKey: 'font_size_small',   boldKey: null           },
  { kind: 'text', key: 'advice',       label: 'คำแนะนำ',            fontSizeKey: 'font_size_small',   boldKey: null           },
  { kind: 'text', key: 'barcode',      label: 'บาร์โค้ด',            fontSizeKey: 'font_size_small',   boldKey: null           },
]

// Form keys are canonical DB column names — `Object.keys(form)` flows straight
// into the dynamic-SQL UPDATE in `settings:saveLabelSettings`, so any key here
// must be a real column on `label_settings`. The *_notes / *_footer_line /
// *_lot_expiry keys are DEAD (columns kept, sections removed) — they stay in the
// interface + defaults so the load-filter doesn't drop the real columns.
export interface LabelSettingsForm {
  printer_name: string
  width_mm: number
  height_mm: number
  pad_top: number; pad_right: number; pad_bottom: number; pad_left: number
  font_family: string
  font_size_shop: number; font_size_product: number; font_size_dosage: number; font_size_small: number
  bold_shop: number; bold_product: number; bold_dosage: number
  line_spacing: number; section_gap: number
  show_shop: number; show_shop_address: number; show_product: number; show_dosage: number
  show_timing: number; show_indication: number; show_advice: number; show_barcode: number
  show_header_line: number
  offset_x_shop: number; offset_y_shop: number
  offset_x_shop_address: number; offset_y_shop_address: number
  offset_x_product: number; offset_y_product: number
  offset_x_dosage: number; offset_y_dosage: number
  offset_x_timing: number; offset_y_timing: number
  offset_x_indication: number; offset_y_indication: number
  offset_x_advice: number; offset_y_advice: number
  offset_x_barcode: number; offset_y_barcode: number
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
  font_size_shop: 10, font_size_product: 10, font_size_dosage: 10, font_size_small: 10,
  bold_shop: 1, bold_product: 1, bold_dosage: 1,
  line_spacing: 1.5, section_gap: 2,
  show_shop: 1, show_shop_address: 1, show_product: 1, show_dosage: 1,
  show_timing: 1, show_indication: 1, show_advice: 1, show_barcode: 0,
  show_header_line: 1,
  offset_x_shop: 0, offset_y_shop: 0,
  offset_x_shop_address: 0, offset_y_shop_address: 0,
  offset_x_product: 0, offset_y_product: 0,
  offset_x_dosage: 0, offset_y_dosage: 0,
  offset_x_timing: 0, offset_y_timing: 0,
  offset_x_indication: 0, offset_y_indication: 0,
  offset_x_advice: 0, offset_y_advice: 0,
  offset_x_barcode: 0, offset_y_barcode: 0,
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
  return {
    ...base,
    fontSize:   `${form[def.fontSizeKey]}pt`,
    fontWeight: def.boldKey && form[def.boldKey] ? 'bold' : 'normal',
    whiteSpace: 'pre-line',
  }
}
