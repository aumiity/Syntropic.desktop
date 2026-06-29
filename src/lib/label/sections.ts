// Drug-label anatomy — the single source of truth shared by the Settings
// label-designer (sample preview + print-HTML builder) and the per-product
// LabelsTab preview. Keeping it here means a faithful 1:1 preview in both
// places renders the SAME sections, fonts, offsets and visibility toggles.
//
// Per-section model: EVERY text section owns its own font_size_<key> +
// bold_<key> + show_<key> + offset_x/y_<key> column — nothing is shared. Add a
// section here and (a) add the matching columns to label_settings (schema.ts
// CREATE TABLE + migration), (b) add the keys to LabelSettingsForm/LABEL_DEFAULTS
// below.
//
// Sample/real text per section lives in ./content.ts (SAMPLE_CONTENT /
// composeLabelContent) — SECTIONS only carries layout metadata. EXCEPTION:
// `custom_text` is config, not content — its text comes from
// label_settings.custom_text, special-cased in LabelPaper + buildLabelHtml.
import type { CSSProperties } from 'react'

export type SectionKey =
  | 'shop' | 'print_date' | 'shop_address' | 'shop_phone' | 'shop_line_id'
  | 'product' | 'qty' | 'expiry' | 'dosage' | 'frequency' | 'timing' | 'indication' | 'advice' | 'barcode'
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
// Four flex rows are special-cased in LabelPaper/buildLabelHtml:
//   - `shop` row: shop name left + print date right.
//   - `shop_address` row: address + phone left + QTY right.
//   - `product` row: product name left + BARCODE right (bars only).
//   - `dosage` row: dosage text + frequency left + EXPIRY right.
// `print_date`, `barcode`, `qty` and `expiry` keep their OWN settings columns
// (show/font/bold/offset; for barcode, font_size = height in mm) and appear as
// their own rows in the settings table, but are NOT rendered as their own line —
// each is folded into its host row's right side and styled by its own columns.
// `custom_text` always renders LAST and pulls its text from
// label_settings.custom_text (config).
export const SECTIONS: SectionDef[] = [
  { kind: 'text', key: 'shop',         label: 'ชื่อร้าน' },
  { kind: 'text', key: 'print_date',   label: 'วันที่' },
  { kind: 'text', key: 'shop_address', label: 'ที่อยู่ร้าน / เบอร์โทร' },
  // `shop_phone` (เบอร์โทร) is NOT its own section as of 2026-06-20: its content
  // (out.shop_phone) stays SEPARATE (no data merge), but it renders inline on the
  // `shop_address` row sharing that row's font/bold/show/offset — one combined
  // "ที่อยู่ร้าน / เบอร์โทร" heading that moves together. The QTY fold (right side)
  // lives on this row (swapped with the barcode 2026-06-20). It has no style
  // columns of its own (its old shop_phone_* columns were dropped at schema refine).
  { kind: 'text', key: 'shop_line_id', label: 'LINE ID' },
  { kind: 'line', key: 'header_line',  label: 'เส้นคั่นส่วนหัว' },
  { kind: 'text', key: 'product',      label: 'ชื่อสินค้า' },
  { kind: 'text', key: 'qty',          label: 'จำนวน' },
  { kind: 'text', key: 'dosage',       label: 'วิธีใช้ / ความถี่' },
  { kind: 'text', key: 'expiry',       label: 'วันหมดอายุ' },
  // `frequency` (ความถี่) is NOT its own section as of 2026-06-20: its content
  // (out.frequency) stays a SEPARATE field (no data merge), but it renders inline
  // on the `dosage` row sharing dosage's font/bold/show/offset — one combined
  // "วิธีใช้ / ความถี่" heading that moves together. It has no style columns of its
  // own (its old frequency_* columns were dropped at schema refine).
  { kind: 'text', key: 'timing',       label: 'มื้อ / เวลา' },
  { kind: 'text', key: 'indication',   label: 'สรรพคุณ' },
  { kind: 'text', key: 'advice',       label: 'คำแนะนำ' },
  { kind: 'text', key: 'barcode',      label: 'บาร์โค้ด' },
  { kind: 'text', key: 'custom_text',  label: 'ข้อความเพิ่มเติม' },
]

