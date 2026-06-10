import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Toggle } from '@/components/ui/switch'
import { FormField } from '@/components/ui/label'
import { Combobox } from '@/components/ui/combobox'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { SectionCard } from '@/components/ui/card'
import { Info, Pill, Languages } from 'lucide-react'
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
})

export function LabelFormDialog({
  open, onOpenChange, productId, editingLabel, productBarcode, lookups, onSaved,
}: Props) {
  const { toast } = useToast()
  const { labelFrequencies, labelDosages, labelMealRelations, labelTimes, labelAdvices } = lookups

  const [labelForm, setLabelForm] = useState<any>(blankForm())
  const [labelSaving, setLabelSaving] = useState(false)
  const setLF = (key: string, v: any) => setLabelForm((f: any) => ({ ...f, [key]: v }))

  // The five "how to use" lookups, each rendered as a searchable Combobox — they
  // hold many rows (e.g. dosage = "กิน 2 เม็ด", "กิน 4 เม็ด" … the qty is baked
  // into the option), so autocomplete beats a long scroll. id 0 = ไม่เลือก.
  const usageFields: { key: string; label: string; items: any[]; searchPh: string }[] = [
    { key: 'dosage_id',     label: 'ปริมาณยา',           items: labelDosages,       searchPh: 'พิมพ์ค้นหาปริมาณยา...' },
    { key: 'frequency_id',  label: 'ความถี่',            items: labelFrequencies,   searchPh: 'พิมพ์ค้นหาความถี่...' },
    { key: 'timing_id',     label: 'เวลาเทียบมื้ออาหาร',  items: labelMealRelations, searchPh: 'พิมพ์ค้นหาเวลาเทียบมื้อ...' },
    { key: 'label_time_id', label: 'เวลาที่รับประทาน',    items: labelTimes,         searchPh: 'พิมพ์ค้นหาเวลา...' },
    { key: 'advice_id',     label: 'คำแนะนำ',            items: labelAdvices,       searchPh: 'พิมพ์ค้นหาคำแนะนำ...' },
  ]

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
      <DialogContent size="3xl" divided className="max-h-[90vh] grid-rows-[auto_1fr_auto]">
        <DialogHeader>
          <DialogTitle>{editingLabel ? 'แก้ไขฉลาก' : 'เพิ่มฉลาก'}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3 overflow-y-auto min-h-0 scrollbar-thin">
          <div className="grid grid-cols-2 gap-3 items-start">

            {/* LEFT — ข้อมูลทั่วไป + รายละเอียดยา */}
            <div className="space-y-3">
              <SectionCard icon={Info} title="ข้อมูลทั่วไป" tint="primary">
                <Field label="ชื่อฉลาก">
                  <Input variant="elevated" value={labelForm.label_name ?? ''} onChange={e => setLF('label_name', e.target.value)} placeholder="เช่น วิธีรับประทานมาตรฐาน" />
                </Field>
              </SectionCard>

              <SectionCard icon={Pill} title="วิธีใช้ยา" tint="info-soft">
                <div className="space-y-3">
                  {usageFields.map(f => (
                    <Field key={f.key} label={f.label}>
                      <Combobox
                        variant="elevated"
                        items={f.items}
                        value={f.items.find((i: any) => i.id === Number(labelForm[f.key])) ?? null}
                        onChange={(i: any) => setLF(f.key, i?.id ?? 0)}
                        getKey={(i: any) => i.id}
                        getLabel={(i: any) => i.name_th}
                        placeholder="— เลือก —"
                        searchPlaceholder={f.searchPh}
                        emptyLabel="— ไม่เลือก —"
                        emptyText="ไม่พบรายการ"
                      />
                    </Field>
                  ))}
                </div>
              </SectionCard>
            </div>

            {/* RIGHT — กลุ่มสวิช (บน) + สรรพคุณ */}
            <div className="space-y-3">
              {/* Switch group — no card wrapper. Each switch keeps its OWN framed
                  pill, flush together (-mt-px collapses the shared edge), outer
                  ends rounded. เปิดใช้งาน sits on the first row. */}
              <div className="space-y-2">
                <div className="flex flex-col">
                  <Toggle framed size="lg" checked={!!labelForm.is_active} onChange={v => setLF('is_active', v ? 1 : 0)} label="เปิดใช้งาน" className="justify-between w-full h-10 rounded-b-none" />
                  <Toggle framed size="lg" checked={!!labelForm.is_default} onChange={v => setLF('is_default', v ? 1 : 0)} label="ฉลากค่าเริ่มต้น" className="justify-between w-full h-10 rounded-none -mt-px" />
                  <Toggle framed size="lg" checked={!!labelForm.show_barcode} onChange={v => setLF('show_barcode', v ? 1 : 0)} label="แสดงบาร์โค้ด" className="justify-between w-full h-10 rounded-t-none -mt-px" />
                </div>
                {/* The barcode encodes products.barcode — warn if the switch is on but
                    the product has no barcode number (the row would silently vanish
                    on the printed label). */}
                {!!labelForm.show_barcode && !productBarcode && (
                  <div className="flex items-start gap-1.5 text-xs text-warning-soft-foreground">
                    <Info className="size-3.5 shrink-0 mt-0.5" />
                    <span>สินค้านี้ยังไม่มีเลขบาร์โค้ด — บาร์โค้ดจะไม่ขึ้นบนฉลาก กรุณากรอกเลขบาร์โค้ดในแท็บข้อมูลทั่วไปก่อน</span>
                  </div>
                )}
              </div>

              <SectionCard icon={Languages} title="สรรพคุณ" tint="success">
                <Field label="สรรพคุณ (ไทย)">
                  <Input variant="elevated" value={labelForm.indication_th ?? ''} onChange={e => setLF('indication_th', e.target.value)} />
                </Field>
                <Field label="สรรพคุณ (อังกฤษ)">
                  <Input variant="elevated" value={labelForm.indication_en ?? ''} onChange={e => setLF('indication_en', e.target.value)} />
                </Field>
                <Field label="สรรพคุณ (ภาษาพม่า)">
                  <Input variant="elevated" value={labelForm.indication_mm ?? ''} onChange={e => setLF('indication_mm', e.target.value)} />
                </Field>
                <Field label="สรรพคุณ (ภาษาจีน)">
                  <Input variant="elevated" value={labelForm.indication_zh ?? ''} onChange={e => setLF('indication_zh', e.target.value)} />
                </Field>
              </SectionCard>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="elevated" size="xl" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button size="xl" onClick={handleSaveLabel} disabled={labelSaving}>{labelSaving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
