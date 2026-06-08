// Receipt (thermal slip) anatomy — the single source of truth shared by the
// Settings receipt-designer (sample preview + print-HTML builder) and the live
// preview. Per-section model: every CONTROLLABLE section owns its own
// `show_<key>` + `bold_<key>` + `align_<key>` column on `receipt_settings`.
//
// Font SIZE is GLOBAL (receipt_settings.font_size) — one size for the whole
// slip, by design (the owner wants a single knob, "ปรับที่เดียวทั้งหน้า"). No
// per-section size column exists.
//
// Add a section here and (a) add the matching columns to receipt_settings
// (schema.ts CREATE TABLE + the migration ALTER list), (b) add the keys to
// ReceiptSettings (types/index.ts) + DEFAULTS (ReceiptSettingsTab.tsx). Keys are
// canonical DB column names — `Object.keys(form)` flows straight into the
// dynamic-SQL UPDATE in `settings:saveReceiptSettings`, so any key must be a
// real column.
//
// The `items` section is the sale line items — NOT user-styleable (fixed
// 2-column layout); it carries no columns and is rendered verbatim by the
// builder. It appears in the settings list as a read-only row so the user can
// see where it sits in the order.

export type RcAlign = 'left' | 'center' | 'right' | 'justify'

export type RcSectionKey =
  | 'shop' | 'shop_contact' | 'tax_id' | 'title'
  | 'bill_info' | 'items' | 'summary' | 'payment'
  | 'footer' | 'salesperson'

export interface RcSectionDef {
  key: RcSectionKey
  label: string
  // text  = block of plain lines; `align` = CSS text-align of the block.
  // pair  = label/value rows; 'justify' splits to 2 columns (label left, value
  //         right — the classic slip look), any other align packs "label value"
  //         adjacent on one line then aligns the whole block left/center/right.
  // items = the sale line items; not user-styleable, no columns.
  kind: 'text' | 'pair' | 'items'
  // Print a dashed separator (hr) AFTER this section.
  hrAfter?: boolean
}

// Order is LOCKED — it mirrors the physical slip top-to-bottom. Separators
// (hrAfter) reproduce the dashed rules in the current layout.
export const RC_SECTIONS: RcSectionDef[] = [
  { key: 'shop',         label: 'ชื่อร้าน / สาขา',              kind: 'text' },
  { key: 'shop_contact', label: 'ที่อยู่ / เบอร์โทร',            kind: 'text' },
  { key: 'tax_id',       label: 'เลขประจำตัวผู้เสียภาษี',        kind: 'text' },
  { key: 'title',        label: 'ชื่อเอกสาร',                   kind: 'text', hrAfter: true },
  { key: 'bill_info',    label: 'เลขที่ / วันที่ / ผู้รับบริการ', kind: 'pair', hrAfter: true },
  { key: 'items',        label: 'รายการขาย',                    kind: 'items', hrAfter: true },
  { key: 'summary',      label: 'มูลค่า / ส่วนลด / รวมทั้งสิ้น',  kind: 'pair' },
  { key: 'payment',      label: 'รับเงิน / เงินทอน',             kind: 'pair', hrAfter: true },
  { key: 'footer',       label: 'ข้อความท้ายใบเสร็จ',            kind: 'text' },
  { key: 'salesperson',  label: 'พนักงานขาย',                   kind: 'text' },
]

// Everything the user can style (show + bold + align) — i.e. all but the fixed
// `items` block. Drives the per-section settings list.
export const RC_CONTROLLABLE = RC_SECTIONS.filter(s => s.kind !== 'items')

// Map a stored align value to a CSS text-align (defensive default = left).
export function alignCss(a: string | RcAlign | undefined): string {
  return a === 'center' || a === 'right' || a === 'justify' ? a : 'left'
}
