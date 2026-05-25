import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input, SearchInput } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { FormField } from '@/components/ui/label'
import { Toggle } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import type { DrugType } from '@/types'
import { Plus, Edit, Pill } from 'lucide-react'

const FDA_FLAGS = [
  { key: 'is_fda9',  label: 'ข.ย.9 — บัญชีการซื้อยา' },
  { key: 'is_fda10', label: 'ข.ย.10 — ขายยาควบคุมพิเศษ' },
  { key: 'is_fda11', label: 'ข.ย.11 — ขายยาอันตราย' },
  { key: 'is_fda13', label: 'ข.ย.13 — ขายส่ง (รายปี)' },
] as const

export function DrugTypesTab() {
  const { toast } = useToast()
  const [rows, setRows] = useState<DrugType[]>([])
  const [q, setQ] = useState('')
  const [dialog, setDialog] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const data = await window.api.settings.listDrugTypes() as DrugType[]
    setRows(data)
  }
  useEffect(() => { load() }, [])

  const openAdd = () => { setForm({ code: '', name_th: '', is_fda9: 0, is_fda10: 0, is_fda11: 0, is_fda13: 0 }); setDialog(true) }
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
      await window.api.settings.saveDrugType(form)
      toast({ title: 'บันทึกสำเร็จ', variant: 'success' })
      setDialog(false); load()
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setSaving(false) }
  }


  const setF = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  // Client-side filter — drug-types list is small, no IPC round-trip needed.
  const filtered = q.trim()
    ? rows.filter(d => {
        const needle = q.trim().toLowerCase()
        return d.code.toLowerCase().includes(needle) || d.name_th.toLowerCase().includes(needle)
      })
    : rows

  return (
    <div className="pt-4 h-full flex flex-col min-h-0">
      <div className="bg-card rounded-card shadow-card overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="px-2 h-14 shrink-0 flex items-center gap-3">
          <SearchInput
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="ค้นหารหัส, ชื่อประเภทยา..."
          />
          <Button size="lg" className="h-10 px-2 shrink-0 ml-auto" onClick={openAdd}>
            <Plus className="size-4" /> เพิ่มประเภทยา
          </Button>
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-32">รหัส</TableHead>
                <TableHead className="min-w-[200px]">ชื่อประเภทยา</TableHead>
                <TableHead className="text-center min-w-20">ข.ย.9</TableHead>
                <TableHead className="text-center min-w-20">ข.ย.10</TableHead>
                <TableHead className="text-center min-w-20">ข.ย.11</TableHead>
                <TableHead className="text-center min-w-20">ข.ย.13</TableHead>
                <TableHead className="text-center min-w-24">สถานะ</TableHead>
                <TableHead className="text-center min-w-24">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-16">
                    <Pill className="size-10 mx-auto mb-2 opacity-30" />
                    {q.trim() ? 'ไม่พบข้อมูล' : 'ยังไม่มีประเภทยา'}
                  </TableCell>
                </TableRow>
              ) : filtered.map(d => (
                <TableRow key={d.id} className={d.is_disabled ? 'opacity-60' : ''}>
                  <TableCell className="font-mono text-sm font-semibold">{d.code}</TableCell>
                  <TableCell className="text-sm text-foreground">{d.name_th}</TableCell>
                  {FDA_FLAGS.map(({ key }) => (
                    <TableCell key={key} className="text-center">
                      <div className="flex justify-center">
                        <Checkbox checked={!!(d as any)[key]} tabIndex={-1} className="pointer-events-none" />
                      </div>
                    </TableCell>
                  ))}
                  <TableCell className="text-center">
                    {d.is_disabled
                      ? <Badge variant="secondary" className="text-xs">ปิด</Badge>
                      : <Badge variant="success" className="text-xs">ใช้งาน</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <Button size="icon-lg" variant="outline" onClick={() => openEdit(d)} title="แก้ไข">
                        <Edit />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="px-5 h-12 bg-card border-t border-border flex items-center justify-end text-sm shrink-0">
          <span className="text-muted-foreground">
            แสดง <span className="font-semibold text-foreground">{filtered.length.toLocaleString()}</span> รายการ
          </span>
        </div>
      </div>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle className="text-xl">{form.id ? 'แก้ไขประเภทยา' : 'เพิ่มประเภทยา'}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-3">
            <FormField label="รหัส" required>
              <Input value={form.code ?? ''} onChange={e => setF('code', e.target.value)} placeholder="เช่น GENERAL, OTC" autoFocus />
            </FormField>
            <FormField label="ชื่อประเภทยา" required>
              <Input value={form.name_th ?? ''} onChange={e => setF('name_th', e.target.value)} />
            </FormField>
            <div className="space-y-2">
              <label className="block text-sm font-semibold uppercase text-foreground">
                ค่าเริ่มต้นรายงาน อย. สำหรับสินค้าประเภทนี้
              </label>
              <p className="text-sm text-muted-foreground">
                เลือกสินค้าเป็นประเภทยานี้ → flags ด้านล่างจะถูกตั้งอัตโนมัติ (แก้รายตัวได้ที่แก้ไขสินค้า)
              </p>
              <div className="grid grid-cols-1 gap-2">
                {FDA_FLAGS.map(({ key, label }) => (
                  <Toggle
                    key={key}
                    framed
                    label={label}
                    checked={!!form[key]}
                    onChange={v => setF(key, v ? 1 : 0)}
                    className="justify-between"
                  />
                ))}
              </div>
            </div>
            {form.id ? (
              <Toggle
                framed
                variant="destructive"
                label="พักการใช้งานประเภทยานี้"
                checked={!!form.is_disabled}
                onChange={v => setF('is_disabled', v ? 1 : 0)}
                className="justify-between w-full"
              />
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="destructive2" size="xl" onClick={() => setDialog(false)}>ยกเลิก</Button>
            <Button size="xl" onClick={handleSave} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
