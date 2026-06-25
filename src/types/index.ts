export interface Product {
  id: number
  barcode?: string; barcode2?: string; barcode3?: string; barcode4?: string
  code?: string; trade_name: string; name_for_print?: string
  category_id?: number
  is_stock_item: number; is_bundle: number; is_disabled: number
  price_retail: number; price_wholesale1: number; price_wholesale2: number; cost_price: number; last_cost_price: number
  has_wholesale1: number; has_wholesale2: number
  unit_id?: number
  is_drug: number
  reorder_point?: number; safety_stock?: number
  default_qty?: number
  drug_type_id?: number
  // PHP-only, NOT a SQLite column — lives in EditProduct form state only for the
  // generic-name autocomplete; doSave strips it before products:update.
  drug_generic_name_id?: number
  tmt_id?: string  // real column (schema.ts), UI hidden for now but loaded/saved
  is_antibiotic: number
  indication_note?: string; side_effect_note?: string
  is_fda9: number; is_fda10: number; is_fda11: number; is_fda13: number
  search_keywords?: string; note?: string
  // Joined
  category_name?: string; drug_type_name?: string; unit_name?: string
  // pos:searchProducts only — id of the non-base unit whose barcode exactly
  // matches the scanned query, so POS can pre-highlight that unit row.
  matched_unit_id?: number
  stock_qty?: number
  component_count?: number  // bundle list: how many components this bundle has
  // Relations
  units?: ProductUnit[]; lots?: ProductLot[]; labels?: ProductLabel[]
  bundle_items?: ProductBundleItem[]
}

// Composition of a bundle (is_bundle=1) product — one row per component.
export interface ProductBundleItem {
  id: number
  bundle_id: number
  component_product_id: number
  qty_per_bundle: number
  sort_order: number
  // Joined display fields (products:get / pos:searchProducts / saveBundleItems readback)
  component_name?: string
  component_unit_name?: string
  component_cost?: number
  component_sell_price?: number
  component_stock?: number
  // Attached only by pos:searchProducts so POS can FEFO-cost the bundle preview
  // without a second IPC round-trip. Not present on plain reads.
  lots?: ProductLot[]
}

// Non-base unit variants only (แผง, กล่อง, …). Base unit lives on Product.
export interface ProductUnit {
  id: number; product_id: number; unit_id: number
  barcode?: string; qty_per_base: number
  price_retail: number; price_wholesale1: number; price_wholesale2: number
  is_for_sale: number; is_disabled: number
  unit_name?: string
}

export interface ProductLot {
  id: number; product_id: number; supplier_id?: number
  lot_number: string; manufactured_date?: string; expiry_date?: string
  cost_price: number; sell_price: number
  qty_received: number; qty_on_hand: number; qty_reserved: number
  invoice_no?: string; supplier_invoice_no?: string; order_date?: string
  payment_type: string; due_date?: string; is_paid: number; paid_date?: string
  is_closed: number; closed_at?: string
  is_cancelled: number; cancelled_at?: string; cancel_note?: string
  note?: string; created_at?: string
  unit_name?: string; supplier_name?: string
  discount_amount?: number; surcharge_amount?: number
}

export interface ProductLabel {
  id: number; product_id: number; label_name?: string
  dose_qty?: number; dosage_id?: number; frequency_id?: number; timing_id?: number
  label_time_id?: number; advice_id?: number
  indication_th?: string; indication_en?: string; indication_mm?: string; indication_zh?: string
  note_th?: string; note_mm?: string; note_zh?: string
  show_barcode?: number; is_default?: number
  is_active: number
  frequency_name?: string; dosage_name?: string; timing_name?: string
}

// A named bundle of the 5 "how to use" lookups, applied with one click in the
// label form (fills the 5 usage fields + label_name). `code` is set only on
// seeded starter presets; user-created rows leave it null.
export interface LabelPreset {
  id: number; code?: string | null; name: string
  dosage_id?: number | null; frequency_id?: number | null; timing_id?: number | null
  label_time_id?: number | null; advice_id?: number | null
  sort_order?: number
}

export interface Customer {
  id: number; code: string; full_name: string
  id_card?: string; dob?: string; phone?: string; address?: string
  branch?: string
  note?: string
  is_alert: number; alert_note?: string
  is_disabled: number
  allergies?: DrugAllergy[]
}