// Form keys are canonical DB column names — `Object.keys(form)` flows straight
// into the dynamic-SQL UPDATE in `settings:saveLabelSettings`, so any key here
// must be a real column on `label_settings`. (The retired notes / footer_line /
// lot_expiry / frequency / shop_phone style columns were dropped at schema refine
// — shop_phone & frequency content now renders on its host row's style.)
export interface LabelSettingsForm {
  printer_name: string
  width_mm: number
  height_mm: number
  pad_top: number; pad_right: number; pad_bottom: number; pad_left: number
  font_family: string
  // Per-section font size — one column per text section.
  font_size_shop: number; font_size_print_date: number
  font_size_shop_address: number; font_size_shop_line_id: number
  font_size_product: number; font_size_dosage: number; font_size_timing: number
  // qty folds into the shop_address row (right); expiry folds into the dosage row (right).
  font_size_qty: number; font_size_expiry: number
  font_size_indication: number; font_size_advice: number; font_size_barcode: number
  // Barcode is sized by a box: font_size_barcode = HEIGHT (mm), barcode_width_mm
  // = WIDTH (mm). Bars stretch to fill so every product's barcode is the same
  // footprint regardless of digit count.
  barcode_width_mm: number
  font_size_custom_text: number
  // Per-section bold — one column per text section.
  bold_shop: number; bold_print_date: number
  bold_shop_address: number; bold_shop_line_id: number
  bold_product: number; bold_dosage: number; bold_timing: number
  bold_qty: number; bold_expiry: number
  bold_indication: number; bold_advice: number; bold_barcode: number
  bold_custom_text: number
  line_spacing: number; section_gap: number
  // Free-text last line (config, not content). '' = nothing printed.
  custom_text: string
  show_shop: number; show_print_date: number
  show_shop_address: number; show_shop_line_id: number
  show_product: number; show_dosage: number; show_timing: number
  show_qty: number; show_expiry: number
  show_indication: number; show_advice: number; show_barcode: number
  show_custom_text: number
  show_header_line: number
  offset_x_shop: number; offset_y_shop: number
  offset_x_print_date: number; offset_y_print_date: number
  offset_x_shop_address: number; offset_y_shop_address: number
  offset_x_shop_line_id: number; offset_y_shop_line_id: number
  offset_x_product: number; offset_y_product: number
  offset_x_qty: number; offset_y_qty: number
  offset_x_expiry: number; offset_y_expiry: number
  offset_x_dosage: number; offset_y_dosage: number
  offset_x_timing: number; offset_y_timing: number
  offset_x_indication: number; offset_y_indication: number
  offset_x_advice: number; offset_y_advice: number
  offset_x_barcode: number; offset_y_barcode: number
  offset_x_custom_text: number; offset_y_custom_text: number
  offset_x_header_line: number; offset_y_header_line: number
}

