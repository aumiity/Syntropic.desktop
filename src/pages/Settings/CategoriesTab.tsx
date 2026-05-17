import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { SortableTableBody, SortableRow } from '@/components/ui/sortable'
import { FormField } from '@/components/ui/label'
import { Toggle } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import type { ProductCategory } from '@/types'
import { Plus, Edit, Tag, ArrowUpDown, Check } from 'lucide-react'

export function CategoriesTab() {
  const { toast } = useToast()
  const [rows, setRows] = useState<ProductCategory[]>([])
  const [reorderMode, setReorderMode] = useState(false)
  const [dialog, setDialog] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  // onDragEnd closes over a stale `rows`; read the latest order via ref instead.
  const rowsRef = useRef(rows)
  useEffect(() => { rowsRef.current = rows }, [rows])

  const load = async () => {
    const data = await window.api.settings.listCategories() as ProductCategory[]
    setRows(data)
  }
  useEffect(() => { load() }, [])

  const openAdd = () => { setForm({ code: '', name: '', description: '', sort_order: rows.length }); setDialog(true) }
  const openEdit = (c: ProductCategory) => {
    setForm({
      id: c.id, code: c.code ?? '', name: c.name, description: c.description ?? '',
      sort_order: c.sort_order, is_disabled: c.is_disabled ?? 0,
    })
    setDialog(true)
  }

  const handleSave = async () => {
    if (!form.name?.trim()) { toast({ title: 'กรุณาระบุชื่อหมวดหมู่', variant: 'error' }); return }
    setSaving(true)
    try {
      await window.api.settings.saveCategory(form)
      toast({ title: 'บันทึกสำเร็จ', variant: 'success' })
      setDialog(false); load()
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setSaving(false) }
  }

  // Persist the dropped order. Renumbered 1..n server-side in a transaction.
  const persistOrder = async () => {
    try {
      await window.api.settings.reorderCategories(rowsRef.current.map(r => r.id))
    } catch (e: any) {
      toast({ title: 'จัดลำดับไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
      load()
    }
  }

  const exitReorder = async () => {
    setReorderMode(false)
    await load()
    toast({ title: 'บันทึกลำดับแล้ว', variant: 'success' })
  }

  const setF = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  return (
    <div className="pt-4">
      <div className="bg-card rounded-card shadow-card overflow-hidden">
        <div className="px-5 h-12 text-sm font-semibold text-muted-foreground shrink-0 flex items-center justify-between">
          <span>หมวดหมู่สินค้าและยา · {rows.length.toLocaleString()} รายการ</span>
          <div className="flex items-center gap-2">
            {reorderMode ? (
              <Button size="lg" className="px-2" variant="success" onClick={exitReorder}>
                <Check className="size-4" /> เสร็จสิ้น
              </Button>
            ) : (
              <>
                <Button size="lg" className="px-2" variant="info-soft" onClick={() => setReorderMode(true)} disabled={rows.length < 2}>
                  <ArrowUpDown className="size-4" /> จัดลำดับ
                </Button>
                <Button size="lg" className="px-2" onClick={openAdd}>
                  <Plus className="size-4" /> เพิ่มหมวดหมู่
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="[&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
          <Table>
            <TableHeader>
              <TableRow>
                {reorderMode
                  ? <TableHead className="text-center min-w-16">ลาก</TableHead>
                  : <TableHead className="text-center min-w-20">ลำดับ</TableHead>}
                <TableHead className="min-w-28">รหัส</TableHead>
                <TableHead className="min-w-[200px]">ชื่อหมวดหมู่</TableHead>
                <TableHead className="min-w-[220px]">คำอธิบาย</TableHead>
                <TableHead className="text-center min-w-24">สถานะ</TableHead>
                {!reorderMode && <TableHead className="text-center min-w-24">จัดการ</TableHead>}
              </TableRow>
            </TableHeader>

            {reorderMode ? (
              <SortableTableBody values={rows} onReorder={setRows}>
                {rows.map(c => (
                  <SortableRow key={c.id} value={c} onDragEnd={persistOrder} className={c.is_disabled ? 'opacity-60' : ''}>
                    <TableCell className="font-mono text-sm text-muted-foreground">{c.code ?? '—'}</TableCell>
                    <TableCell className="font-semibold text-sm text-foreground">{c.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.description ?? '—'}</TableCell>
                    <TableCell className="text-center">
                      {c.is_disabled
                        ? <Badge variant="secondary" className="text-xs">ปิด</Badge>
                        : <Badge variant="success" className="text-xs">ใช้งาน</Badge>}
                    </TableCell>
                  </SortableRow>
                ))}
              </SortableTableBody>
            ) : (
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-16">
                      <Tag className="size-10 mx-auto mb-2 opacity-30" />
                      ยังไม่มีหมวดหมู่
                    </TableCell>
                  </TableRow>
                ) : rows.map((c, i) => (
                  <TableRow key={c.id} className={c.is_disabled ? 'opacity-60' : ''}>
                    <TableCell className="text-center text-sm tabular-nums text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{c.code ?? '—'}</TableCell>
                    <TableCell className="font-semibold text-sm text-foreground">{c.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.description ?? '—'}</TableCell>
                    <TableCell className="text-center">
                      {c.is_disabled
                        ? <Badge variant="secondary" className="text-xs">ปิด</Badge>
                        : <Badge variant="success" className="text-xs">ใช้งาน</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center">
                        <Button className="w-16" size="icon-lg" variant="warm" onClick={() => openEdit(c)} title="แก้ไข">
                          <Edit />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            )}
          </Table>
        </div>
      </div>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle className="text-xl">{form.id ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่'}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-3">
            <FormField label="รหัส">
              <Input value={form.code ?? ''} onChange={e => setF('code', e.target.value)} placeholder="เช่น MED, SUP" />
            </FormField>
            <FormField label="ชื่อหมวดหมู่" required>
              <Input value={form.name ?? ''} onChange={e => setF('name', e.target.value)} autoFocus />
            </FormField>
            <FormField label="คำอธิบาย">
              <Input value={form.description ?? ''} onChange={e => setF('description', e.target.value)} />
            </FormField>
            {form.id ? (
              <Toggle
                framed
                variant="destructive"
                label="พักการใช้งานหมวดหมู่นี้"
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