export interface DrugAllergy {
  id: number; customer_id: number
  generic_name_id?: number; drug_name_free?: string
  reaction?: string; severity?: string
  generic_name?: string
}

export interface Supplier {
  id: number; code: string; name: string
  tax_id?: string; phone?: string; address?: string
  is_disabled: number
}

export interface User {
  id: number; name: string; email: string; role: string; is_disabled: number
  username?: string; first_name?: string; last_name?: string; phone?: string
}

export interface Sale {
  id: number; invoice_no: string; sale_type: string
  customer_id?: number; customer_name_free?: string; customer_name?: string
  sold_by?: number; sold_by_name?: string; sold_at: string
  subtotal: number; total_discount: number; total_vat: number; total_amount: number
  cash_amount: number; card_amount: number; transfer_amount: number; change_amount: number
  symptom_note?: string; age_range?: string; note?: string
  status: string; void_reason?: string
  items?: SaleItem[]
}

export interface SaleItem {
  id: number; sale_id: number; product_id: number
  item_name: string; unit_name: string
  qty: number; unit_price: number; discount: number; unit_vat: number; line_total: number
  item_note?: string; is_cancelled: number
  item_cost?: number
}

export interface CartItem {
  product_id: number; item_name: string; unit_name: string
  qty: number; unit_price: number; discount: number; line_total: number
  item_note?: string
  // For display
  product?: Product; selectedUnit?: ProductUnit
}

export interface Setting {
  id: number; shop_name: string; shop_address: string; shop_phone: string
  shop_license_no: string; shop_tax_id: string; shop_line_id: string
  shop_branch?: string
  shop_postcode?: string
  setup_completed?: number; setup_completed_at?: string; vat_registered_date?: string
}

// Receipt / cash-slip print settings (singleton). Keys MUST match
// receipt_settings columns 1:1 — saved verbatim via a dynamic Object.keys() UPDATE.
export interface ReceiptSettings {
  id: number
  printer_name: string
  paper_width_mm: number
  paper_height_mm: number   // 0 = auto (measure content height)
  auto_print: number
  copies: number
  font_family: string
  font_size: number         // GLOBAL — one size for the whole slip (no per-section size)
  footer_note: string
  // รูปแบบบล็อกรายการสินค้า: 'detailed' = 2 บรรทัด/รายการ (ค่าเริ่มต้น),
  // 'table' = ตาราง 1 บรรทัด/รายการ (ชื่อ | จำนวน+หน่วย | ราคา | รวม).
  items_layout: 'detailed' | 'table'
  // Per-section style — one trio per controllable section (see
  // src/lib/receipt/sections.ts SSOT). show_/bold_ are 0|1; align_ is one of
  // 'left'|'center'|'right'|'justify'.
  show_shop: number;         bold_shop: number;         align_shop: string
  show_shop_contact: number; bold_shop_contact: number; align_shop_contact: string
  show_tax_id: number;       bold_tax_id: number;       align_tax_id: string
  show_title: number;        bold_title: number;        align_title: string
  show_bill_info: number;    bold_bill_info: number;    align_bill_info: string
  show_summary: number;      bold_summary: number;      align_summary: string
  show_payment: number;      bold_payment: number;      align_payment: string
  show_footer: number;       bold_footer: number;       align_footer: string
  show_salesperson: number;  bold_salesperson: number;  align_salesperson: string
  updated_at?: string
}

// A4 document printing (singleton). Keys MUST match document_settings columns
// 1:1 — DocumentSettingsTab form state is saved verbatim via a dynamic
// Object.keys() UPDATE. One printer for every A4 document (tax invoice, goods
// receipt); printer_name = '' falls back to the OS default printer.
export interface DocumentSettings {
  id: number
  printer_name: string
  copies: number
  updated_at?: string
}

// One environmental-log reading slot: a (log_date, period) cell of the GPP
// temp/humidity grid. Numeric fields are null until measured (never coerced to 0).
export interface EnvLogRow {
  id: number
  log_date: string          // 'YYYY-MM-DD'
  period: number            // 1=เช้า 2=กลางวัน 3=เย็น
  store_temp: number | null
  store_humidity: number | null
  reserve_temp: number | null
  reserve_humidity: number | null
  fridge_temp: number | null
  note: string | null
  recorded_by: number | null
  created_at?: string
  updated_at?: string
}

