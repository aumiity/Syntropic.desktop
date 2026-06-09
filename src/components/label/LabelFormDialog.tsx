import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Toggle } from '@/components/ui/switch'
import { FormField } from '@/components/ui/label'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { SectionCard } from '@/components/ui/card'
import { Info, Pill, Languages, SlidersHorizontal } from 'lucide-react'
import type { ProductLabel } from '@/types'

const Field = FormField

// The label add/edit form, shared by the product Labels tab AND the POS
// label-print quick-add. Owns its own form state; the parent only supplies the
// product + lookups and gets an onSaved callback to refresh its own data.
// The saveLabel payload keys MUST stay a subset of the INSERT column list
// (electron/ipc/products.ts) — adding/renaming a key throws at runtime.
export interface LabelFormLookups {
  labelFrequencies: any[]
  labelDosages: any[]
  labelMealRelations: any[]
  labelTimes: any[]
  labelAdvices: any[]
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  productId: number
  editingLabel: ProductLabel | null
  productBarcode?: string | null
  lookups: LabelFormLookups
  onSaved: (saved: any) => void | Promise<void>
}

const blankForm = () => ({
  label_name: '',
  dose_qty: '',
  dosage_id: 0,
  frequency_id: 0,
  timing_id: 0,
  label_time_id: 0,
  advice_id: 0,
  indication_th: '',
  indication_en: '',
  indication_mm: '',
  indication_zh: '',
  note_th: '',
  note_mm: '',
  note_zh: '',
  show_barcode: 0,
  is_default: 0,
  is_active: 1,
  sort_order: 0,
})

