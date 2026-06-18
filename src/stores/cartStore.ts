import { create } from 'zustand'
import type { CartItem, Customer } from '../types'

interface CartSlot {
  items: CartItem[]
  customer: Customer | null
  customerNameFree: string
  saleType: string
  symptomNote: string
  ageRange: string
}

const emptySlot = (): CartSlot => ({
  items: [], customer: null, customerNameFree: '',
  saleType: 'retail', symptomNote: '', ageRange: '',
})

interface CartStore extends CartSlot {
  slots: [CartSlot, CartSlot, CartSlot]
  activeSlot: number
  setActiveSlot: (idx: number) => void
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

const snapCurrent = (s: CartStore): CartSlot => ({
  items: s.items, customer: s.customer, customerNameFree: s.customerNameFree,
  saleType: s.saleType, symptomNote: s.symptomNote, ageRange: s.ageRange,
})

export const useCartStore = create<CartStore>((set, get) => ({
  ...emptySlot(),
  slots: [emptySlot(), emptySlot(), emptySlot()],
  activeSlot: 0,

  setActiveSlot: (idx) => {
    const s = get()
    if (idx === s.activeSlot) return
    const slots = [...s.slots] as [CartSlot, CartSlot, CartSlot]
    slots[s.activeSlot] = snapCurrent(s)
    const target = slots[idx]
    set({ slots, activeSlot: idx, ...target })
  },

  addItem: (item) => {
    const { items } = get()
    const idx = items.findIndex(
      i => i.product_id === item.product_id && i.unit_name === item.unit_name
    )
    if (idx >= 0) {
      const updated = [...items]
      const existing = updated[idx]
      const newQty = existing.qty + item.qty
      updated[idx] = { ...existing, qty: newQty, line_total: newQty * existing.unit_price - existing.discount }
      set({ items: updated })
    } else {
      set({ items: [...items, item] })
    }
  },

  updateItem: (index, updates) => {
    const { items } = get()
    const updated = [...items]
    const item = { ...updated[index], ...updates }
    item.line_total = item.qty * item.unit_price - item.discount
    // A unit change can make this line collide with another line of the same
    // product+unit. Merge into the existing line (sum qty + discount) instead
    // of leaving two identical rows — mirrors addItem's dedup and keeps the
    // cart invariant: never two lines with the same product_id + unit_name.
    const collisionIdx = updated.findIndex(
      (i, j) => j !== index && i.product_id === item.product_id && i.unit_name === item.unit_name
    )
    if (collisionIdx >= 0) {
      const target = updated[collisionIdx]
      const newQty = target.qty + item.qty
      const newDiscount = target.discount + item.discount
      updated[collisionIdx] = {
        ...target,
        qty: newQty,
        unit_price: item.unit_price,
        discount: newDiscount,
        line_total: newQty * item.unit_price - newDiscount,
      }
      updated.splice(index, 1)
      set({ items: updated })
      return
    }
    updated[index] = item
    set({ items: updated })
  },

  removeItem: (index) => {
    const { items } = get()
    set({ items: items.filter((_, i) => i !== index) })
  },

  clearCart: () => {
    const { activeSlot, slots } = get()
    const fresh = emptySlot()
    const newSlots = [...slots] as [CartSlot, CartSlot, CartSlot]
    newSlots[activeSlot] = fresh
    set({ ...fresh, slots: newSlots })
  },

  setCustomer: (customer) => set({ customer }),
  setCustomerNameFree: (name) => set({ customerNameFree: name }),
  setSaleType: (type) => {
    const { items, saleType } = get()
    if (type === saleType) return
    const repriced = items.map(item => {
      const { product, selectedUnit } = item
      if (!product) return item
      const price = selectedUnit
        ? (type === 'wholesale' ? (selectedUnit.price_wholesale1 || selectedUnit.price_retail) : selectedUnit.price_retail)
        : (type === 'wholesale' ? (product.price_wholesale1 || product.price_retail) : product.price_retail)
      return { ...item, unit_price: price, line_total: price * item.qty - (item.discount || 0) }
    })
    set({ saleType: type, items: repriced })
  },
  setSymptomNote: (note) => set({ symptomNote: note }),
  setAgeRange: (range) => set({ ageRange: range }),

  subtotal: () => get().items.reduce((sum, i) => sum + i.qty * i.unit_price, 0),
  totalDiscount: () => get().items.reduce((sum, i) => sum + i.discount, 0),
  totalAmount: () => get().items.reduce((sum, i) => sum + i.line_total, 0),
}))