// Singleton GPP thresholds + which measurement zones the shop uses.
export interface EnvSettings {
  id: number
  zone_reserve_enabled: number
  zone_fridge_enabled: number
  updated_at?: string
}

// Full tax invoice issuance record (ใบกำกับภาษีเต็มรูป, ม.86/4).
export interface TaxInvoice {
  id: number
  sale_id: number
  doc_no: string
  buyer_name: string
  buyer_address: string
  buyer_tax_id: string
  buyer_branch: string
  original_printed: number
  issued_by?: number
  issued_at: string
  updated_at?: string
}

// Normalized shape consumed by the receipt/tax-invoice HTML builders. Built from
// either a freshly-completed POS sale (cart data) or a fetched historical sale,
// so both print paths render identically.
export interface SaleForPrint {
  invoice_no: string
  sold_at: string
  sale_type: string
  status: string
  customer_name?: string | null
  salesperson_name?: string | null
  items: Array<{
    item_name: string
    unit_name: string
    qty: number
    unit_price: number
    discount: number
    unit_vat: number
    line_total: number
  }>
  subtotal: number
  total_discount: number
  total_vat: number
  total_amount: number
  cash_amount: number
  change_amount: number
}


// POS / Sales settings (singleton). Keys MUST match sales_settings columns 1:1
// — SalesTab form state is saved verbatim via a dynamic Object.keys() UPDATE.
export interface SalesSettings {
  id: number
  expiry_alert_enabled: number
  expired_alert_enabled: number
  low_stock_alert_enabled: number
  qty_multiplier_enabled: number
  vat_enabled: number
  vat_rate: number
  updated_at?: string
}

export interface ProductCategory {
  id: number; code: string; name: string; description?: string; sort_order: number; is_disabled: number
  usage_count?: number
}

export interface ExpenseCategory {
  id: number; name: string; is_active: number; sort_order: number
}

export interface Expense {
  id: number
  expense_no: string
  expense_date: string
  category_id: number | null
  category_name?: string
  amount: number
  reference_no?: string
  note?: string
  // Input VAT — claimable only when has_tax_invoice = 1 (full tax invoice)
  vat_amount?: number
  has_tax_invoice?: number
  created_at?: string
  updated_at?: string
}

export interface ItemUnit {
  id: number; name: string; usage_count?: number
}

export interface DrugType {
  id: number; code: string; name_th: string
  is_fda9: number; is_fda10: number; is_fda11: number; is_fda13: number
  is_disabled: number
  usage_count?: number
}

export interface DosageForm {
  id: number; name_th: string; name_en?: string; is_disabled: number
}

export interface LabelFrequency {
  id: number; code: string; name_th: string; name_en?: string; sort_order: number
}

export interface LabelDosage {
  id: number; code: string; name_th: string; name_en?: string; sort_order: number
}

export interface LabelMealRelation {
  id: number; code: string; name_th: string; name_en?: string; sort_order: number
}

export type Theme = 'light' | 'dark'

// One outstanding negative-stock marker — a sale_item_lots row with lot_id=NULL
// that represents qty oversold against a product. See electron/ipc/negativeStock.ts.
export interface NegativeStockRow {
  id: number                // sale_item_lots.id
  sale_item_id: number
  sale_id: number
  invoice_no: string
  sold_at: string
  customer_name: string
  product_id: number
  product_code: string
  trade_name: string
  unit_name: string
  qty: number               // outstanding qty in base units
  available_stock: number   // sum qty_on_hand across open non-cancelled lots NOW
}

export interface NegativeStockAlert {
  product_id: number
  trade_name: string
  marker_count: number
  total_qty: number
}

// Database backup feature (Settings → ฐานข้อมูล)
export interface BackupSettings {
  id: number
  auto_enabled: number          // 0/1 (SQLite boolean)
  retention_count: number
  backup_dir: string | null     // user-chosen folder; null = default userData/backups
  last_auto_backup_at: string | null
}

export interface BackupFileInfo {
  name: string
  path: string
  size: number                  // bytes
  mtime: string                 // ISO timestamp
}