export function LabelFormDialog({
  open, onOpenChange, productId, editingLabel, productBarcode, lookups, onSaved,
}: Props) {
  const { toast } = useToast()
  const { labelFrequencies, labelDosages, labelMealRelations, labelTimes, labelAdvices } = lookups

  const [labelForm, setLabelForm] = useState<any>(blankForm())
  const [labelSaving, setLabelSaving] = useState(false)
  const setLF = (key: string, v: any) => setLabelForm((f: any) => ({ ...f, [key]: v }))

  // Seed the form whenever the dialog opens (or the target label changes):
  // edit → from the label, add → blank. Keyed on `open` so re-opening add-mode
  // always starts clean.
  useEffect(() => {
    if (!open) return
    if (editingLabel) {
      const l = editingLabel as any
      setLabelForm({
        label_name: l.label_name ?? '',
        dose_qty: l.dose_qty ?? '',
        dosage_id: l.dosage_id ?? 0,
        frequency_id: l.frequency_id ?? 0,
        timing_id: l.timing_id ?? 0,
        label_time_id: l.label_time_id ?? 0,
        advice_id: l.advice_id ?? 0,
        indication_th: l.indication_th ?? '',
        indication_en: l.indication_en ?? '',
        indication_mm: l.indication_mm ?? '',
        indication_zh: l.indication_zh ?? '',
        note_th: l.note_th ?? '',
        note_mm: l.note_mm ?? '',
        note_zh: l.note_zh ?? '',
        show_barcode: l.show_barcode ?? 0,
        is_default: l.is_default ?? 0,
        is_active: l.is_active ?? 1,
        sort_order: l.sort_order ?? 0,
      })
    } else {
      setLabelForm(blankForm())
    }
  }, [open, editingLabel])

  const handleSaveLabel = async () => {
    setLabelSaving(true)
    try {
      const payload: any = {
        product_id: productId,
        label_name: labelForm.label_name || null,
        dose_qty: labelForm.dose_qty !== '' ? parseFloat(labelForm.dose_qty) : null,
        dosage_id: Number(labelForm.dosage_id) || null,
        frequency_id: Number(labelForm.frequency_id) || null,
        timing_id: Number(labelForm.timing_id) || null,
        label_time_id: Number(labelForm.label_time_id) || null,
        advice_id: Number(labelForm.advice_id) || null,
        indication_th: labelForm.indication_th || null,
        indication_en: labelForm.indication_en || null,
        indication_mm: labelForm.indication_mm || null,
        indication_zh: labelForm.indication_zh || null,
        note_th: labelForm.note_th || null,
        note_mm: labelForm.note_mm || null,
        note_zh: labelForm.note_zh || null,
        show_barcode: labelForm.show_barcode ? 1 : 0,
        is_default: labelForm.is_default ? 1 : 0,
        is_active: labelForm.is_active ? 1 : 0,
        sort_order: Number(labelForm.sort_order) || 0,
      }
      if (editingLabel) payload.id = editingLabel.id
      const saved = await window.api.products.saveLabel(payload)
      toast({ title: 'บันทึกฉลากสำเร็จ', variant: 'success' })
      onOpenChange(false)
      await onSaved(saved)
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally {
      setLabelSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl" divided className="max-h-[90vh] grid-rows-[auto_1fr_auto]">
        <DialogHeader>
          <DialogTitle>{editingLabel ? 'แก้ไขฉลาก' : 'เพิ่มฉลาก'}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3 overflow-y-auto min-h-0 scrollbar-thin">
          <div className="grid grid-cols-2 gap-3 items-start">

            {/* LEFT — ข้อมูลทั่วไป + รายละเอียดยา */}
            <div className="space-y-3">
              <SectionCard icon={Info} title="ข้อมูลทั่วไป" tint="primary">
                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <Field label="ชื่อฉลาก">
                    <Input variant="elevated" value={labelForm.label_name ?? ''} onChange={e => setLF('label_name', e.target.value)} placeholder="เช่น วิธีรับประทานมาตรฐาน" />
                  </Field>
                  <Field label="ลำดับ">
                    <Input variant="elevated" type="number" value={labelForm.sort_order ?? 0} onChange={e => setLF('sort_order', e.target.value)} className="w-24" min={0} />
                  </Field>
                </div>
              </SectionCard>

              <SectionCard icon={Pill} title="รายละเอียดยา" tint="info-soft">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="ปริมาณยา">
                    <Select value={String(labelForm.dosage_id ?? 0)} onValueChange={v => setLF('dosage_id', v)}>
                      <SelectTrigger variant="elevated" className="w-full">
                        <SelectValue placeholder="— เลือก —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">— เลือก —</SelectItem>
                        {labelDosages.map((d: any) => <SelectItem key={d.id} value={String(d.id)}>{d.name_th}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="ความถี่">
                    <Select value={String(labelForm.frequency_id ?? 0)} onValueChange={v => setLF('frequency_id', v)}>
                      <SelectTrigger variant="elevated" className="w-full">
                        <SelectValue placeholder="— เลือก —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">— เลือก —</SelectItem>
                        {labelFrequencies.map((f: any) => <SelectItem key={f.id} value={String(f.id)}>{f.name_th}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="เวลาเทียบมื้ออาหาร">
                    <Select value={String(labelForm.timing_id ?? 0)} onValueChange={v => setLF('timing_id', v)}>
                      <SelectTrigger variant="elevated" className="w-full">
                        <SelectValue placeholder="— เลือก —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">— เลือก —</SelectItem>
                        {labelMealRelations.map((m: any) => <SelectItem key={m.id} value={String(m.id)}>{m.name_th}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="เวลาที่รับประทาน">
                    <Select value={String(labelForm.label_time_id ?? 0)} onValueChange={v => setLF('label_time_id', v)}>
                      <SelectTrigger variant="elevated" className="w-full">
                        <SelectValue placeholder="— เลือก —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">— เลือก —</SelectItem>
                        {labelTimes.map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name_th}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field label="คำแนะนำ">
                  <Select value={String(labelForm.advice_id ?? 0)} onValueChange={v => setLF('advice_id', v)}>
                    <SelectTrigger variant="elevated" className="w-full">
                      <SelectValue placeholder="— เลือก —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">— เลือก —</SelectItem>
                      {labelAdvices.map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.name_th}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </SectionCard>
            </div>

            {/* RIGHT — สรรพคุณ (หลายภาษา) */}
            <SectionCard icon={Languages} title="สรรพคุณ" tint="success">
              <Field label="สรรพคุณ (ไทย)">
                <Textarea variant="elevated" value={labelForm.indication_th ?? ''} onChange={e => setLF('indication_th', e.target.value)} rows={2} />
              </Field>
              <Field label="สรรพคุณ (English)">
                <Textarea variant="elevated" value={labelForm.indication_en ?? ''} onChange={e => setLF('indication_en', e.target.value)} rows={2} />
              </Field>
              <Field label="สรรพคุณ (ภาษาพม่า)">
                <Textarea variant="elevated" value={labelForm.indication_mm ?? ''} onChange={e => setLF('indication_mm', e.target.value)} rows={2} />
              </Field>
              <Field label="สรรพคุณ (ภาษาจีน)">
                <Textarea variant="elevated" value={labelForm.indication_zh ?? ''} onChange={e => setLF('indication_zh', e.target.value)} rows={2} />
              </Field>
            </SectionCard>
          </div>

          {/* ตัวเลือก — เต็มความกว้างด้านล่าง */}
          <SectionCard icon={SlidersHorizontal} title="ตัวเลือก" tint="warm">
            <div className="grid grid-cols-3 gap-3">
              <Toggle framed size="lg" checked={!!labelForm.is_default} onChange={v => setLF('is_default', v ? 1 : 0)} label="ฉลากค่าเริ่มต้น" className="justify-between w-full" />
              <Toggle framed size="lg" checked={!!labelForm.is_active} onChange={v => setLF('is_active', v ? 1 : 0)} label="เปิดใช้งาน" className="justify-between w-full" />
              <Toggle framed size="lg" checked={!!labelForm.show_barcode} onChange={v => setLF('show_barcode', v ? 1 : 0)} label="แสดงบาร์โค้ด" className="justify-between w-full" />
            </div>
            {/* The barcode encodes products.barcode — warn if the switch is on but
                the product has no barcode number (the row would silently vanish
                on the printed label). */}
            {!!labelForm.show_barcode && !productBarcode && (
              <div className="mt-2 flex items-start gap-1.5 text-xs text-warning-soft-foreground">
                <Info className="size-3.5 shrink-0 mt-0.5" />
                <span>สินค้านี้ยังไม่มีเลขบาร์โค้ด — บาร์โค้ดจะไม่ขึ้นบนฉลาก กรุณากรอกเลขบาร์โค้ดในแท็บข้อมูลทั่วไปก่อน</span>
              </div>
            )}
          </SectionCard>
        </DialogBody>
        <DialogFooter>
          <Button variant="elevated" size="xl" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button size="xl" onClick={handleSaveLabel} disabled={labelSaving}>{labelSaving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