export const LABEL_DEFAULTS: LabelSettingsForm = {
  printer_name: '',
  width_mm: 80, height_mm: 50,  // GPP-recommended pharmacy standard
  pad_top: 2, pad_right: 2, pad_bottom: 2, pad_left: 2,
  font_family: 'Sarabun',
  // All sections default to 10pt.
  font_size_shop: 9, font_size_print_date: 8,
  font_size_shop_address: 9, font_size_shop_line_id: 9,
  font_size_product: 9, font_size_dosage: 9, font_size_timing: 9,
  font_size_qty: 9, font_size_expiry: 9,
  font_size_indication: 9, font_size_advice: 9, font_size_barcode: 4,
  barcode_width_mm: 26,
  font_size_custom_text: 9,
  // Bold only the shop name / address / phone / product name (date not bold).
  bold_shop: 1, bold_print_date: 0,
  bold_shop_address: 1, bold_shop_line_id: 0,
  bold_product: 1, bold_dosage: 1, bold_timing: 1,
  bold_qty: 0, bold_expiry: 0,
  bold_indication: 0, bold_advice: 0, bold_barcode: 0,
  bold_custom_text: 0,
  line_spacing: 1.5, section_gap: 2,
  custom_text: '',
  show_shop: 1, show_print_date: 1,
  show_shop_address: 1, show_shop_line_id: 1,
  show_product: 1, show_dosage: 1, show_timing: 1,
  show_qty: 1, show_expiry: 1,
  show_indication: 1, show_advice: 1, show_barcode: 0,
  show_custom_text: 1,
  show_header_line: 1,
  offset_x_shop: 0, offset_y_shop: 0,
  offset_x_print_date: 0, offset_y_print_date: 0,
  offset_x_shop_address: 0, offset_y_shop_address: 0,
  offset_x_shop_line_id: 0, offset_y_shop_line_id: 0,
  offset_x_product: 0, offset_y_product: 0,
  offset_x_qty: 0, offset_y_qty: 0,
  offset_x_expiry: 0, offset_y_expiry: 0,
  offset_x_dosage: 0, offset_y_dosage: 0,
  offset_x_timing: 0, offset_y_timing: 0,
  offset_x_indication: 0, offset_y_indication: 0,
  offset_x_advice: 0, offset_y_advice: 0,
  offset_x_barcode: 0, offset_y_barcode: 0,
  offset_x_custom_text: 0, offset_y_custom_text: 0,
  offset_x_header_line: 0, offset_y_header_line: 0,
}

// Per-paper-size default templates — the source of truth for the "รีเซ็ตการตั้งค่า"
// button (and the "ใช้ค่าเริ่มต้นของขนาดนี้" prompt when picking a preset). Each
// entry is a PARTIAL override layered on top of LABEL_DEFAULTS: only the keys
// worth tuning per size are listed; everything omitted falls back to
// LABEL_DEFAULTS. Keys MUST be real label_settings columns (they flow into the
// dynamic-SQL UPDATE via the resolved form) — never invent a key here.
//
// This replaces the old height-scaled formula (sizeDefaults) so each size can be
// hand-tuned to look good independently. Edit the numbers below to taste.
//
// Key = `${width_mm}x${height_mm}` (see presetDefaults). A custom paper size (no
// matching key) borrows the 80x50 standard as its starting point, then the user
// fine-tunes from there.
export const PRESET_KEY = (w: number, h: number) => `${w}x${h}`

export const PRESET_DEFAULTS: Record<string, Partial<LabelSettingsForm>> = {
  // 70 × 50 มม. — compact sticker.
  '70x50': {
    pad_top: 2, pad_right: 2, pad_bottom: 2, pad_left: 2,
    section_gap: 6, line_spacing: 1.2,
    font_size_shop: 10, font_size_print_date: 7,
    font_size_shop_address: 8, font_size_shop_line_id: 8,
    font_size_product: 8, font_size_qty: 7, font_size_dosage: 8, font_size_expiry: 7,
    font_size_timing: 8, font_size_indication: 8, font_size_advice: 8,
    font_size_custom_text: 8,
    font_size_barcode: 4, barcode_width_mm: 24,
  },
  // 80 × 50 มม. — มาตรฐาน GPP (also the fallback for custom sizes).
  '80x50': {
    pad_top: 2, pad_right: 2, pad_bottom: 2, pad_left: 2,
    section_gap: 3, line_spacing: 1.4,
    font_size_shop: 12, font_size_print_date: 7,
    font_size_shop_address: 9, font_size_shop_line_id: 9,
    font_size_product: 9, font_size_qty: 7, font_size_dosage: 9, font_size_expiry: 7,
    font_size_timing: 9, font_size_indication: 9, font_size_advice: 9,
    font_size_custom_text: 9,
    font_size_barcode: 4, barcode_width_mm: 24,
  },
  // 80 × 60 มม. — taller; bigger type, looser lines.
  '80x60': {
    pad_top: 2, pad_right: 2, pad_bottom: 2, pad_left: 2,
    section_gap: 3, line_spacing: 1.4,
    font_size_shop: 12, font_size_print_date: 7,
    font_size_shop_address: 9, font_size_shop_line_id: 9,
    font_size_product: 9, font_size_qty: 7, font_size_dosage: 9, font_size_expiry: 7,
    font_size_timing: 9, font_size_indication: 9, font_size_advice: 9,
    font_size_custom_text: 9,
    font_size_barcode: 4, barcode_width_mm: 24,
  },
  // 100 × 75 มม. — ซองยาใหญ่; largest type, widest barcode.
  '100x75': {
    pad_top: 2, pad_right: 2, pad_bottom: 2, pad_left: 2,
    section_gap: 6, line_spacing: 1.4,
    font_size_shop: 14, font_size_print_date: 9,
    font_size_shop_address: 11, font_size_shop_line_id: 11,
    font_size_product: 11, font_size_qty: 9, font_size_dosage: 11, font_size_expiry: 9,
    font_size_timing: 11, font_size_indication: 11, font_size_advice: 11,
    font_size_custom_text: 11,
    font_size_barcode: 6, barcode_width_mm: 30,
  },
}

