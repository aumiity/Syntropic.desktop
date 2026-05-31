import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCartStore } from '@/stores/cartStore'
import { useToast } from '@/components/ui/toast'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { buildCartItemsFromQuote } from './loadToCart'
import type { CartItem, Customer, Quotation } from '@/types'

// Encapsulates the "convert quotation → POS cart" flow with its two dialogs
// (blocked-lines notice + replace-cart confirm). Order matches the plan:
// validate (block if any line unsellable) → confirm replace → atomically claim
// (accepted→converting) → load cart → go to POS. Works for both a fresh accepted
// quote and resuming one already in 'converting'.
export function useQuotationConvert() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const cart = useCartStore()
  const [blocked, setBlocked] = useState<string[] | null>(null)
  const [pending, setPending] = useState<{ quote: Quotation; items: CartItem[] } | null>(null)

  const doLoad = async (quote: Quotation, items: CartItem[]) => {
    try {
      // Claim only when coming from 'accepted'; a 'converting' quote is a resume.
      if (quote.status === 'accepted') await window.api.quotation.beginConversion(quote.id)
    } catch (e: any) {
      toast({ title: 'แปลงเป็นการขายไม่ได้', description: e?.message ?? '', variant: 'error' })
      return
    }
    cart.clearCart()
    items.forEach(it => cart.addItem(it))
    if (quote.customer_id) {
      const c = await window.api.people.getCustomer(quote.customer_id) as Customer | null
      if (c) cart.setCustomer(c)
      else cart.setCustomerNameFree(quote.customer_name || '')
    } else if (quote.customer_name) {
      cart.setCustomerNameFree(quote.customer_name)
    }
    cart.setSourceQuotation({ id: quote.id, quote_no: quote.quote_no })
    navigate('/')
  }

  const start = async (quoteId: number) => {
    const quote = await window.api.quotation.get(quoteId) as Quotation | null
    if (!quote) { toast({ title: 'ไม่พบใบเสนอราคา', variant: 'error' }); return }
    const { items, blocked: blk } = await buildCartItemsFromQuote(quote)
    if (blk.length > 0) { setBlocked(blk); return }            // block — do NOT claim
    if (items.length === 0) { toast({ title: 'ใบนี้ไม่มีรายการที่ขายได้', variant: 'error' }); return }
    if (cart.items.length > 0) { setPending({ quote, items }); return }  // confirm replace first
    await doLoad(quote, items)
  }

  const dialogs = (
    <>
      <ConfirmDialog
        open={blocked !== null}
        onOpenChange={o => { if (!o) setBlocked(null) }}
        variant="destructive"
        singleButton
        title="ไม่สามารถแปลงเป็นการขายได้"
        description="มีรายการที่ขายไม่ได้ ต้องแก้ไขก่อน:"
        confirmLabel="ตกลง"
        content={blocked && (
          <ul className="text-sm text-left list-disc pl-5 space-y-1">
            {blocked.map((b, i) => <li key={i} className="text-foreground">{b}</li>)}
          </ul>
        )}
        onConfirm={() => setBlocked(null)}
      />
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={o => { if (!o) setPending(null) }}
        variant="warning"
        title="แทนที่ตะกร้าปัจจุบัน?"
        description="ตะกร้ามีสินค้าอยู่แล้ว การแปลงใบเสนอราคาจะล้างของเดิมแล้วใส่รายการจากใบนี้แทน"
        confirmLabel="แทนที่"
        onConfirm={() => { const p = pending; setPending(null); if (p) void doLoad(p.quote, p.items) }}
      />
    </>
  )

  return { start, dialogs }
}
