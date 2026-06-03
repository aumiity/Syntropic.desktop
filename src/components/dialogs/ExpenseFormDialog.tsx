import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DateInput } from '@/components/ui/date-input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { FormField } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import type { Expense, ExpenseCategory } from '@/types'

// Optional payment-method choices — Thai labels, stored as cash/transfer/card.
const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: 'cash', label: 'เงินสด' },
  { value: 'transfer', label: 'เงินโอน' },
  { value: 'card', label: 'บัตร' },
]

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
  payment_method: '' as string,
  vendor: '',
  reference_no: '',
  note: '',
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
        payment_method: expense.payment_method ?? '',
        vendor: expense.vendor ?? '',
        reference_no: expense.reference_no ?? '',
        note: expense.note ?? '',
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

    setSaving(true)
    try {
      await window.api.expenses.save({
        id: form.id,
        expense_date: form.expense_date,
        category_id: Number(form.category_id),
        amount,
        payment_method: form.payment_method || null,
        vendor: form.vendor?.trim() || null,
        reference_no: form.reference_no?.trim() || null,
        note: form.note?.trim() || null,
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
            <FormField label="ช่องทางชำระ">
              <Select value={form.payment_method} onValueChange={v => setF('payment_method', v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="ไม่ระบุ" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="ผู้รับเงิน / ร้านค้า">
              <Input value={form.vendor ?? ''} onChange={e => setF('vendor', e.target.value)} placeholder="เช่น การไฟฟ้าฯ" />
            </FormField>
            <FormField label="เลขที่อ้างอิง">
              <Input value={form.reference_no ?? ''} onChange={e => setF('reference_no', e.target.value)} placeholder="เลขที่ใบเสร็จ/บิล" />
            </FormField>
          </div>
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
