// Shared types and constants for EditProduct tabs.
import {
  ArrowDownToLine, ArrowUpFromLine, RotateCcw, SlidersHorizontal, ClockAlert, X, Ban,
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
// movement_type values written by ipc/products.ts, ipc/purchase.ts, ipc/pos.ts,
// ipc/reports.ts. Note sale_return (customer brings goods back, ref_type='return')
// vs sale_void (whole bill cancelled, ref_type='sale') are distinct types.
// `expired` and `near_expiry` share label/icon/variant — they're both
// disposals from /manage/expiry, distinguished only by whether the lot was
// already past its expiry date when cut. UI merges them as one row in the
// table and one checkbox in the filter.
export const MOVEMENT_META: Record<string, {
  label: string
  variant:
    | 'success-outline' | 'destructive-outline' | 'info-outline'
    | 'warning-outline' | 'violet-outline' | 'muted-outline' | 'brand-outline'
  icon: typeof ArrowDownToLine
}> = {
  receive:         { label: 'รับเข้า',     variant: 'success-outline',     icon: ArrowDownToLine },
  sale:            { label: 'ขาย',         variant: 'destructive-outline', icon: ArrowUpFromLine },
  sale_return:     { label: 'คืนสินค้า', variant: 'violet-outline',      icon: RotateCcw },
  sale_void:       { label: 'ยกเลิกการขาย', variant: 'muted-outline',       icon: Ban },
  adjust_in:       { label: 'ปรับเพิ่ม',  variant: 'brand-outline',       icon: SlidersHorizontal },
  adjust_out:      { label: 'ปรับลด',     variant: 'warning-outline',     icon: SlidersHorizontal },
  purchase_return: { label: 'ยกเลิกรับ',  variant: 'muted-outline',       icon: X },
  expired:         { label: 'หมดอายุ',    variant: 'destructive-outline', icon: ClockAlert },
  near_expiry:     { label: 'หมดอายุ',    variant: 'destructive-outline', icon: ClockAlert },
}

export interface GenericNameSuggestion { id: number; name: string; is_antibiotic: number }

export const REQUIRED_FIELDS = ['trade_name', 'unit_id', 'price_retail'] as const
export const REQUIRED_LABEL: Record<string, string> = {
  trade_name: 'ชื่อสินค้า',
  unit_id: 'หน่วยหลัก',
  price_retail: 'ราคาขายปลีก',
}
