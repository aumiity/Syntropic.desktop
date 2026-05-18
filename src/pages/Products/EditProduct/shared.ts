// Shared types and constants for EditProduct tabs.
import {
  ArrowDownToLine, ArrowUpFromLine, RotateCcw, SlidersHorizontal, Edit, X,
} from 'lucide-react'
import type { Product, ProductUnit, ProductLot, ProductLabel } from '@/types'

export interface FullProduct extends Product {
  units: ProductUnit[]
  lots: ProductLot[]
  labels: ProductLabel[]
}

export interface StockMovement {
  id: number
  movement_type: string
  ref_type: string | null
  ref_id: number | null
  qty_change: number
  qty_before: number
  qty_after: number
  unit_cost: number
  note: string | null
  created_at: string
  lot_id: number | null
  lot_number: string | null
  expiry_date: string | null
  gr_invoice_no: string | null
  sale_invoice_no: string | null
  created_by: number | null
  created_by_name: string | null
}

export type MovementSortKey = 'created_at'

// Movement type → Thai label, icon, badge variant. Keep in sync with the
// movement_type values written by ipc/products.ts, ipc/purchase.ts, ipc/pos.ts.
export const MOVEMENT_META: Record<string, {
  label: string
  variant: 'success' | 'destructive' | 'info-soft' | 'warm' | 'secondary' | 'tertiary'
  icon: typeof ArrowDownToLine
}> = {
  receive:      { label: 'รับเข้า',     variant: 'success',    icon: ArrowDownToLine },
  sale:         { label: 'ขาย',         variant: 'destructive', icon: ArrowUpFromLine },
  sale_return:  { label: 'คืนสินค้า',  variant: 'tertiary',   icon: RotateCcw },
  adjust_in:    { label: 'ปรับเพิ่ม',  variant: 'info-soft',  icon: SlidersHorizontal },
  adjust_out:   { label: 'ปรับลด',     variant: 'warm',       icon: SlidersHorizontal },
  lot_edit:     { label: 'แก้ไขล็อต',  variant: 'warm',       icon: Edit },
  gr_cancel:    { label: 'ยกเลิกรับ',  variant: 'destructive', icon: X },
}

export interface GenericNameSuggestion { id: number; name: string; is_antibiotic: number }

export const REQUIRED_FIELDS = ['trade_name', 'unit_id', 'price_retail'] as const
export const REQUIRED_LABEL: Record<string, string> = {
  trade_name: 'ชื่อสินค้า',
  unit_id: 'หน่วยหลัก',
  price_retail: 'ราคาขายปลีก',
}
