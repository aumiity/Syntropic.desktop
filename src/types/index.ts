export interface Product {
  id: number
  barcode?: string; barcode2?: string; barcode3?: string; barcode4?: string
  code?: string; trade_name: string; name_for_print?: string
  category_id?: number
  is_stock_item: number; is_bundle: number; is_disabled: number; is_hidden: number
  price_retail: number; price_wholesale1: number; price_wholesale2: number; cost_price: number; last_cost_price: number
  has_wholesale1: number; has_wholesale2: number
  unit_id?: number
  has_vat: number
  is_drug: number
  reorder_point?: number; safety_stock?: number
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
  is_for_sale: number; is_for_purchase: number; is_disabled: number
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
  indication_th?: string; indication_mm?: string; indication_zh?: string
  note_th?: string; note_mm?: string; note_zh?: string
  is_active: number; sort_order: number
  frequency_name?: string; dosage_name?: string; timing_name?: string
}

export interface Customer {
  id: number; code: string; full_name: string
  id_card?: string; dob?: string; phone?: string; address?: string
  chronic_diseases?: string
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
}

// POS / Sales settings (singleton). Keys MUST match sales_settings columns 1:1
// — SalesTab form state is saved verbatim via a dynamic Object.keys() UPDATE.
export interface SalesSettings {
  id: number
  expiry_alert_enabled: number
  expiry_warn_months: number
  expiry_danger_months: number
  expired_alert_enabled: number
  low_stock_alert_enabled: number
  qty_multiplier_enabled: number
  updated_at?: string
}

export interface ProductCategory {
  id: number; code: string; name: string; description?: string; sort_order: number; is_disabled: number
}

export interface ItemUnit {
  id: number; name: string; usage_count?: number
}

export interface DrugType {
  id: number; code: string; name_th: string
  is_fda9: number; is_fda10: number; is_fda11: number; is_fda13: number
  is_disabled: number
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
