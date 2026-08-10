import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input, SearchInput } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { TintIcon } from '@/components/ui/tint-icon'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { FormField } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { StatusFilterButton, type StatusFilterValue } from '@/components/ui/status-filter'
import type { DrugType } from '@/types'
import { Plus, Edit, Pill, Ban, RotateCcw } from 'lucide-react'

const FDA_FLAGS = [
  { key: 'is_fda9',  label: 'ข.ย.9 — บัญชีการซื้อยา' },
  { key: 'is_fda10', label: 'ข.ย.10 — ขายยาควบคุมพิเศษ' },
  { key: 'is_fda11', label: 'ข.ย.11 — ขายยาอันตราย' },
  { key: 'is_fda13', label: 'ข.ย.13 — ขายส่ง (รายปี)' },
] as const

export function DrugTypesTab() {
  const { toast } = useToast()
  const [rows, setRows] = useState<DrugType[]>([])
  // Products flagged as a drug but with no type assigned — shown as a summary row.
  const [unclassified, setUnclassified] = useState(0)
  const [q, setQ] = useState('')
  const [dialog, setDialog] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  // Usage-status filter (default 'all' = show everything).
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all')
  const [togglingId, setTogglingId] = useState<number | null>(null)
  // Enable/disable confirm target (null = closed)
  const [confirmToggle, setConfirmToggle] = useState<DrugType | null>(null)

  const load = async () => {
    const [data, unclassifiedCount] = await Promise.all([
      window.api.settings.listDrugTypes() as Promise<DrugType[]>,
      window.api.settings.countUnclassifiedDrugs(),
    ])
    setRows(data)
    setUnclassified(unclassifiedCount)
  }
  useEffect(() => { load() }, [])

  // ข.ย.9 (บัญชีการซื้อยา) บังคับเสมอ — ยาทุกประเภทต้องลง ห้ามแก้เป็น 0 → default 1
  const openAdd = () => { setForm({ code: '', name_th: '', is_fda9: 1, is_fda10: 0, is_fda11: 0, is_fda13: 0 }); setDialog(true) }
  const openEdit = (d: DrugType) => {
    setForm({
      id: d.id, code: d.code, name_th: d.name_th,
      is_fda9: d.is_fda9 ?? 0, is_fda10: d.is_fda10 ?? 0, is_fda11: d.is_fda11 ?? 0, is_fda13: d.is_fda13 ?? 0,
      is_disabled: d.is_disabled ?? 0,
    })
    setDialog(true)
  }

  const handleSave = async () => {
    if (!form.code?.trim() || !form.name_th?.trim()) { toast({ title: 'กรุณาระบุรหัสและชื่อ', variant: 'error' }); return }
    setSaving(true)
    try {
      // is_fda9 ล็อก 1 เสมอ — เผื่อ heal ข้อมูลเก่าที่เคยถูกบันทึกเป็น 0 ตอนผู้ใช้แก้+บันทึก
      await window.api.settings.saveDrugType({ ...form, is_fda9: 1 })
      toast({ title: 'บันทึกสำเร็จ', variant: 'success' })
      setDialog(false); load()
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setSaving(false) }
  }


  const setF = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  // Toggle พักการใช้งาน straight from the row. Reuses saveDrugType with the same
  // payload shape openEdit builds (allow-list safe), just with is_disabled flipped.
  const toggleDisabled = async (d: DrugType) => {
    setTogglingId(d.id)
    try {
      await window.api.settings.saveDrugType({
        id: d.id, code: d.code, name_th: d.name_th,
        is_fda9: 1, is_fda10: d.is_fda10 ?? 0, is_fda11: d.is_fda11 ?? 0, is_fda13: d.is_fda13 ?? 0,
        is_disabled: d.is_disabled ? 0 : 1,
      })
      toast({ title: d.is_disabled ? 'เปิดใช้งานแล้ว' : 'พักการใช้งานแล้ว', variant: 'success' })
      await load()
    } catch (e: any) {
      toast({ title: 'ทำรายการไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setTogglingId(null) }
  }

  // Client-side filter — drug-types list is small, no IPC round-trip needed.
  // statusFilter: 'all' shows everything, 'enabled'/'disabled' narrow by status.
  const base = statusFilter === 'all' ? rows
    : statusFilter === 'enabled' ? rows.filter(d => !d.is_disabled)
    : rows.filter(d => d.is_disabled)
  const filtered = q.trim()
    ? base.filter(d => {
        const needle = q.trim().toLowerCase()
        return d.code.toLowerCase().includes(needle) || d.name_th.toLowerCase().includes(needle)
      })
    : base

  return (
    <div className="pt-4 h-full flex flex-col min-h-0">
      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card border border-border overflow-hidden">
        <div className="px-4 h-12 shrink-0 flex items-center gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <TintIcon icon={Pill} tint="elevated" size="sm" />
            <h3 className="text-lg font-semibold text-foreground">ประเภทยา</h3>
            <Badge variant="neutral">{filtered.length.toLocaleString()}</Badge>
          </div>
          <SearchInput
            variant="elevated"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="ค้นหารหัส, ชื่อประเภทยา..."
          />
          <StatusFilterButton value={statusFilter} onChange={setStatusFilter} className="ml-auto" />
          <Button size="lg" className="h-9 px-2 shrink-0" onClick={openAdd}>
            <Plus className="size-4" /> เพิ่มประเภทยา
          </Button>
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin [&>[data-slot=table-container]]:[scrollbar-gutter:stable]">
          <Table className="border-l-[16px] border-r-[6px] border-card">
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-32">รหัส</TableHead>
                <TableHead className="min-w-[200px]">ชื่อประเภทยา</TableHead>
                <TableHead className="text-center min-w-20">ข.ย.9</TableHead>
                <TableHead className="text-center min-w-20">ข.ย.10</TableHead>
                <TableHead className="text-center min-w-20">ข.ย.11</TableHead>
                <TableHead className="text-center min-w-20">ข.ย.13</TableHead>
                <TableHead className="text-right min-w-40">จำนวนสินค้า</TableHead>
                <TableHead className="text-center min-w-24">สถานะ</TableHead>
                <TableHead className="text-center min-w-28">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unclassified > 0 && !q.trim() && (
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableCell colSpan={6}>
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-foreground">ยังไม่ระบุประเภท</span>
                      <span className="text-xs text-muted-foreground">สินค้าที่ติดธงว่าเป็นยา แต่ยังไม่ได้เลือกประเภทยา</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="accent-outline">{unclassified.toLocaleString()} รายการ</Badge>
                  </TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              )}
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-16">
                    <Pill className="size-10 mx-auto mb-2 opacity-30" />
                    {q.trim() ? 'ไม่พบข้อมูล' : 'ยังไม่มีประเภทยา'}
                  </TableCell>
                </TableRow>
              ) : filtered.map(d => (
                <TableRow key={d.id}>
                  <TableCell className="text-sm font-semibold">{d.code}</TableCell>
                  <TableCell className="text-sm text-foreground">{d.name_th}</TableCell>
                  {FDA_FLAGS.map(({ key }) => {
                    // ข.ย.9 = ค่าบังคับ → disabled + ติ๊กค้างเสมอ (teal จาง เหมือน EditProduct)
                    const locked = key === 'is_fda9'
                    return (
                      <TableCell key={key} className="text-center">
                        <div className="flex justify-center">
                          <Checkbox
                            checked={locked ? true : !!(d as any)[key]}
                            disabled={locked}
                            tabIndex={-1}
                            className={locked ? undefined : 'pointer-events-none'}
                          />
                        </div>
                      </TableCell>
                    )
                  })}
                  <TableCell className="text-right">
                    <Badge variant={(d.usage_count ?? 0) > 0 ? 'teal-outline' : 'mutedborder'}>
                      {(d.usage_count ?? 0).toLocaleString()} รายการ
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {d.is_disabled
                      ? <Badge variant="destructive-outline">ปิดใช้งาน</Badge>
                      : <Badge variant="success-outline">ใช้งาน</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center gap-1.5">
                      <Button size="icon-lg" variant="elevated" onClick={() => openEdit(d)} tooltip="แก้ไข">
                        <Edit />
                      </Button>
                      <Button size="icon-lg" variant={d.is_disabled ? 'elevated-success-soft' : 'elevated-destructive-soft'} disabled={togglingId === d.id}
                        onClick={() => setConfirmToggle(d)}
                        tooltip={d.is_disabled ? 'เปิดใช้งาน' : 'พักการใช้งาน'}>
                        {d.is_disabled ? <RotateCcw /> : <Ban />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="px-4 h-12 bg-card border-t border-border flex items-center justify-end text-sm shrink-0">
          <span className="text-muted-foreground">
            แสดง <span className="font-semibold text-foreground">{filtered.length.toLocaleString()}</span> รายการ
          </span>
        </div>
      </div>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent size="sm" divided>
          <DialogHeader><DialogTitle className="text-xl">{form.id ? 'แก้ไขประเภทยา' : 'เพิ่มประเภทยา'}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-3">
            <FormField label="รหัส" required>
              <Input variant="elevated" value={form.code ?? ''} onChange={e => setF('code', e.target.value)} placeholder="เช่น GENERAL, OTC" autoFocus />
            </FormField>
            <FormField label="ชื่อประเภทยา" required>
              <Input variant="elevated" value={form.name_th ?? ''} onChange={e => setF('name_th', e.target.value)} />
            </FormField>
            <div className="space-y-2">
              <label className="block text-sm font-semibold uppercase text-foreground">
                ค่าเริ่มต้น
              </label>
              <p className="rounded-lg border border-primary-soft-border bg-primary-soft px-3 py-2 text-xs text-primary">
                การตั้งค่านี้จะส่งผลต่อทุกสินค้าในประเภท โดยอัตโนมัติ (สามารถแก้ไขเพิ่มเติมได้ที่ การตั้งค่าสินค้ารายตัว)
              </p>
              <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                {FDA_FLAGS.map(({ key, label }) => {
                  // ข.ย.9 = บัญชีการซื้อยา: ยาทุกประเภทต้องลงตามกฎหมาย → ติ๊กค้าง readonly
                  // (สื่อว่าเป็นค่าบังคับ ไม่ใช่ตัวเลือก). ที่เหลือ 10/11/13 เลือกได้ปกติ.
                  const locked = key === 'is_fda9'
                  return (
                    <label
                      key={key}
                      className={`flex items-center gap-2 px-3 h-12 select-none ${locked ? 'cursor-default' : 'cursor-pointer'}`}
                    >
                      <Checkbox
                        checked={locked ? true : !!form[key]}
                        onCheckedChange={locked ? undefined : (v => setF(key, v ? 1 : 0))}
                        disabled={locked}
                      />
                      <span className="text-sm">{label}</span>
                      {locked}
                    </label>
                  )
                })}
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="elevated" size="xl" onClick={() => setDialog(false)}>ยกเลิก</Button>
            <Button size="xl" onClick={handleSave} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmToggle}
        onOpenChange={(v) => { if (!v) setConfirmToggle(null) }}
        variant={confirmToggle?.is_disabled ? 'success' : 'destructive'}
        title={confirmToggle?.is_disabled ? 'เปิดการใช้งาน' : 'ปิดการใช้งาน'}
        description={confirmToggle ? `ต้องการ${confirmToggle.is_disabled ? 'เปิด' : 'ปิด'}ใช้งาน "${confirmToggle.name_th}" ?` : undefined}
        onConfirm={() => { if (confirmToggle) toggleDisabled(confirmToggle); setConfirmToggle(null) }}
      />
    </div>
  )
}
