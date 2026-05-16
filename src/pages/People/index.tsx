import React, { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Pagination } from '@/components/ui/pagination'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { Switch, Toggle } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import type { Customer, Supplier, User, DrugAllergy } from '@/types'
import { Search, Plus, Edit, Trash2, AlertTriangle, Users, Building2, UserCog } from 'lucide-react'

const SEVERITY_LABELS: Record<string, string> = {
  mild: 'เล็กน้อย', moderate: 'ปานกลาง', severe: 'รุนแรง', life_threatening: 'อันตรายถึงชีวิต'
}
const SEVERITY_VARIANTS: Record<string, any> = {
  mild: 'secondary', moderate: 'warning', severe: 'danger', life_threatening: 'destructive'
}

// Enter on a working input fires the dialog's primary OK action (modal contract).
// Textarea is exempted so multi-line input keeps newline behaviour.
const submitOnEnter = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
    e.preventDefault()
    fn()
  }
}

// ========================
// CUSTOMERS TAB
// ========================
function CustomersTab() {
  const { toast } = useToast()
  const [rows, setRows] = useState<Customer[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)

  const [dialog, setDialog] = useState(false)
  const [editing, setEditing] = useState<(Customer & { allergies?: DrugAllergy[] }) | null>(null)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)

  const limit = 50
  const totalPages = Math.ceil(total / limit)

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const res = await window.api.people.listCustomers({ q: q.trim() || undefined, page: p }) as any
      setRows(res.rows); setTotal(res.total); setPage(p)
    } finally { setLoading(false) }
  }, [q])

  // Realtime search — debounce text input (also covers initial mount, q='').
  useEffect(() => {
    const t = setTimeout(() => load(1), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const openAdd = () => {
    setEditing(null)
    setForm({
      full_name: '', id_card: '', hn: '', dob: '', phone: '', address: '',
      hc_uc: 0, hc_gov: 0, hc_sso: 0,
      food_allergy: '', other_allergy: '', chronic_diseases: '',
      is_alert: 0, alert_note: '', warning_note: '',
    })
    setDialog(true)
  }

  const openEdit = async (c: Customer) => {
    const data = await window.api.people.getCustomer(c.id) as any
    setEditing(data)
    setForm({
      id: data.id,
      full_name: data.full_name ?? '',
      id_card: data.id_card ?? '',
      hn: data.hn ?? '',
      dob: data.dob ?? '',
      phone: data.phone ?? '',
      address: data.address ?? '',
      hc_uc: data.hc_uc ?? 0,
      hc_gov: data.hc_gov ?? 0,
      hc_sso: data.hc_sso ?? 0,
      food_allergy: data.food_allergy ?? '',
      other_allergy: data.other_allergy ?? '',
      chronic_diseases: data.chronic_diseases ?? '',
      is_alert: data.is_alert ?? 0,
      alert_note: data.alert_note ?? '',
      warning_note: data.warning_note ?? '',
    })
    setDialog(true)
  }

  const handleSave = async () => {
    if (!form.full_name?.trim()) { toast({ title: 'กรุณาระบุชื่อ', variant: 'error' }); return }
    setSaving(true)
    try {
      await window.api.people.saveCustomer(form)
      toast({ title: 'บันทึกสำเร็จ', variant: 'success' })
      setDialog(false)
      load(page)
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await window.api.people.deleteCustomer(deleteTarget.id)
      toast({ title: 'ลบลูกค้าสำเร็จ', variant: 'success' })
      setDeleteTarget(null)
      load(page)
    } catch (e: any) {
      toast({ title: 'ลบไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    }
  }

  const setF = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Toolbar */}
      <div className="flex gap-2 items-center shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input value={q} onChange={e => setQ(e.target.value)}
            placeholder="ค้นหาชื่อ, โทร, รหัส, HN..." className="h-10 pl-9 rounded-lg bg-card" />
        </div>
      </div>

      {/* List card */}
      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card overflow-hidden">
        <div className="px-5 h-12 text-sm font-semibold text-muted-foreground shrink-0 flex items-center justify-between">
          <span>{loading ? 'กำลังโหลด...' : `พบ ${total.toLocaleString()} รายการ`}</span>
          <Button onClick={openAdd} className="h-9 rounded-lg px-2 text-sm">
            <Plus className="size-4" /> เพิ่มลูกค้า
          </Button>
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">รหัส</TableHead>
                <TableHead>ชื่อ-นามสกุล</TableHead>
                <TableHead>โทรศัพท์</TableHead>
                <TableHead>HN</TableHead>
                <TableHead className="text-center">สิทธิ์</TableHead>
                <TableHead className="text-center w-24">แจ้งเตือน</TableHead>
                <TableHead className="text-center w-28">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-16">
                    <Users className="size-10 mx-auto mb-2 opacity-30" />
                    ไม่พบข้อมูลลูกค้า
                  </TableCell>
                </TableRow>
              ) : rows.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-sm text-muted-foreground">{c.code}</TableCell>
                  <TableCell>
                    <div className="font-medium text-sm text-foreground">{c.full_name}</div>
                    {c.chronic_diseases && <div className="text-sm text-muted-foreground truncate max-w-[200px]">{c.chronic_diseases}</div>}
                  </TableCell>
                  <TableCell className="text-sm">{c.phone ?? '—'}</TableCell>
                  <TableCell className="text-sm font-mono">{c.hn ?? '—'}</TableCell>
                  <TableCell className="text-center">
                    <div className="flex gap-1 justify-center flex-wrap">
                      {c.hc_uc ? <Badge variant="secondary">บัตรทอง</Badge> : null}
                      {c.hc_gov ? <Badge variant="secondary">ข้าราชการ</Badge> : null}
                      {c.hc_sso ? <Badge variant="secondary">ประกันสังคม</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {c.is_alert ? <AlertTriangle className="size-4 text-destructive mx-auto" /> : null}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1.5 justify-center">
                      <Button className="w-16" size="icon-lg" variant="warm" onClick={() => openEdit(c)} title="แก้ไข"><Edit /></Button>
                      <Button className="w-16" size="icon-lg" variant="destructive2" onClick={() => setDeleteTarget(c)} title="ลบ"><Trash2 /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 h-12 border-t border-border flex items-center justify-center shrink-0">
            <Pagination page={page} totalPages={totalPages} onPageChange={load} />
          </div>
        )}
      </div>

      {/* Customer dialog */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent size="xl" onClose={() => setDialog(false)}>
          <DialogHeader>
            <DialogTitle>{editing ? `แก้ไข: ${editing.full_name}` : 'เพิ่มลูกค้าใหม่'}</DialogTitle>
            <DialogDescription>ข้อมูลลูกค้า สิทธิ์การรักษา และประวัติการแพ้ยา</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4" onKeyDown={submitOnEnter(handleSave)}>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>ชื่อ-นามสกุล <span className="text-destructive">*</span></Label>
                <Input value={form.full_name ?? ''} onChange={e => setF('full_name', e.target.value)} autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label>เลขบัตรประชาชน</Label>
                <Input value={form.id_card ?? ''} onChange={e => setF('id_card', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>HN</Label>
                <Input value={form.hn ?? ''} onChange={e => setF('hn', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>วันเกิด</Label>
                <Input type="date" value={form.dob ?? ''} onChange={e => setF('dob', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>โทรศัพท์</Label>
                <Input value={form.phone ?? ''} onChange={e => setF('phone', e.target.value)} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>ที่อยู่</Label>
                <Input value={form.address ?? ''} onChange={e => setF('address', e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>สิทธิ์การรักษา</Label>
              <div className="flex gap-4">
                <Toggle size="lg" checked={!!form.hc_uc} onChange={v => setF('hc_uc', v ? 1 : 0)} label="บัตรทอง (UC)" />
                <Toggle size="lg" checked={!!form.hc_gov} onChange={v => setF('hc_gov', v ? 1 : 0)} label="ข้าราชการ" />
                <Toggle size="lg" checked={!!form.hc_sso} onChange={v => setF('hc_sso', v ? 1 : 0)} label="ประกันสังคม" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>แพ้อาหาร</Label>
                <Input value={form.food_allergy ?? ''} onChange={e => setF('food_allergy', e.target.value)} placeholder="ระบุชื่ออาหาร" />
              </div>
              <div className="space-y-1.5">
                <Label>แพ้สิ่งอื่นๆ</Label>
                <Input value={form.other_allergy ?? ''} onChange={e => setF('other_allergy', e.target.value)} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>โรคประจำตัว</Label>
                <Input value={form.chronic_diseases ?? ''} onChange={e => setF('chronic_diseases', e.target.value)} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Switch size="lg" checked={!!form.is_alert} onCheckedChange={v => setF('is_alert', v ? 1 : 0)} />
                <Label>แสดงการแจ้งเตือนเมื่อใช้งาน</Label>
              </div>
              {!!form.is_alert && (
                <div className="space-y-3 pl-4 border-l-2 border-destructive/30">
                  <div className="space-y-1.5">
                    <Label>ข้อความแจ้งเตือน</Label>
                    <Input value={form.alert_note ?? ''} onChange={e => setF('alert_note', e.target.value)} placeholder="แสดงระหว่างขาย" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>หมายเหตุเพิ่มเติม</Label>
                    <Input value={form.warning_note ?? ''} onChange={e => setF('warning_note', e.target.value)} />
                  </div>
                </div>
              )}
            </div>

            {/* Drug allergies (readonly) */}
            {editing && (editing as any).allergies?.length > 0 && (
              <div className="space-y-1.5">
                <Label>ประวัติแพ้ยา</Label>
                <div className="space-y-1.5">
                  {((editing as any).allergies as DrugAllergy[]).map(a => (
                    <div key={a.id} className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 text-sm">
                      <Badge variant={SEVERITY_VARIANTS[a.severity ?? 'moderate'] ?? 'secondary'} className="shrink-0">
                        {SEVERITY_LABELS[a.severity ?? 'moderate']}
                      </Badge>
                      <span className="font-medium">{a.generic_name ?? a.drug_name_free ?? '—'}</span>
                      {a.reaction && <span className="text-muted-foreground">→ {a.reaction}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="destructive2" size="xl" onClick={() => setDialog(false)}>ยกเลิก</Button>
            <Button size="xl" onClick={handleSave} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={open => { if (!open) setDeleteTarget(null) }}
        title="ลบลูกค้า"
        description={`ต้องการลบ "${deleteTarget?.full_name}" ออกจากระบบ?`}
        confirmLabel="ลบ"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}

// ========================
// SUPPLIERS TAB
// ========================
function SuppliersTab() {
  const { toast } = useToast()
  const [rows, setRows] = useState<Supplier[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [dialog, setDialog] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null)

  const limit = 50
  const totalPages = Math.ceil(total / limit)

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const res = await window.api.people.listSuppliers({ q: q.trim() || undefined, page: p }) as any
      setRows(res.rows); setTotal(res.total); setPage(p)
    } finally { setLoading(false) }
  }, [q])

  // Realtime search — debounce text input (also covers initial mount, q='').
  useEffect(() => {
    const t = setTimeout(() => load(1), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const openAdd = () => {
    setForm({ name: '', tax_id: '', phone: '', address: '', contact_name: '' })
    setDialog(true)
  }

  const openEdit = (s: Supplier) => {
    setForm({ id: s.id, name: s.name, tax_id: s.tax_id ?? '', phone: s.phone ?? '', address: s.address ?? '', contact_name: s.contact_name ?? '' })
    setDialog(true)
  }

  const handleSave = async () => {
    if (!form.name?.trim()) { toast({ title: 'กรุณาระบุชื่อ', variant: 'error' }); return }
    setSaving(true)
    try {
      await window.api.people.saveSupplier(form)
      toast({ title: 'บันทึกสำเร็จ', variant: 'success' })
      setDialog(false)
      load(page)
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await window.api.people.deleteSupplier(deleteTarget.id)
      toast({ title: 'ปิดใช้งานผู้จำหน่ายสำเร็จ', variant: 'success' })
      setDeleteTarget(null)
      load(page)
    } catch (e: any) {
      toast({ title: 'ดำเนินการไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    }
  }

  const setF = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex gap-2 items-center shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input value={q} onChange={e => setQ(e.target.value)}
            placeholder="ค้นหาชื่อ, รหัส, โทร..." className="h-10 pl-9 rounded-lg bg-card" />
        </div>
      </div>

      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card overflow-hidden">
        <div className="px-5 h-12 text-sm font-semibold text-muted-foreground shrink-0 flex items-center justify-between">
          <span>{loading ? 'กำลังโหลด...' : `พบ ${total.toLocaleString()} รายการ`}</span>
          <Button onClick={openAdd} className="h-9 rounded-lg px-2 text-sm">
            <Plus className="size-4" /> เพิ่มผู้จำหน่าย
          </Button>
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">รหัส</TableHead>
                <TableHead>ชื่อบริษัท</TableHead>
                <TableHead>ผู้ติดต่อ</TableHead>
                <TableHead>โทรศัพท์</TableHead>
                <TableHead>เลขผู้เสียภาษี</TableHead>
                <TableHead className="text-center w-24">สถานะ</TableHead>
                <TableHead className="text-center w-28">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-16">
                    <Building2 className="size-10 mx-auto mb-2 opacity-30" />
                    ไม่พบข้อมูลผู้จำหน่าย
                  </TableCell>
                </TableRow>
              ) : rows.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-sm text-muted-foreground">{s.code}</TableCell>
                  <TableCell className="font-medium text-sm">{s.name}</TableCell>
                  <TableCell className="text-sm">{s.contact_name ?? '—'}</TableCell>
                  <TableCell className="text-sm">{s.phone ?? '—'}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">{s.tax_id ?? '—'}</TableCell>
                  <TableCell className="text-center">
                    {s.is_disabled
                      ? <Badge variant="secondary">ปิดใช้งาน</Badge>
                      : <Badge variant="success">ใช้งาน</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1.5 justify-center">
                      <Button className="w-16" size="icon-lg" variant="warm" onClick={() => openEdit(s)} title="แก้ไข"><Edit /></Button>
                      <Button className="w-16" size="icon-lg" variant="destructive2" onClick={() => setDeleteTarget(s)} title="ปิดใช้งาน"><Trash2 /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 h-12 border-t border-border flex items-center justify-center shrink-0">
            <Pagination page={page} totalPages={totalPages} onPageChange={load} />
          </div>
        )}
      </div>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent size="md" onClose={() => setDialog(false)}>
          <DialogHeader>
            <DialogTitle>{form.id ? 'แก้ไขผู้จำหน่าย' : 'เพิ่มผู้จำหน่าย'}</DialogTitle>
            <DialogDescription>ข้อมูลบริษัท / ร้านค้าผู้จัดจำหน่าย</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3" onKeyDown={submitOnEnter(handleSave)}>
            <div className="space-y-1.5">
              <Label>ชื่อบริษัท / ร้านค้า <span className="text-destructive">*</span></Label>
              <Input value={form.name ?? ''} onChange={e => setF('name', e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>ผู้ติดต่อ</Label>
              <Input value={form.contact_name ?? ''} onChange={e => setF('contact_name', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>โทรศัพท์</Label>
                <Input value={form.phone ?? ''} onChange={e => setF('phone', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>เลขผู้เสียภาษี</Label>
                <Input value={form.tax_id ?? ''} onChange={e => setF('tax_id', e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>ที่อยู่</Label>
              <Textarea value={form.address ?? ''} onChange={e => setF('address', e.target.value)} rows={3} className="resize-none" />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="destructive2" size="xl" onClick={() => setDialog(false)}>ยกเลิก</Button>
            <Button size="xl" onClick={handleSave} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={open => { if (!open) setDeleteTarget(null) }}
        title="ปิดใช้งานผู้จำหน่าย"
        description={`ต้องการปิดใช้งาน "${deleteTarget?.name}"?`}
        confirmLabel="ปิดใช้งาน"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}

// ========================
// STAFF TAB
// ========================
function StaffTab() {
  const { toast } = useToast()
  const [rows, setRows] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [dialog, setDialog] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await window.api.people.listStaff() as User[]
      setRows(data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const openAdd = () => {
    setForm({ name: '', email: '', password: '', role: 'staff' })
    setDialog(true)
  }

  const openEdit = (u: User) => {
    setForm({ id: u.id, name: u.name, email: u.email, password: '', role: u.role ?? 'staff' })
    setDialog(true)
  }

  const handleSave = async () => {
    if (!form.name?.trim()) { toast({ title: 'กรุณาระบุชื่อ', variant: 'error' }); return }
    if (!form.id && !form.password?.trim()) { toast({ title: 'กรุณาระบุรหัสผ่าน', variant: 'error' }); return }
    setSaving(true)
    try {
      const payload: any = { name: form.name, email: form.email, role: form.role }
      if (form.id) payload.id = form.id
      if (form.password?.trim()) payload.password = form.password
      await window.api.people.saveStaff(payload)
      toast({ title: 'บันทึกสำเร็จ', variant: 'success' })
      setDialog(false)
      load()
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await window.api.people.deleteStaff(deleteTarget.id)
      toast({ title: 'ปิดใช้งานพนักงานสำเร็จ', variant: 'success' })
      setDeleteTarget(null)
      load()
    } catch (e: any) {
      toast({ title: 'ดำเนินการไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    }
  }

  const setF = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const ROLES: Record<string, string> = { admin: 'ผู้ดูแลระบบ', pharmacist: 'เภสัชกร', staff: 'พนักงาน' }

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card overflow-hidden">
        <div className="px-5 h-12 text-sm font-semibold text-muted-foreground shrink-0 flex items-center justify-between">
          <span>{loading ? 'กำลังโหลด...' : `พบ ${rows.length.toLocaleString()} รายการ`}</span>
          <Button onClick={openAdd} className="h-9 rounded-lg px-2 text-sm">
            <Plus className="size-4" /> เพิ่มพนักงาน
          </Button>
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ชื่อ</TableHead>
                <TableHead>อีเมล</TableHead>
                <TableHead className="text-center">ตำแหน่ง</TableHead>
                <TableHead className="text-center">สถานะ</TableHead>
                <TableHead className="text-center w-28">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-16">
                    <UserCog className="size-10 mx-auto mb-2 opacity-30" />
                    ไม่พบข้อมูลพนักงาน
                  </TableCell>
                </TableRow>
              ) : rows.map(u => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium text-sm">{u.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{ROLES[u.role] ?? u.role}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {u.is_disabled
                      ? <Badge variant="secondary">ปิดใช้งาน</Badge>
                      : <Badge variant="success">ใช้งาน</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1.5 justify-center">
                      <Button className="w-16" size="icon-lg" variant="warm" onClick={() => openEdit(u)} title="แก้ไข"><Edit /></Button>
                      <Button className="w-16" size="icon-lg" variant="destructive2" onClick={() => setDeleteTarget(u)} title="ปิดใช้งาน"><Trash2 /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent size="sm" onClose={() => setDialog(false)}>
          <DialogHeader>
            <DialogTitle>{form.id ? 'แก้ไขพนักงาน' : 'เพิ่มพนักงาน'}</DialogTitle>
            <DialogDescription>บัญชีผู้ใช้และสิทธิ์การเข้าใช้งานระบบ</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3" onKeyDown={submitOnEnter(handleSave)}>
            <div className="space-y-1.5">
              <Label>ชื่อ <span className="text-destructive">*</span></Label>
              <Input value={form.name ?? ''} onChange={e => setF('name', e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>อีเมล</Label>
              <Input type="email" value={form.email ?? ''} onChange={e => setF('email', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>
                รหัสผ่าน{form.id
                  ? <span className="ml-1 font-normal text-muted-foreground">(เว้นว่างถ้าไม่เปลี่ยน)</span>
                  : <span className="text-destructive ml-0.5">*</span>}
              </Label>
              <Input type="password" value={form.password ?? ''} onChange={e => setF('password', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>ตำแหน่ง</Label>
              <Select value={form.role ?? 'staff'} onValueChange={v => setF('role', v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">ผู้ดูแลระบบ</SelectItem>
                  <SelectItem value="pharmacist">เภสัชกร</SelectItem>
                  <SelectItem value="staff">พนักงาน</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="destructive2" size="xl" onClick={() => setDialog(false)}>ยกเลิก</Button>
            <Button size="xl" onClick={handleSave} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={open => { if (!open) setDeleteTarget(null) }}
        title="ปิดใช้งานพนักงาน"
        description={`ต้องการปิดใช้งานบัญชี "${deleteTarget?.name}"?`}
        confirmLabel="ปิดใช้งาน"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}

// ========================
// MAIN PAGE
// ========================
export default function PeoplePage() {
  const [tab, setTab] = useState('customers')

  return (
    <div className="flex flex-col h-full px-8 pt-10 pb-4 gap-3">
      <PageHeader title="บุคคล" />

      <Tabs value={tab} onValueChange={setTab} className="shrink-0">
        <TabsList>
          <TabsTrigger value="customers">
            <Users className="size-4 mr-1.5" /> ลูกค้า
          </TabsTrigger>
          <TabsTrigger value="suppliers">
            <Building2 className="size-4 mr-1.5" /> ผู้จัดจำหน่าย
          </TabsTrigger>
          <TabsTrigger value="staff">
            <UserCog className="size-4 mr-1.5" /> พนักงาน
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex-1 min-h-0">
        {tab === 'customers' && <CustomersTab />}
        {tab === 'suppliers' && <SuppliersTab />}
        {tab === 'staff' && <StaffTab />}
      </div>
    </div>
  )
}
