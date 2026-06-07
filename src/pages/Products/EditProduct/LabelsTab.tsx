import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
import { cn } from '@/lib/utils'
import { Plus, Trash2, Edit, Pill, Info, Languages, SlidersHorizontal, List } from 'lucide-react'
import type { ProductLabel } from '@/types'
import type { FullProduct } from './shared'
// Label anatomy (settings shape / defaults) — SSOT shared with the Settings
// label-designer, so this preview matches the print 1:1. LabelPaper does the
// actual rendering; composeLabelContent maps this product's label → text.
import { LABEL_DEFAULTS, type LabelSettingsForm } from '@/lib/label/sections'
import { composeLabelContent, todayBE } from '@/lib/label/content'
import { LabelPaper } from '@/components/label/LabelPaper'

const Field = FormField

interface Props {
  product: FullProduct
  productId: number
  labelFrequencies: any[]
  labelDosages: any[]
  labelMealRelations: any[]
  labelTimes: any[]
  labelAdvices: any[]
  onRefresh: () => Promise<void> | void
}

export function LabelsTab({
  product, productId,
  labelFrequencies, labelDosages, labelMealRelations, labelTimes, labelAdvices,
  onRefresh,
}: Props) {
  const { toast } = useToast()

  const [labelDialog, setLabelDialog] = useState(false)
  const [editingLabel, setEditingLabel] = useState<ProductLabel | null>(null)
  const [labelForm, setLabelForm] = useState<any>({})
  const [labelSaving, setLabelSaving] = useState(false)

  // Selected label drives the LEFT preview. Falls back to the default label
  // (else the first) and follows the list as labels are added / removed.
  const [selectedId, setSelectedId] = useState<number | null>(null)
  // Label paper/font settings — loaded once so the preview matches the printed
  // sticker 1:1. Shop info feeds the preview's top (หัวร้าน) section.
  const [labelSettings, setLabelSettings] = useState<LabelSettingsForm>(LABEL_DEFAULTS)
  const [shop, setShop] = useState<any>(null)

  const setLF = (key: string, v: any) => setLabelForm((f: any) => ({ ...f, [key]: v }))

  useEffect(() => {
    // Per-key overwrite so stale UI-only keys never poison the settings shape.
    window.api.settings.getLabelSettings().then((data: any) => {
      if (!data) return
      setLabelSettings(prev => {
        const next = { ...prev }
        for (const k of Object.keys(prev) as (keyof LabelSettingsForm)[]) {
          const val = (data as any)[k]
          if (val !== undefined && val !== null) (next as any)[k] = val
        }
        return next
      })
    }).catch(() => {})
    window.api.settings.getShop().then((s: any) => setShop(s)).catch(() => {})
  }, [])

  const labels = product.labels ?? []
  const selected = useMemo(() => {
    if (selectedId != null) {
      const hit = labels.find(l => l.id === selectedId)
      if (hit) return hit
    }
    return labels.find(l => (l as any).is_default) ?? labels[0] ?? null
  }, [selectedId, labels])

  const openAddLabel = () => {
    setEditingLabel(null)
    setLabelForm({
      label_name: '',
      dose_qty: '',
      dosage_id: 0,
      frequency_id: 0,
      timing_id: 0,
      label_time_id: 0,
      advice_id: 0,
      indication_th: '',
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
    setLabelDialog(true)
  }

  const openEditLabel = (l: ProductLabel) => {
    setEditingLabel(l)
    setLabelForm({
      label_name: l.label_name ?? '',
      dose_qty: l.dose_qty ?? '',
      dosage_id: l.dosage_id ?? 0,
      frequency_id: l.frequency_id ?? 0,
      timing_id: l.timing_id ?? 0,
      label_time_id: (l as any).label_time_id ?? 0,
      advice_id: (l as any).advice_id ?? 0,
      indication_th: l.indication_th ?? '',
      indication_mm: l.indication_mm ?? '',
      indication_zh: l.indication_zh ?? '',
      note_th: l.note_th ?? '',
      note_mm: l.note_mm ?? '',
      note_zh: l.note_zh ?? '',
      show_barcode: (l as any).show_barcode ?? 0,
      is_default: (l as any).is_default ?? 0,
      is_active: l.is_active ?? 1,
      sort_order: l.sort_order ?? 0,
    })
    setLabelDialog(true)
  }

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
      await window.api.products.saveLabel(payload)
      toast({ title: 'บันทึกฉลากสำเร็จ', variant: 'success' })
      setLabelDialog(false)
      await onRefresh()
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally {
      setLabelSaving(false)
    }
  }

  const handleDeleteLabel = async (labelId: number) => {
    try {
      await window.api.products.deleteLabel(labelId)
      toast({ title: 'ลบฉลากสำเร็จ', variant: 'success' })
      await onRefresh()
    } catch (e: any) {
      toast({ title: 'ลบไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    }
  }

  return (
    <>
      <div className="grid grid-cols-[3fr_2fr] gap-4 pt-4 items-start">

        {/* LEFT — faithful 1:1 preview of the selected label */}
        <SectionCard icon={Pill} title="ตัวอย่างฉลาก" tint="success">
          {/* The label paper is rendered by the shared LabelPaper component
              (also used by the Settings designer preview) so this matches the
              printed sticker 1:1. composeLabelContent maps this label → text. */}
          <div className="flex items-center justify-center bg-muted/30 rounded-lg p-6 min-h-[360px] overflow-auto">
            {selected ? (
              <LabelPaper
                settings={labelSettings}
                content={composeLabelContent(selected as any, product, shop, { labelTimes, labelAdvices })}
                date={todayBE()}
              />
            ) : (
              <div
                className="border-2 border-dashed border-border bg-card text-foreground-subtle flex flex-col items-center justify-center gap-2 shrink-0"
                style={{ width: `${labelSettings.width_mm}mm`, height: `${labelSettings.height_mm}mm` }}
              >
                <Pill className="size-8 opacity-40" />
                <span className="text-sm">เลือกฉลากเพื่อดูตัวอย่าง</span>
              </div>
            )}
          </div>
        </SectionCard>

        {/* RIGHT — label list: ชื่อ + สถานะ + ปุ่มจัดการ (รายละเอียดดูจาก preview) */}
        <SectionCard
          icon={List}
          title="รายการฉลาก"
          tint="secondary"
          right={
            <Button variant="elevated" onClick={openAddLabel} className="h-9 px-3">
              <Plus className="size-4" /> เพิ่มฉลาก
            </Button>
          }
        >
          {labels.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
              <Pill className="size-10 opacity-30" />
              <span className="text-sm">ยังไม่มีฉลาก — กด เพิ่มฉลาก เพื่อเริ่ม</span>
            </div>
          ) : (
            <div className="space-y-2">
              {labels.map(l => {
                const isSel = selected?.id === l.id
                return (
                  <div
                    key={l.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(l.id)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(l.id) } }}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors',
                      isSel ? 'border-primary ring-2 ring-primary/30 bg-primary-soft/40' : 'border-border hover:bg-primary-soft/30',
                      !l.is_active && 'opacity-60',
                    )}
                  >
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                      <span className="text-sm font-semibold overflow-x-clip overflow-y-visible whitespace-nowrap">
                        {l.label_name || 'ฉลากไม่มีชื่อ'}
                      </span>
                      {(l as any).is_default ? <Badge variant="primary-outline" className="rounded-md shrink-0">ค่าเริ่มต้น</Badge> : null}
                      {!l.is_active ? <Badge variant="neutral-outline" className="rounded-md shrink-0">ปิด</Badge> : null}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button size="icon-lg" variant="elevated" onClick={e => { e.stopPropagation(); openEditLabel(l) }} title="แก้ไข">
                        <Edit />
                      </Button>
                      <Button size="icon-lg" variant="elevated-destructive" onClick={e => { e.stopPropagation(); handleDeleteLabel(l.id) }} title="ลบ">
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {/* ======================== LABEL DIALOG ======================== */}
      <Dialog open={labelDialog} onOpenChange={setLabelDialog}>
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
            </SectionCard>
          </DialogBody>
          <DialogFooter>
            <Button variant="elevated" size="xl" onClick={() => setLabelDialog(false)}>ยกเลิก</Button>
            <Button size="xl" onClick={handleSaveLabel} disabled={labelSaving}>{labelSaving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
