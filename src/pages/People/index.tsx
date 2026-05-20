import React, { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/ui/date-input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Pagination, type PageSize } from '@/components/ui/pagination'
import { useToast } from '@/components/ui/toast'
import { Toggle } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import type { Customer, Supplier, User, DrugAllergy } from '@/types'
import { Search, Plus, Edit, AlertTriangle, Users, Building2, UserCog } from 'lucide-react'

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
  const [showDisabled, setShowDisabled] = useState(false)
  const [loading, setLoading] = useState(false)

  const [dialog, setDialog] = useState(false)
  const [editing, setEditing] = useState<(Customer & { allergies?: DrugAllergy[] }) | null>(null)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  const [pageSize, setPageSize] = useState<PageSize>(50)
  const totalPages = pageSize === 'all' ? 1 : Math.ceil(total / pageSize)

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const res = await window.api.people.listCustomers({ q: q.trim() || undefined, page: p, limit: pageSize, includeDisabled: showDisabled }) as any
      setRows(res.rows); setTotal(res.total); setPage(p)
    } finally { setLoading(false) }
  }, [q, pageSize, showDisabled])

  // Realtime search — debounce text input (also covers initial mount, q='').
  useEffect(() => {
    const t = setTimeout(() => load(1), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, pageSize, showDisabled])

  const openAdd = () => {
    setEditing(null)
    setForm({
      full_name: '', id_card: '', dob: '', phone: '', address: '',
      chronic_diseases: '',
      is_alert: 0, alert_note: '',
      is_disabled: 0,
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
      dob: data.dob ?? '',
      phone: data.phone ?? '',
      address: data.address ?? '',
      chronic_diseases: data.chronic_diseases ?? '',
      is_alert: data.is_alert ?? 0,
      alert_note: data.alert_note ?? '',
      is_disabled: data.is_disabled ?? 0,
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

  const setF = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  return (
    <div className="flex flex-col h-full gap-3">
      {/* List card */}
      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card overflow-hidden">
        <div className="px-2 h-14 shrink-0 flex items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input value={q} onChange={e => setQ(e.target.value)}
              placeholder="ค้นหาชื่อ, โทร, รหัส..." className="h-9 pl-9 rounded-lg bg-input text-sm" />
          </div>
          <Toggle className="shrink-0" framed="input" size="lg" checked={showDisabled} onChange={setShowDisabled} label="แสดงที่ปิดใช้งาน" />
          <Button onClick={openAdd} size="lg" className="px-2 shrink-0">
            <Plus className="size-4" /> เพิ่มลูกค้า
          </Button>
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[12%]">รหัส</TableHead>
                <TableHead className="w-[35%]">ชื่อ-นามสกุล</TableHead>
                <TableHead className="w-[18%]">โทรศัพท์</TableHead>
                <TableHead className="text-center w-[10%]">แจ้งเตือน</TableHead>
                <TableHead className="text-center w-[10%]">สถานะ</TableHead>
                <TableHead className="text-center w-[13%]">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-16">
                    <Users className="size-10 mx-auto mb-2 opacity-30" />
                    ไม่พบข้อมูลลูกค้า
                  </TableCell>
                </TableRow>
              ) : rows.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-sm text-muted-foreground truncate">{c.code}</TableCell>
                  <TableCell className="min-w-0">
                    <div className="font-medium text-sm text-foreground truncate">{c.full_name}</div>
                    {c.chronic_diseases && <div className="text-sm text-muted-foreground truncate">{c.chronic_diseases}</div>}
                  </TableCell>
                  <TableCell className="text-sm truncate">{c.phone ?? '—'}</TableCell>
                  <TableCell className="text-center">
                    {c.is_alert ? <AlertTriangle className="size-4 text-destructive mx-auto" /> : null}
                  </TableCell>
                  <TableCell className="text-center">
                    {c.is_disabled
                      ? <Badge variant="secondary">พักใช้งาน</Badge>
                      : <Badge variant="success">ใช้งาน</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1.5 justify-center">
                      <Button size="icon-lg" variant="outline" onClick={() => openEdit(c)} title="แก้ไข"><Edit /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="px-5 h-12 bg-card border-t border-border flex items-center justify-between gap-3 text-sm shrink-0">
          <div className="flex items-center gap-2 text-muted-foreground shrink-0">
            <span>แสดง</span>
            <Select value={String(pageSize)} onValueChange={v => setPageSize(v === 'all' ? 'all' : Number(v))}>
              <SelectTrigger className="h-9 min-w-20">
                <SelectValue>{pageSize === 'all' ? 'ทั้งหมด' : String(pageSize)}</SelectValue>
              </SelectTrigger>
              <SelectContent className="min-w-28">
                {[50, 100, 250, 500, 'all'].map(opt => (
                  <SelectItem key={String(opt)} value={String(opt)}>{opt === 'all' ? 'ทั้งหมด' : String(opt)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>รายการ</span>
          </div>
          <div className="flex-1 flex justify-center">
            <Pagination page={page} totalPages={totalPages} onPageChange={load} className="w-auto justify-center" />
          </div>
          <span className="text-muted-foreground shrink-0">
            {loading ? 'กำลังโหลด...' : <>แสดง <span className="font-semibold text-foreground tabular-nums">{total.toLocaleString()}</span> รายการ</>}
          </span>
        </div>
      </div>

      {/* Customer dialog */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent size="xl" onClose={() => setDialog(false)}>
          <DialogHeader>
            <DialogTitle>{editing ? `แก้ไข: ${editing.full_name}` : 'เพิ่มลูกค้าใหม่'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4" onKeyDown={submitOnEnter(handleSave)}>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>ชื่อ-นามสกุล <span className="text-destructive">*</span></Label>
                <Input value={form.full_name ?? ''} onChange={e => setF('full_name', e.target.value)} autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label>โทรศัพท์</Label>
                <Input value={form.phone ?? ''} onChange={e => setF('phone', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>เลขบัตรประชาชน</Label>
                <Input value={form.id_card ?? ''} onChange={e => setF('id_card', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>วันเกิด</Label>
                <DateInput value={form.dob ?? ''} onChange={iso => setF('dob', iso)} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>ที่อยู่</Label>
                <Textarea value={form.address ?? ''} onChange={e => setF('address', e.target.value)} rows={3} className="resize-none" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>โรคประจำตัว</Label>
              <Input value={form.chronic_diseases ?? ''} onChange={e => setF('chronic_diseases', e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>ข้อความแจ้งเตือน</Label>
              <Input value={form.alert_note ?? ''} onChange={e => setF('alert_note', e.target.value)}
                disabled={!form.is_alert} placeholder="เช่น แพ้ยา, แพ้อาหาร, ลดราคาพิเศษ" />
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

            <div className="flex gap-3">
              <Toggle framed size="lg" variant="warning" className="flex-1 justify-between"
                checked={!!form.is_alert} onChange={v => setF('is_alert', v ? 1 : 0)}
                label="เปิดการแจ้งเตือน" />
              {editing && (
                <Toggle framed size="lg" variant="destructive" className="flex-1 justify-between"
                  checked={!!form.is_disabled} onChange={v => setF('is_disabled', v ? 1 : 0)}
                  label="พักการใช้งาน" />
              )}
            </div>
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

// ========================
// SUPPLIERS TAB
// ========================
function SuppliersTab() {
  const { toast } = useToast()
  const [rows, setRows] = useState<Supplier[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [showDisabled, setShowDisabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [dialog, setDialog] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  const [pageSize, setPageSize] = useState<PageSize>(50)
  const totalPages = pageSize === 'all' ? 1 : Math.ceil(total / pageSize)

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const res = await window.api.people.listSuppliers({ q: q.trim() || undefined, page: p, limit: pageSize, includeDisabled: showDisabled }) as any
      setRows(res.rows); setTotal(res.total); setPage(p)
    } finally { setLoading(false) }
  }, [q, pageSize, showDisabled])

  // Realtime search — debounce text input (also covers initial mount, q='').
  useEffect(() => {
    const t = setTimeout(() => load(1), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, pageSize, showDisabled])

  const openAdd = () => {
    setEditing(null)
    setForm({ name: '', tax_id: '', phone: '', address: '', is_disabled: 0 })
    setDialog(true)
  }

  const openEdit = (s: Supplier) => {
    setEditing(s)
    setForm({ id: s.id, name: s.name, tax_id: s.tax_id ?? '', phone: s.phone ?? '', address: s.address ?? '', is_disabled: s.is_disabled ?? 0 })
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

  const setF = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card overflow-hidden">
        <div className="px-2 h-14 shrink-0 flex items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input value={q} onChange={e => setQ(e.target.value)}
              placeholder="ค้นหาชื่อ, รหัส, โทร..." className="h-9 pl-9 rounded-lg bg-input text-sm" />
          </div>
          <Toggle className="shrink-0" framed="input" size="lg" checked={showDisabled} onChange={setShowDisabled} label="แสดงที่ปิดใช้งาน" />
          <Button onClick={openAdd} size="lg" className="px-2 shrink-0">
            <Plus className="size-4" /> เพิ่มผู้จำหน่าย
          </Button>
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="text-left w-[12%]">รหัส</TableHead>
                <TableHead className="text-left w-[45%]">ชื่อบริษัท</TableHead>
                <TableHead className="text-left w-[20%]">โทรศัพท์</TableHead>
                <TableHead className="text-center w-[10%]">สถานะ</TableHead>
                <TableHead className="text-center w-[13%]">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-16">
                    <Building2 className="size-10 mx-auto mb-2 opacity-30" />
                    ไม่พบข้อมูลผู้จำหน่าย
                  </TableCell>
                </TableRow>
              ) : rows.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-sm text-muted-foreground truncate">{s.code}</TableCell>
                  <TableCell className="font-medium text-sm truncate">{s.name}</TableCell>
                  <TableCell className="text-sm truncate">{s.phone ?? '—'}</TableCell>
                  <TableCell className="text-center">
                    {s.is_disabled
                      ? <Badge variant="secondary">พักใช้งาน</Badge>
                      : <Badge variant="success">ใช้งาน</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1.5 justify-center">
                      <Button size="icon-lg" variant="outline" onClick={() => openEdit(s)} title="แก้ไข"><Edit /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="px-5 h-12 bg-card border-t border-border flex items-center justify-between gap-3 text-sm shrink-0">
          <div className="flex items-center gap-2 text-muted-foreground shrink-0">
            <span>แสดง</span>
            <Select value={String(pageSize)} onValueChange={v => setPageSize(v === 'all' ? 'all' : Number(v))}>
              <SelectTrigger className="h-9 min-w-20">
                <SelectValue>{pageSize === 'all' ? 'ทั้งหมด' : String(pageSize)}</SelectValue>
              </SelectTrigger>
              <SelectContent className="min-w-28">
                {[50, 100, 250, 500, 'all'].map(opt => (
                  <SelectItem key={String(opt)} value={String(opt)}>{opt === 'all' ? 'ทั้งหมด' : String(opt)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>รายการ</span>
          </div>
          <div className="flex-1 flex justify-center">
            <Pagination page={page} totalPages={totalPages} onPageChange={load} className="w-auto justify-center" />
          </div>
          <span className="text-muted-foreground shrink-0">
            {loading ? 'กำลังโหลด...' : <>แสดง <span className="font-semibold text-foreground tabular-nums">{total.toLocaleString()}</span> รายการ</>}
          </span>
        </div>
      </div>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent size="md" onClose={() => setDialog(false)}>
          <DialogHeader>
            <DialogTitle>{form.id ? 'แก้ไขผู้จำหน่าย' : 'เพิ่มผู้จำหน่าย'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3" onKeyDown={submitOnEnter(handleSave)}>
            <div className="space-y-1.5">
              <Label>ชื่อบริษัท / ร้านค้า <span className="text-destructive">*</span></Label>
              <Input value={form.name ?? ''} onChange={e => setF('name', e.target.value)} autoFocus />
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

            {editing && (
              <Toggle framed variant="destructive" size="lg" className="w-full justify-between"
                checked={!!form.is_disabled} onChange={v => setF('is_disabled', v ? 1 : 0)}
                label="พักการใช้งาน" />
            )}
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

// ========================
// STAFF TAB
// ========================
function StaffTab() {
  const { toast } = useToast()
  const [rows, setRows] = useState<User[]>([])
  const [q, setQ] = useState('')
  const [showDisabled, setShowDisabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [dialog, setDialog] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await window.api.people.listStaff({ includeDisabled: showDisabled }) as User[]
      setRows(data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [showDisabled])

  const openAdd = () => {
    setEditing(null)
    setForm({ name: '', email: '', password: '', role: 'staff', is_disabled: 0 })
    setDialog(true)
  }

  const openEdit = (u: User) => {
    setEditing(u)
    setForm({ id: u.id, name: u.name, email: u.email, password: '', role: u.role ?? 'staff', is_disabled: u.is_disabled ?? 0 })
    setDialog(true)
  }

  const handleSave = async () => {
    if (!form.name?.trim()) { toast({ title: 'กรุณาระบุชื่อ', variant: 'error' }); return }
    if (!form.id && !form.password?.trim()) { toast({ title: 'กรุณาระบุรหัสผ่าน', variant: 'error' }); return }
    setSaving(true)
    try {
      const payload: any = { name: form.name, email: form.email, role: form.role, is_disabled: form.is_disabled ?? 0 }
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

  const setF = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const ROLES: Record<string, string> = { admin: 'ผู้ดูแลระบบ', pharmacist: 'เภสัชกร', staff: 'พนักงาน' }

  // Client-side search — staff list is small, no need for round-trip per keystroke.
  const filtered = q.trim()
    ? rows.filter(u => {
        const needle = q.trim().toLowerCase()
        return u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle)
      })
    : rows

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card overflow-hidden">
        <div className="px-2 h-14 shrink-0 flex items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input value={q} onChange={e => setQ(e.target.value)}
              placeholder="ค้นหาชื่อ, อีเมล..." className="h-9 pl-9 rounded-lg bg-input text-sm" />
          </div>
          <Toggle className="shrink-0" framed="input" size="lg" checked={showDisabled} onChange={setShowDisabled} label="แสดงที่ปิดใช้งาน" />
          <Button onClick={openAdd} size="lg" className="px-2 shrink-0">
            <Plus className="size-4" /> เพิ่มพนักงาน
          </Button>
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[30%]">ชื่อ</TableHead>
                <TableHead className="w-[35%]">อีเมล</TableHead>
                <TableHead className="text-center w-[15%]">ตำแหน่ง</TableHead>
                <TableHead className="text-center w-[10%]">สถานะ</TableHead>
                <TableHead className="text-center w-[13%]">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-16">
                    <UserCog className="size-10 mx-auto mb-2 opacity-30" />
                    ไม่พบข้อมูลพนักงาน
                  </TableCell>
                </TableRow>
              ) : filtered.map(u => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium text-sm truncate">{u.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground truncate">{u.email}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{ROLES[u.role] ?? u.role}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {u.is_disabled
                      ? <Badge variant="secondary">พักใช้งาน</Badge>
                      : <Badge variant="success">ใช้งาน</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1.5 justify-center">
                      <Button size="icon-lg" variant="outline" onClick={() => openEdit(u)} title="แก้ไข"><Edit /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="px-5 h-12 bg-card border-t border-border flex items-center justify-end text-sm shrink-0">
          <span className="text-muted-foreground">
            {loading ? 'กำลังโหลด...' : <>แสดง <span className="font-semibold text-foreground tabular-nums">{filtered.length.toLocaleString()}</span> รายการ</>}
          </span>
        </div>
      </div>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent size="md" onClose={() => setDialog(false)}>
          <DialogHeader>
            <DialogTitle>{form.id ? 'แก้ไขพนักงาน' : 'เพิ่มพนักงาน'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4" onKeyDown={submitOnEnter(handleSave)}>
            <div className="grid grid-cols-2 gap-4">
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
            </div>

            {editing && (
              <Toggle framed variant="destructive" size="lg" className="w-full justify-between"
                checked={!!form.is_disabled} onChange={v => setF('is_disabled', v ? 1 : 0)}
                label="พักการใช้งาน" />
            )}
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
