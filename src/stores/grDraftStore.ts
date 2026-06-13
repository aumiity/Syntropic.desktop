import { create } from 'zustand'
import type { ReceiptRow } from '@/pages/Purchase/AddProductWizard'

// Draft of the goods-receive (GR) form, lifted out of the Purchase page so it
// SURVIVES navigation — same idea as cartStore for POS. Without this the page
// state unmounts (and is lost) the moment the operator switches to the sales
// screen, forcing a full re-entry. In-memory only (no persist middleware): the
// draft is meant to bridge tab-switching within a session, not an app restart.
//
// Only the PERSISTABLE subset lives here. Ephemeral UI state (search
// suggestions, focused cell, open modals, the wizard, the suppliers list) stays
// local to the page and is rebuilt on each mount.
//
// The Sidebar reads `draft?.rows.length` to render the red count badge on
// "การรับสินค้า"; the selector returns a number so the Sidebar only re-renders
// when the count actually changes (not on every keystroke).
export interface GRDraft {
  invoiceNo: string
  supplierId: number
  supplierName: string
  supplierInvoiceNo: string
  orderDate: string
  receiveDate: string
  paymentType: 'cash' | 'credit'
  dueDate: string
  vatMode: 'none' | 'inclusive' | 'exclusive'
  isPaid: boolean
  paidDate: string
  grNote: string
  rows: ReceiptRow[]
  searchQueries: string[]
  // Applied bill-adjustment state (re-applied math baseline + footer summary).
  adjustSubtotal: number | null
  adjustDiscountAmt: number
  adjustSurchargeAmt: number
  appliedDiscount: { baht: string; pct: string }
  appliedSurcharge: { baht: string; pct: string }
  baseRowTotals: number[] | null
}

interface GRDraftStore {
  draft: GRDraft | null
  setDraft: (d: GRDraft) => void
  clearDraft: () => void
}

export const useGRDraftStore = create<GRDraftStore>((set) => ({
  draft: null,
  setDraft: (d) => set({ draft: d }),
  clearDraft: () => set({ draft: null }),
}))