// Resolve a full LabelSettingsForm of defaults for the given paper size: start
// from LABEL_DEFAULTS, layer the per-size override (or the 80x50 standard for an
// unrecognised/custom size), then stamp the actual width/height requested. The
// caller is responsible for preserving printer_name (hardware, not a style).
export function presetDefaults(w: number, h: number): LabelSettingsForm {
  const override = PRESET_DEFAULTS[PRESET_KEY(w, h)] ?? PRESET_DEFAULTS['80x50']
  return { ...LABEL_DEFAULTS, ...override, width_mm: w, height_mm: h }
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

// These four sections never render as their OWN line — each folds into a host
// row's right side (print_date → shop, qty → shop_line_id, barcode → product,
// expiry → dosage). They never get a slot of their own (reserved or otherwise).
export function isFoldedSection(key: SectionKey): boolean {
  return key === 'print_date' || key === 'barcode' || key === 'qty' || key === 'expiry'
}

// Is this top-level row enabled by its show-toggle(s)? The four folded rows
// (shop / shop_line_id / product / dosage) light up when EITHER their own text
// or their folded-in partner is on; every other row reads its single
// `show_<key>` column. This is the SINGLE predicate behind both render paths'
// "render vs reserve" decision (was the old `.filter` in LabelPaper / html.ts).
export function isSectionToggledOn(key: SectionKey, form: LabelSettingsForm): boolean {
  switch (key) {
    case 'shop':         return !!form.show_shop || !!form.show_print_date
    case 'shop_line_id': return !!form.show_shop_line_id || !!form.show_qty
    case 'product':      return !!form.show_product || !!form.show_barcode
    case 'dosage':       return !!form.show_dosage || !!form.show_expiry
    default:             return !!form[`show_${key}` as keyof LabelSettingsForm]
  }
}

// A hidden, space-reserving placeholder for a row whose show-toggle is OFF, so
// turning a line off leaves its slot EMPTY instead of collapsing the layout —
// every other line keeps its exact position (lines are independent; option 1,
// owner decision 2026-06-29). Reserves ONE line of the row's own font height
// (text) or the rule's thickness (line), keeps the section_gap marginTop, and is
// invisible (`visibility:hidden`, no offset — an unseen slot needs no nudge).
// Both LabelPaper and renderLabelSectionsHtml build the placeholder from this so
// the reserved height matches 1:1. Caller supplies a non-breaking space as the
// child for text rows (forces the line box); line rows need no child.
export function buildReservedSlotStyle(def: SectionDef, form: LabelSettingsForm): CSSProperties {
  const base: CSSProperties = {
    marginTop:  `${form.section_gap}pt`,
    visibility: 'hidden',
    position:   'relative',
  }
  if (def.kind === 'line') {
    return { ...base, borderTop: '0.5pt solid #000', width: '100%' }
  }
  const fontSize = form[`font_size_${def.key}` as keyof LabelSettingsForm] as number
  return { ...base, fontSize: `${fontSize}pt`, whiteSpace: 'normal' }
}
