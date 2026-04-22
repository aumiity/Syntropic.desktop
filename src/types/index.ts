export interface Product {
  id: number
  barcode?: string; barcode2?: string; barcode3?: string; barcode4?: string
  code?: string; trade_name: string; name_for_print?: string
  category_id?: number; dosage_form_id?: number; unit_id?: number
  is_stock_item: number; is_disabled: number; is_hidden: number
  price_retail: number; price_wholesale1: number; price_wholesale2: number; cost_price: number
  has_wholesale1: number; has_wholesale2: number
  has_vat: number; no_discount: number
  reorder_point?: number; safety_stock?: number
  drug_type_id?: number; strength?: string; registration_no?: string
  is_original_drug: number; is_antibiotic: number; max_dispense_qty?: number
  indication_note?: string; side_effect_note?: string
  is_fda_report: number; is_fda13_report: number
  is_sale_control: number; sale_control_qty?: number
  search_keywords?: string; note?: string
  // Joined
  category_name?: string; drug_type_name?: string; dosage_form_name?: string; unit_name?: string
  stock_qty?: number
  // Relations
  units?: ProductUnit[]; lots?: ProductLot[]; labels?: ProductLabel[]
}

export interface ProductUnit {
  id: number; product_id: number; unit_id: number
  barcode?: string; qty_per_base: number
  price_retail: number; price_wholesale1: number; price_wholesale2: number
  is_base_unit: number; is_for_sale: number; is_for_purchase: number; is_disabled: number
  unit_name?: string
}

export interface ProductLot {
  id: number; product_id: number; supplier_id?: number
  lot_number: string; manufactured_date?: string; expiry_date?: string
  cost_price: number; sell_price: number
  qty_received: number; qty_on_hand: number; qty_reserved: number
  invoice_no?: string; supplier_invoice_no?: string
  payment_type: string; due_date?: string; is_paid: number; paid_date?: string
  is_closed: number; note?: string
  supplier_name?: string
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
  id_card?: string; hn?: string; dob?: string; phone?: string; address?: string
  hc_uc: number; hc_gov: number; hc_sso: number
  food_allergy?: string; other_allergy?: string; chronic_diseases?: string
  is_alert: number; alert_note?: string; warning_note?: string; is_hidden: number
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
  tax_id?: string; phone?: string; address?: string; contact_name?: string
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

export interface ProductCategory {
  id: number; code: string; name: string; description?: string; sort_order: number; is_disabled: number
}

export interface ItemUnit {
  id: number; name: string; multiply: number; usage_count?: number
}

export interface DrugType {
  id: number; code: string; name_th: string; khor_yor_report?: string; is_disabled: number
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
