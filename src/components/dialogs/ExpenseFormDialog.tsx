import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DateInput } from '@/components/ui/date-input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { FormField } from '@/components/ui/label'
import { CheckRow } from '@/components/ui/checkbox'
import { useToast } from '@/components/ui/toast'
import { useShopVat } from '@/hooks/useShopVat'
import { extractVat } from '@/lib/vat'
import type { Expense, ExpenseCategory } from '@/types'

// Enter on a working input fires the primary OK action (modal contract).
// Textarea is exempted so multi-line input keeps newline behaviour.
const submitOnEnter = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
    e.preventDefault()
    fn()
  }
}

const today = () => new Date().toISOString().slice(0, 10)

const blankForm = () => ({
  expense_date: today(),
  category_id: '' as string,
  amount: '',
  reference_no: '',
  note: '',
  has_tax_invoice: false,
  vat_amount: '',
})

export interface ExpenseFormDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Expense to edit. Omit/null = add mode. */
  expense?: Expense | null
  /** Fired after a successful save. */
  onSaved?: () => void
}

/**
 * Shared add/edit expense dialog. Owns its form state + save IPC + toast; the
 * parent reacts via onSaved (reload list). Category list is loaded on open.
 */
export function ExpenseFormDialog({ open, onOpenChange, expense, onSaved }: ExpenseFormDialogProps) {
  const { toast } = useToast()
  const { vatEnabled: shopVatEnabled, vatRate: shopVatRate } = useShopVat()
  const [form, setForm] = useState<any>(blankForm())
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [saving, setSaving] = useState(false)

  const isEdit = !!expense?.id

  // Load categories + (re)init the form whenever the dialog opens.
  useEffect(() => {
    if (!open) return
    window.api.expenses.activeCategories().then((data: any) => setCategories((data ?? []) as ExpenseCategory[]))
    if (expense?.id) {
      setForm({
        id: expense.id,
        expense_date: expense.expense_date ?? today(),
        category_id: expense.category_id != null ? String(expense.category_id) : '',
        amount: expense.amount != null ? String(expense.amount) : '',
        reference_no: expense.reference_no ?? '',
        note: expense.note ?? '',
        has_tax_invoice: expense.has_tax_invoice === 1,
        vat_amount: expense.vat_amount ? String(expense.vat_amount) : '',
      })
    } else {
      setForm(blankForm())
    }
  }, [open, expense])

  const setF = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.expense_date) { toast({ title: 'กรุณาระบุวันที่', variant: 'error' }); return }
    if (!form.category_id) { toast({ title: 'กรุณาเลือกหมวดค่าใช้จ่าย', variant: 'error' }); return }
    // Never coerce blank → 0 — validate explicitly.
    if (form.amount === '' || form.amount == null) { toast({ title: 'กรุณาระบุจำนวนเงิน', variant: 'error' }); return }
    const amount = parseFloat(form.amount)
    if (!Number.isFinite(amount) || amount <= 0) { toast({ title: 'จำนวนเงินไม่ถูกต้อง', variant: 'error' }); return }

    // Input VAT — only sent when claimable (shop VAT + tax invoice on hand).
    // Never coerce blank → 0: a checked toggle with a blank VAT field aborts.
    const claimVat = shopVatEnabled && form.has_tax_invoice
    let vatAmount = 0
    if (claimVat) {
      if (form.vat_amount === '' || form.vat_amount == null) { toast({ title: 'กรุณาระบุยอดภาษีซื้อ', variant: 'error' }); return }
      vatAmount = parseFloat(form.vat_amount)
      if (!Number.isFinite(vatAmount) || vatAmount < 0) { toast({ title: 'ยอดภาษีซื้อไม่ถูกต้อง', variant: 'error' }); return }
      if (vatAmount >= amount) { toast({ title: 'ยอดภาษีซื้อต้องน้อยกว่ายอดค่าใช้จ่าย', variant: 'error' }); return }
    }

    setSaving(true)
    try {
      await window.api.expenses.save({
        id: form.id,
        expense_date: form.expense_date,
        category_id: Number(form.category_id),
        amount,
        reference_no: form.reference_no?.trim() || null,
        note: form.note?.trim() || null,
        has_tax_invoice: claimVat,
        vat_amount: vatAmount,
      })
      toast({ title: 'บันทึกสำเร็จ', variant: 'success' })
      onOpenChange(false)
      onSaved?.()
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" divided onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'แก้ไขค่าใช้จ่าย' : 'เพิ่มค่าใช้จ่าย'}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4" onKeyDown={submitOnEnter(handleSave)}>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="วันที่" required>
              <DateInput value={form.expense_date} onChange={iso => setF('expense_date', iso)} className="w-full" />
            </FormField>
            <FormField label="หมวดค่าใช้จ่าย" required>
              <Select value={form.category_id} onValueChange={v => setF('category_id', v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="เลือกหมวด..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="จำนวนเงิน" required>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.amount}
                onChange={e => setF('amount', e.target.value)}
                placeholder="0.00"
                className="text-right"
              />
            </FormField>
            <FormField label="เลขที่อ้างอิง">
              <Input value={form.reference_no ?? ''} onChange={e => setF('reference_no', e.target.value)} placeholder="เลขที่ใบเสร็จ/บิล" />
            </FormField>
          </div>
          {/* Input VAT (ภาษีซื้อ) — VAT-registered shops only. Claimable only
              with a full tax invoice; toggling on prefills the VAT backed out
              of the (VAT-inclusive) amount, editable for partial-VAT bills. */}
          {shopVatEnabled && (
            <div className="rounded-lg border border-border bg-card shadow-sm divide-y divide-border overflow-hidden">
              <CheckRow
                className="w-full h-11 px-3"
                label="มีใบกำกับภาษีเต็มรูป (ขอคืนภาษีซื้อได้)"
                checked={!!form.has_tax_invoice}
                onChange={v => {
                  setForm((f: any) => ({
                    ...f,
                    has_tax_invoice: v,
                    vat_amount: v && f.vat_amount === '' && parseFloat(f.amount) > 0
                      ? extractVat(parseFloat(f.amount), shopVatRate).toFixed(2)
                      : f.vat_amount,
                  }))
                }}
              />
              {form.has_tax_invoice && (
                <div className="flex items-center justify-between gap-3 h-11 px-3">
                  <span className="text-sm font-medium text-foreground">ยอดภาษีซื้อ (VAT {shopVatRate}%)</span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.vat_amount}
                    onChange={e => setF('vat_amount', e.target.value)}
                    placeholder="0.00"
                    className="h-8 w-32 text-right"
                  />
                </div>
              )}
            </div>
          )}
          <FormField label="หมายเหตุ">
            <Textarea value={form.note ?? ''} onChange={e => setF('note', e.target.value)} rows={3} className="resize-none" />
          </FormField>
        </DialogBody>
        <DialogFooter>
          <Button variant="elevated" size="xl" onClick={() => onOpenChange(false)} disabled={saving}>ยกเลิก</Button>
          <Button size="xl" onClick={handleSave} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
