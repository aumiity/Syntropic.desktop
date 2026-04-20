import { create } from 'zustand'
import type { CartItem, Customer } from '../types'

interface CartStore {
  items: CartItem[]
  customer: Customer | null
  customerNameFree: string
  saleType: string
  symptomNote: string
  ageRange: string
  addItem: (item: CartItem) => void
  updateItem: (index: number, item: Partial<CartItem>) => void
  removeItem: (index: number) => void
  clearCart: () => void
  setCustomer: (customer: Customer | null) => void
  setCustomerNameFree: (name: string) => void
  setSaleType: (type: string) => void
  setSymptomNote: (note: string) => void
  setAgeRange: (range: string) => void
  subtotal: () => number
  totalDiscount: () => number
  totalAmount: () => number
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  customer: null,
  customerNameFree: '',
  saleType: 'retail',
  symptomNote: '',
  ageRange: '',

  addItem: (item) => {
    const { items } = get()
    // Check if same product+unit exists → increment qty
    const idx = items.findIndex(
      i => i.product_id === item.product_id && i.unit_name === item.unit_name
    )
    if (idx >= 0) {
      const updated = [...items]
      const existing = updated[idx]
      const newQty = existing.qty + item.qty
      updated[idx] = { ...existing, qty: newQty, line_total: (newQty * existing.unit_price) - existing.discount }
      set({ items: updated })
    } else {
      set({ items: [...items, item] })
    }
  },

  updateItem: (index, updates) => {
    const { items } = get()
    const updated = [...items]
    const item = { ...updated[index], ...updates }
    item.line_total = (item.qty * item.unit_price) - item.discount
    updated[index] = item
    set({ items: updated })
  },

  removeItem: (index) => {
    const { items } = get()
    set({ items: items.filter((_, i) => i !== index) })
  },

  clearCart: () => set({
    items: [], customer: null, customerNameFree: '',
    saleType: 'retail', symptomNote: '', ageRange: '',
  }),

  setCustomer: (customer) => set({ customer }),
  setCustomerNameFree: (name) => set({ customerNameFree: name }),
  setSaleType: (type) => set({ saleType: type }),
  setSymptomNote: (note) => set({ symptomNote: note }),
  setAgeRange: (range) => set({ ageRange: range }),

  subtotal: () => get().items.reduce((sum, i) => sum + i.qty * i.unit_price, 0),
  totalDiscount: () => get().items.reduce((sum, i) => sum + i.discount, 0),
  totalAmount: () => get().items.reduce((sum, i) => sum + i.line_total, 0),
}))
