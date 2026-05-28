import { useState } from 'react'
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
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { TintIcon } from '@/components/ui/tint-icon'
import { Plus, Trash2, Edit, Pill } from 'lucide-react'
import type { ProductLabel } from '@/types'
import type { FullProduct } from './shared'

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

  const setLF = (key: string, v: any) => setLabelForm((f: any) => ({ ...f, [key]: v }))

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
    <div className="pt-4">
      <div className="bg-card rounded-card shadow-card border border-border overflow-hidden">
        <div className="px-4 h-14 shrink-0 flex items-center gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <TintIcon icon={Pill} tint="neutral" size="sm" />
            <h3 className="text-lg font-semibold text-foreground">ฉลากยา</h3>
            <Badge variant="neutral-outline">{product.labels?.length ?? 0}</Badge>
          </div>
          <Button variant="elevated" onClick={openAddLabel} className="h-9 px-3 ml-auto shrink-0">
            <Plus className="size-4" /> เพิ่มฉลาก
          </Button>
        </div>
        <div className="[&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">ชื่อฉลาก</TableHead>
                <TableHead className="min-w-24">ปริมาณ</TableHead>
                <TableHead className="min-w-28">ความถี่</TableHead>
                <TableHead className="min-w-24">เวลา</TableHead>
                <TableHead className="min-w-[200px]">สรรพคุณ</TableHead>
                <TableHead className="min-w-24">สถานะ</TableHead>
                <TableHead className="min-w-24">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(product.labels?.length ?? 0) === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-16">
                    <Pill className="size-10 mx-auto mb-2 opacity-30" />
                    ยังไม่มีฉลาก
                  </TableCell>
                </TableRow>
              ) : product.labels.map(l => (
                <TableRow key={l.id} className={`[&_td]:py-2.5 [&_td]:font-medium ${!l.is_active ? 'opacity-60' : ''}`}>
                  <TableCell className="text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{l.label_name || '—'}</span>
                      {(l as any).is_default ? <Badge variant="brand-outline" className="rounded-md">ค่าเริ่มต้น</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.dosage_name ?? '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.frequency_name ?? '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.timing_name ?? '—'}</TableCell>
                  <TableCell className="text-sm">
                    <span className="line-clamp-2" title={l.indication_th ?? undefined}>
                      {l.indication_th || '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    {l.is_active
                      ? <Badge variant="success-outline" className="rounded-md">เปิด</Badge>
                      : <Badge variant="neutral-outline" className="rounded-md">ปิด</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Button size="icon-lg" variant="outline" onClick={() => openEditLabel(l)} title="แก้ไข">
                        <Edit />
                      </Button>
                      <Button size="icon-lg" variant="destructive2" onClick={() => handleDeleteLabel(l.id)} title="ลบ">
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="px-5 h-12 bg-card border-t border-border text-sm text-muted-foreground shrink-0 flex items-center justify-end gap-3">
          <span>เปิดใช้งาน <span className="font-semibold text-success">{product.labels?.filter(l => l.is_active).length ?? 0}</span></span>
          <span>ปิดใช้งาน <span className="font-semibold text-foreground">{product.labels?.filter(l => !l.is_active).length ?? 0}</span></span>
        </div>
      </div>

      {/* ======================== LABEL DIALOG ======================== */}
      <Dialog open={labelDialog} onOpenChange={setLabelDialog}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>{editingLabel ? 'แก้ไขฉลาก' : 'เพิ่มฉลาก'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="ชื่อฉลาก">
                <Input variant="elevated" value={labelForm.label_name ?? ''} onChange={e => setLF('label_name', e.target.value)} placeholder="เช่น วิธีรับประทานมาตรฐาน" />
              </Field>
              <Field label="ลำดับ">
                <Input variant="elevated" type="number" value={labelForm.sort_order ?? 0} onChange={e => setLF('sort_order', e.target.value)} className="w-24" min={0} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="ปริมาณยา">
                <Select value={String(labelForm.dosage_id ?? 0)} onValueChange={v => setLF('dosage_id', v)}>
                  <SelectTrigger variant="elevated" className="h-10 w-full">
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
                  <SelectTrigger variant="elevated" className="h-10 w-full">
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
                  <SelectTrigger variant="elevated" className="h-10 w-full">
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
                  <SelectTrigger variant="elevated" className="h-10 w-full">
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
                <SelectTrigger variant="elevated" className="h-10 w-full">
                  <SelectValue placeholder="— เลือก —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">— เลือก —</SelectItem>
                  {labelAdvices.map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.name_th}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>

            <Field label="สรรพคุณ (ไทย)">
              <Textarea variant="elevated" value={labelForm.indication_th ?? ''} onChange={e => setLF('indication_th', e.target.value)} rows={2} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="สรรพคุณ (ภาษาพม่า)">
                <Textarea variant="elevated" value={labelForm.indication_mm ?? ''} onChange={e => setLF('indication_mm', e.target.value)} rows={2} />
              </Field>
              <Field label="สรรพคุณ (ภาษาจีน)">
                <Textarea variant="elevated" value={labelForm.indication_zh ?? ''} onChange={e => setLF('indication_zh', e.target.value)} rows={2} />
              </Field>
            </div>

            <Field label="หมายเหตุ (ไทย)">
              <Textarea variant="elevated" value={labelForm.note_th ?? ''} onChange={e => setLF('note_th', e.target.value)} rows={2} />
            </Field>

            <div className="flex flex-wrap gap-4 pt-1">
              <Toggle size="lg" checked={!!labelForm.is_default} onChange={v => setLF('is_default', v ? 1 : 0)} label="ฉลากค่าเริ่มต้น" />
              <Toggle size="lg" checked={!!labelForm.is_active} onChange={v => setLF('is_active', v ? 1 : 0)} label="เปิดใช้งาน" />
              <Toggle size="lg" checked={!!labelForm.show_barcode} onChange={v => setLF('show_barcode', v ? 1 : 0)} label="แสดงบาร์โค้ด" />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="elevated" size="xl" onClick={() => setLabelDialog(false)}>ยกเลิก</Button>
            <Button size="xl" onClick={handleSaveLabel} disabled={labelSaving}>{labelSaving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
