import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { TabStrip } from '@/components/layout/TabStrip'
import { usePermission } from '@/hooks/usePermission'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input, SearchInput } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Pagination, type PageSize } from '@/components/ui/pagination'
import { useToast } from '@/components/ui/toast'
import { TintIcon } from '@/components/ui/tint-icon'
import { Toggle } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { MetricCard, type MetricTint } from '@/components/ui/card'
import { InitialAvatar } from '@/components/ui/avatar'
import { motion } from 'framer-motion'
import { usePagePrefs } from '@/hooks/usePagePrefs'
import { CustomerFormDialog } from '@/components/dialogs/CustomerFormDialog'
import type { Customer, Supplier, User } from '@/types'
import { Plus, Edit, AlertTriangle, Users, Building2, UserCog, Settings2, Filter, MoreHorizontal, Ban, Check } from 'lucide-react'

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
interface CustomersPrefs {
  pageSize: PageSize
  showDisabled: boolean
  showColPhone: boolean
  showColAlert: boolean
}
const CUSTOMERS_DEFAULTS: CustomersPrefs = {
  pageSize: 50, showDisabled: false, showColPhone: true, showColAlert: true,
}

function CustomersTab({ refreshStats, addNonce }: { refreshStats: () => void; addNonce: number }) {
  const { toast } = useToast()
  const [prefs, setPrefs] = usePagePrefs<CustomersPrefs>('people.customers', CUSTOMERS_DEFAULTS)
  const [rows, setRows] = useState<Customer[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const showDisabled = prefs.showDisabled
  // Column visibility (จัดการ + รหัส + ชื่อ + สถานะ always shown)
  const showColPhone = prefs.showColPhone
  const showColAlert = prefs.showColAlert
  const [loading, setLoading] = useState(false)

  const [dialog, setDialog] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  const pageSize = prefs.pageSize
  const setPageSize = (v: PageSize) => setPrefs({ pageSize: v })
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
    setEditingId(null)
    setDialog(true)
  }

  const openEdit = (c: Customer) => {
    setEditingId(c.id)
    setDialog(true)
  }

  const toggleDisabled = async (c: Customer) => {
    try {
      await window.api.people.setCustomerStatus(c.id, !c.is_disabled)
      toast({ title: c.is_disabled ? 'เปิดใช้งานลูกค้าแล้ว' : 'ปิดใช้งานลูกค้าแล้ว', variant: 'success' })
      load(page)
      refreshStats()
    } catch (e: any) {
      toast({ title: 'ดำเนินการไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    }
  }

  // Shell's "เพิ่มลูกค้า" button bumps addNonce → open the add dialog.
  // Skip the initial 0-value so we don't auto-open on mount.
  useEffect(() => { if (addNonce > 0) openAdd() }, [addNonce])

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* List card */}
      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card border border-border overflow-hidden">
        <div className="px-4 h-14 shrink-0 flex items-center gap-3">
          {/* Title cluster (left): icon-in-box + heading + count badge */}
          <div className="flex items-center gap-3 shrink-0">
            <TintIcon icon={Users} tint="neutral" size="sm" />
            <h3 className="text-lg font-semibold text-foreground">รายชื่อลูกค้า</h3>
            <Badge variant="neutral-outline">{total.toLocaleString()}</Badge>
          </div>

          {/* Right cluster — ml-auto on first to push right */}
          <SearchInput
            variant="elevated"
            wrapperClassName="w-72 shrink-0 ml-auto"
            className="h-9"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="ค้นหาชื่อ, โทร, รหัส..."
          />

          {/* Filter popover — usage status (show disabled) */}
          <Popover>
            <PopoverTrigger asChild>
              <Button size="lg" variant="elevated" className="h-9 w-9 p-0 shrink-0" title="ตัวกรอง">
                <Filter className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56">
              <PopoverHeader>
                <PopoverTitle>ตัวกรอง</PopoverTitle>
              </PopoverHeader>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showDisabled} onCheckedChange={v => setPrefs({ showDisabled: v === true })} />
                <span className="text-sm">แสดงที่ปิดใช้งาน</span>
              </label>
            </PopoverContent>
          </Popover>

          {/* Column settings popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button size="lg" variant="elevated" className="h-9 w-9 p-0 shrink-0" title="จัดการตาราง">
                <Settings2 className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56">
              <PopoverHeader>
                <PopoverTitle>จัดการตาราง</PopoverTitle>
              </PopoverHeader>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showColPhone} onCheckedChange={v => setPrefs({ showColPhone: v === true })} />
                <span className="text-sm">โทรศัพท์</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showColAlert} onCheckedChange={v => setPrefs({ showColAlert: v === true })} />
                <span className="text-sm">แจ้งเตือน</span>
              </label>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-24">รหัส</TableHead>
                <TableHead className="min-w-[280px]">ชื่อ-นามสกุล</TableHead>
                {showColPhone && <TableHead className="min-w-32">โทรศัพท์</TableHead>}
                {showColAlert && <TableHead className="min-w-24 text-center">แจ้งเตือน</TableHead>}
                <TableHead className="min-w-24 text-center">สถานะ</TableHead>
                <TableHead className="min-w-16 text-center">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4 + (showColPhone ? 1 : 0) + (showColAlert ? 1 : 0)} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4 + (showColPhone ? 1 : 0) + (showColAlert ? 1 : 0)} className="text-center text-muted-foreground py-16">
                    <Users className="size-10 mx-auto mb-2 opacity-30" />
                    ไม่พบข้อมูลลูกค้า
                  </TableCell>
                </TableRow>
              ) : rows.map(c => {
                return (
                <TableRow key={c.id} className="[&_td]:py-2.5 [&_td]:font-medium">
                  <TableCell className="text-sm text-muted-foreground truncate">{c.code}</TableCell>
                  <TableCell className="max-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <InitialAvatar name={c.full_name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-foreground truncate" title={c.full_name}>{c.full_name}</div>
                        {c.chronic_diseases && <div className="text-sm text-muted-foreground truncate">{c.chronic_diseases}</div>}
                      </div>
                    </div>
                  </TableCell>
                  {showColPhone && <TableCell className="text-sm truncate">{c.phone ?? '—'}</TableCell>}
                  {showColAlert && (
                    <TableCell className="text-center">
                      {c.is_alert ? <AlertTriangle className="size-4 text-destructive mx-auto" /> : null}
                    </TableCell>
                  )}
                  <TableCell className="text-center">
                    {c.is_disabled
                      ? <Badge variant="destructive-outline">ปิดใช้งาน</Badge>
                      : <Badge variant="success-outline">ใช้งาน</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button size="icon-lg" variant="elevated" title="ตัวเลือก">
                            <MoreHorizontal />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" sideOffset={4} className="w-44 p-1 gap-0">
                          <button
                            type="button"
                            onClick={() => openEdit(c)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-muted transition-colors"
                          >
                            <Edit className="size-4" /> แก้ไข
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleDisabled(c)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Ban className="size-4" /> {c.is_disabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                          </button>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </TableCell>
                </TableRow>
              )})}
            </TableBody>
          </Table>
        </div>

        <div className="px-5 h-12 bg-card border-t border-border flex items-center justify-between gap-3 text-sm shrink-0">
          {(() => {
            const size = pageSize === 'all' ? total : pageSize
            const start = total === 0 ? 0 : (page - 1) * size + 1
            const end = Math.min(page * size, total)
            return (
              <div className="flex items-center gap-2 text-muted-foreground shrink-0">
                <span>จำนวนแถว</span>
                <Select value={String(pageSize)} onValueChange={v => setPageSize(v === 'all' ? 'all' : Number(v))}>
                  <SelectTrigger variant="elevated" className="h-9 min-w-20">
                    <SelectValue>{pageSize === 'all' ? 'ทั้งหมด' : String(pageSize)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="min-w-28">
                    {[50, 100, 250, 500, 'all'].map(opt => (
                      <SelectItem key={String(opt)} value={String(opt)}>{opt === 'all' ? 'ทั้งหมด' : String(opt)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span>
                  {loading
                    ? 'กำลังโหลด...'
                    : <>แสดง <span className="font-semibold text-foreground">{start.toLocaleString()}-{end.toLocaleString()}</span></>}
                </span>
              </div>
            )
          })()}
          <Pagination page={page} totalPages={totalPages} onPageChange={p => load(p)} className="w-auto" />
        </div>
      </div>

      {/* Customer dialog (shared with POS) */}
      <CustomerFormDialog
        open={dialog}
        onOpenChange={setDialog}
        customerId={editingId}
        onSaved={() => { load(page); refreshStats() }}
      />
    </div>
  )
}

// ========================
// SUPPLIERS TAB
// ========================
interface SuppliersPrefs {
  pageSize: PageSize
  showDisabled: boolean
  showColPhone: boolean
}
const SUPPLIERS_DEFAULTS: SuppliersPrefs = {
  pageSize: 50, showDisabled: false, showColPhone: true,
}

function SuppliersTab({ refreshStats, addNonce }: { refreshStats: () => void; addNonce: number }) {
  const { toast } = useToast()
  const [prefs, setPrefs] = usePagePrefs<SuppliersPrefs>('people.suppliers', SUPPLIERS_DEFAULTS)
  const [rows, setRows] = useState<Supplier[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const showDisabled = prefs.showDisabled
  // Column visibility (รหัส + ชื่อบริษัท + สถานะ + จัดการ always shown)
  const showColPhone = prefs.showColPhone
  const [loading, setLoading] = useState(false)
  const [dialog, setDialog] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  const pageSize = prefs.pageSize
  const setPageSize = (v: PageSize) => setPrefs({ pageSize: v })
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
      refreshStats()
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setSaving(false) }
  }

  const toggleDisabled = async (s: Supplier) => {
    try {
      await window.api.people.setSupplierStatus(s.id, !s.is_disabled)
      toast({ title: s.is_disabled ? 'เปิดใช้งานผู้จำหน่ายแล้ว' : 'ปิดใช้งานผู้จำหน่ายแล้ว', variant: 'success' })
      load(page)
      refreshStats()
    } catch (e: any) {
      toast({ title: 'ดำเนินการไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    }
  }

  useEffect(() => { if (addNonce > 0) openAdd() }, [addNonce])

  const setF = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card border border-border overflow-hidden">
        <div className="px-4 h-14 shrink-0 flex items-center gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <TintIcon icon={Building2} tint="neutral" size="sm" />
            <h3 className="text-lg font-semibold text-foreground">รายชื่อผู้จำหน่าย</h3>
            <Badge variant="neutral-outline">{total.toLocaleString()}</Badge>
          </div>

          <SearchInput
            variant="elevated"
            wrapperClassName="w-72 shrink-0 ml-auto"
            className="h-9"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="ค้นหาชื่อ, รหัส, โทร..."
          />

          <Popover>
            <PopoverTrigger asChild>
              <Button size="lg" variant="elevated" className="h-9 w-9 p-0 shrink-0" title="ตัวกรอง">
                <Filter className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56">
              <PopoverHeader>
                <PopoverTitle>ตัวกรอง</PopoverTitle>
              </PopoverHeader>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showDisabled} onCheckedChange={v => setPrefs({ showDisabled: v === true })} />
                <span className="text-sm">แสดงที่ปิดใช้งาน</span>
              </label>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button size="lg" variant="elevated" className="h-9 w-9 p-0 shrink-0" title="จัดการตาราง">
                <Settings2 className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56">
              <PopoverHeader>
                <PopoverTitle>จัดการตาราง</PopoverTitle>
              </PopoverHeader>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showColPhone} onCheckedChange={v => setPrefs({ showColPhone: v === true })} />
                <span className="text-sm">โทรศัพท์</span>
              </label>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-24">รหัส</TableHead>
                <TableHead className="min-w-[320px]">ชื่อบริษัท</TableHead>
                {showColPhone && <TableHead className="min-w-32">โทรศัพท์</TableHead>}
                <TableHead className="min-w-24 text-center">สถานะ</TableHead>
                <TableHead className="min-w-16 text-center">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4 + (showColPhone ? 1 : 0)} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4 + (showColPhone ? 1 : 0)} className="text-center text-muted-foreground py-16">
                    <Building2 className="size-10 mx-auto mb-2 opacity-30" />
                    ไม่พบข้อมูลผู้จำหน่าย
                  </TableCell>
                </TableRow>
              ) : rows.map(s => {
                return (
                <TableRow key={s.id} className="[&_td]:py-2.5 [&_td]:font-medium">
                  <TableCell className="text-sm text-muted-foreground truncate">{s.code}</TableCell>
                  <TableCell className="max-w-0">
                    <div className="text-sm text-foreground truncate" title={s.name}>{s.name}</div>
                  </TableCell>
                  {showColPhone && <TableCell className="text-sm truncate">{s.phone ?? '—'}</TableCell>}
                  <TableCell className="text-center">
                    {s.is_disabled
                      ? <Badge variant="destructive-outline">ปิดใช้งาน</Badge>
                      : <Badge variant="success-outline">ใช้งาน</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button size="icon-lg" variant="elevated" title="ตัวเลือก">
                            <MoreHorizontal />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" sideOffset={4} className="w-44 p-1 gap-0">
                          <button type="button" onClick={() => openEdit(s)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-muted transition-colors">
                            <Edit className="size-4" /> แก้ไข
                          </button>
                          <button type="button" onClick={() => toggleDisabled(s)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-destructive hover:bg-destructive/10 transition-colors">
                            <Ban className="size-4" /> {s.is_disabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                          </button>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </TableCell>
                </TableRow>
              )})}
            </TableBody>
          </Table>
        </div>

        <div className="px-5 h-12 bg-card border-t border-border flex items-center justify-between gap-3 text-sm shrink-0">
          {(() => {
            const size = pageSize === 'all' ? total : pageSize
            const start = total === 0 ? 0 : (page - 1) * size + 1
            const end = Math.min(page * size, total)
            return (
              <div className="flex items-center gap-2 text-muted-foreground shrink-0">
                <span>จำนวนแถว</span>
                <Select value={String(pageSize)} onValueChange={v => setPageSize(v === 'all' ? 'all' : Number(v))}>
                  <SelectTrigger variant="elevated" className="h-9 min-w-20">
                    <SelectValue>{pageSize === 'all' ? 'ทั้งหมด' : String(pageSize)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="min-w-28">
                    {[50, 100, 250, 500, 'all'].map(opt => (
                      <SelectItem key={String(opt)} value={String(opt)}>{opt === 'all' ? 'ทั้งหมด' : String(opt)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span>
                  {loading
                    ? 'กำลังโหลด...'
                    : <>แสดง <span className="font-semibold text-foreground">{start.toLocaleString()}-{end.toLocaleString()}</span></>}
                </span>
              </div>
            )
          })()}
          <Pagination page={page} totalPages={totalPages} onPageChange={p => load(p)} className="w-auto" />
        </div>
      </div>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent size="md" divided onClose={() => setDialog(false)}>
          <DialogHeader>
            <DialogTitle>{form.id ? 'แก้ไขผู้จำหน่าย' : 'เพิ่มผู้จำหน่าย'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3" onKeyDown={submitOnEnter(handleSave)}>
            <div className="space-y-1.5">
              <Label>ชื่อบริษัท / ร้านค้า <span className="text-destructive">*</span></Label>
              <Input variant="elevated" value={form.name ?? ''} onChange={e => setF('name', e.target.value)} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>โทรศัพท์</Label>
                <Input variant="elevated" value={form.phone ?? ''} onChange={e => setF('phone', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>เลขผู้เสียภาษี</Label>
                <Input variant="elevated" value={form.tax_id ?? ''} onChange={e => setF('tax_id', e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>ที่อยู่</Label>
              <Textarea variant="elevated" value={form.address ?? ''} onChange={e => setF('address', e.target.value)} rows={3} className="resize-none" />
            </div>

            {editing && (
              <Toggle framed variant="destructive" size="lg" className="w-full justify-between"
                checked={!!form.is_disabled} onChange={v => setF('is_disabled', v ? 1 : 0)}
                label="พักการใช้งาน" />
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="elevated" size="xl" onClick={() => setDialog(false)}>ยกเลิก</Button>
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
interface StaffPrefs {
  showDisabled: boolean
  showColUsername: boolean
  showColEmail: boolean
  showColPhone: boolean
  showColRole: boolean
}
const STAFF_DEFAULTS: StaffPrefs = {
  showDisabled: false, showColUsername: true, showColEmail: true, showColPhone: false, showColRole: true,
}

function StaffTab({ refreshStats, addNonce }: { refreshStats: () => void; addNonce: number }) {
  const { toast } = useToast()
  const [prefs, setPrefs] = usePagePrefs<StaffPrefs>('people.staff', STAFF_DEFAULTS)
  const [rows, setRows] = useState<User[]>([])
  const [q, setQ] = useState('')
  const showDisabled = prefs.showDisabled
  // Column visibility (ชื่อ + สถานะ + จัดการ always shown)
  const showColUsername = prefs.showColUsername
  const showColEmail = prefs.showColEmail
  const showColPhone = prefs.showColPhone
  const showColRole = prefs.showColRole
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
    setForm({ first_name: '', last_name: '', username: '', phone: '', email: '', password: '', role: 'staff', is_disabled: 0 })
    setDialog(true)
  }

  const openEdit = (u: User) => {
    setEditing(u)
    setForm({
      id: u.id,
      first_name: u.first_name ?? '', last_name: u.last_name ?? '',
      username: u.username ?? '', phone: u.phone ?? '', email: u.email,
      password: '', role: u.role ?? 'staff', is_disabled: u.is_disabled ?? 0,
    })
    setDialog(true)
  }

  // Owner admin's username is locked server-side; reflect that in the UI.
  const isOwnerAdmin = editing?.email === 'admin@syntropic.local'

  // Auto-suggest a username from the email local-part when the field is empty.
  const suggestUsername = () => {
    if (form.username?.trim() || !form.email?.trim()) return
    const local = form.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_.]/g, '')
    if (local) setF('username', local)
  }

  const handleSave = async () => {
    if (!form.first_name?.trim()) { toast({ title: 'กรุณาระบุชื่อจริง', variant: 'error' }); return }
    if (!form.username?.trim()) { toast({ title: 'กรุณาระบุชื่อผู้ใช้ (username)', variant: 'error' }); return }
    if (!form.email?.trim()) { toast({ title: 'กรุณาระบุอีเมล', variant: 'error' }); return }
    if (!form.id && !form.password?.trim()) { toast({ title: 'กรุณาระบุรหัสผ่าน', variant: 'error' }); return }
    setSaving(true)
    try {
      const payload: any = {
        first_name: form.first_name, last_name: form.last_name ?? '',
        username: form.username, phone: form.phone ?? '', email: form.email,
        role: form.role, is_disabled: form.is_disabled ?? 0,
      }
      if (form.id) payload.id = form.id
      if (form.password?.trim()) payload.password = form.password
      await window.api.people.saveStaff(payload)
      toast({ title: 'บันทึกสำเร็จ', variant: 'success' })
      setDialog(false)
      load()
      refreshStats()
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setSaving(false) }
  }

  const toggleDisabled = async (u: User) => {
    try {
      await window.api.people.setStaffStatus(u.id, !u.is_disabled)
      toast({ title: u.is_disabled ? 'เปิดใช้งานพนักงานแล้ว' : 'ปิดใช้งานพนักงานแล้ว', variant: 'success' })
      load()
      refreshStats()
    } catch (e: any) {
      toast({ title: 'ดำเนินการไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    }
  }

  useEffect(() => { if (addNonce > 0) openAdd() }, [addNonce])

  const setF = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const ROLES: Record<string, string> = { admin: 'ผู้ดูแลระบบ', staff: 'พนักงาน' }

  // Client-side search — staff list is small, no need for round-trip per keystroke.
  const filtered = q.trim()
    ? rows.filter(u => {
        const needle = q.trim().toLowerCase()
        return u.name.toLowerCase().includes(needle)
          || u.email.toLowerCase().includes(needle)
          || (u.username ?? '').toLowerCase().includes(needle)
      })
    : rows

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card border border-border overflow-hidden">
        <div className="px-4 h-14 shrink-0 flex items-center gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <TintIcon icon={UserCog} tint="neutral" size="sm" />
            <h3 className="text-lg font-semibold text-foreground">รายชื่อพนักงาน</h3>
            <Badge variant="neutral-outline">{filtered.length.toLocaleString()}</Badge>
          </div>

          <SearchInput
            variant="elevated"
            wrapperClassName="w-72 shrink-0 ml-auto"
            className="h-9"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="ค้นหาชื่อ, อีเมล..."
          />

          <Popover>
            <PopoverTrigger asChild>
              <Button size="lg" variant="elevated" className="h-9 w-9 p-0 shrink-0" title="ตัวกรอง">
                <Filter className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56">
              <PopoverHeader>
                <PopoverTitle>ตัวกรอง</PopoverTitle>
              </PopoverHeader>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showDisabled} onCheckedChange={v => setPrefs({ showDisabled: v === true })} />
                <span className="text-sm">แสดงที่ปิดใช้งาน</span>
              </label>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button size="lg" variant="elevated" className="h-9 w-9 p-0 shrink-0" title="จัดการตาราง">
                <Settings2 className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56">
              <PopoverHeader>
                <PopoverTitle>จัดการตาราง</PopoverTitle>
              </PopoverHeader>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showColUsername} onCheckedChange={v => setPrefs({ showColUsername: v === true })} />
                <span className="text-sm">ชื่อผู้ใช้</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showColEmail} onCheckedChange={v => setPrefs({ showColEmail: v === true })} />
                <span className="text-sm">อีเมล</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showColPhone} onCheckedChange={v => setPrefs({ showColPhone: v === true })} />
                <span className="text-sm">เบอร์โทร</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showColRole} onCheckedChange={v => setPrefs({ showColRole: v === true })} />
                <span className="text-sm">ตำแหน่ง</span>
              </label>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">ชื่อ-นามสกุล</TableHead>
                {showColUsername && <TableHead className="min-w-36">ชื่อผู้ใช้</TableHead>}
                {showColEmail && <TableHead className="min-w-56">อีเมล</TableHead>}
                {showColPhone && <TableHead className="min-w-32">เบอร์โทร</TableHead>}
                {showColRole && <TableHead className="min-w-28 text-center">ตำแหน่ง</TableHead>}
                <TableHead className="min-w-24 text-center">สถานะ</TableHead>
                <TableHead className="min-w-16 text-center">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={3 + (showColUsername ? 1 : 0) + (showColEmail ? 1 : 0) + (showColPhone ? 1 : 0) + (showColRole ? 1 : 0)} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3 + (showColUsername ? 1 : 0) + (showColEmail ? 1 : 0) + (showColPhone ? 1 : 0) + (showColRole ? 1 : 0)} className="text-center text-muted-foreground py-16">
                    <UserCog className="size-10 mx-auto mb-2 opacity-30" />
                    ไม่พบข้อมูลพนักงาน
                  </TableCell>
                </TableRow>
              ) : filtered.map(u => {
                return (
                <TableRow key={u.id} className="[&_td]:py-2.5 [&_td]:font-medium">
                  <TableCell className="text-sm truncate">{u.name}</TableCell>
                  {showColUsername && <TableCell className="text-sm text-muted-foreground truncate">@{u.username}</TableCell>}
                  {showColEmail && <TableCell className="text-sm text-muted-foreground truncate">{u.email}</TableCell>}
                  {showColPhone && <TableCell className="text-sm text-muted-foreground truncate">{u.phone || '-'}</TableCell>}
                  {showColRole && (
                    <TableCell className="text-center">
                      <Badge variant="secondary">{ROLES[u.role] ?? u.role}</Badge>
                    </TableCell>
                  )}
                  <TableCell className="text-center">
                    {u.is_disabled
                      ? <Badge variant="destructive-outline">ปิดใช้งาน</Badge>
                      : <Badge variant="success-outline">ใช้งาน</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button size="icon-lg" variant="elevated" title="ตัวเลือก">
                            <MoreHorizontal />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" sideOffset={4} className="w-44 p-1 gap-0">
                          <button type="button" onClick={() => openEdit(u)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-muted transition-colors">
                            <Edit className="size-4" /> แก้ไข
                          </button>
                          <button type="button" onClick={() => toggleDisabled(u)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-destructive hover:bg-destructive/10 transition-colors">
                            <Ban className="size-4" /> {u.is_disabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                          </button>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </TableCell>
                </TableRow>
              )})}
            </TableBody>
          </Table>
        </div>

        <div className="px-5 h-12 bg-card border-t border-border flex items-center justify-end text-sm shrink-0">
          <span className="text-muted-foreground">
            {loading ? 'กำลังโหลด...' : <>แสดง <span className="font-semibold text-foreground">{filtered.length.toLocaleString()}</span> รายการ</>}
          </span>
        </div>
      </div>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent size="md" divided onClose={() => setDialog(false)}>
          <DialogHeader>
            <DialogTitle>{form.id ? 'แก้ไขพนักงาน' : 'เพิ่มพนักงาน'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4" onKeyDown={submitOnEnter(handleSave)}>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>ชื่อจริง <span className="text-destructive">*</span></Label>
                <Input variant="elevated" value={form.first_name ?? ''} onChange={e => setF('first_name', e.target.value)} autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label>นามสกุล</Label>
                <Input variant="elevated" value={form.last_name ?? ''} onChange={e => setF('last_name', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>
                  ชื่อผู้ใช้ (username) <span className="text-destructive">*</span>
                  {isOwnerAdmin && <span className="ml-1 font-normal text-muted-foreground">(ของผู้ดูแลระบบ แก้ไม่ได้)</span>}
                </Label>
                <Input variant="elevated" value={form.username ?? ''} disabled={isOwnerAdmin}
                  onChange={e => setF('username', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>อีเมล <span className="text-destructive">*</span></Label>
                <Input variant="elevated" type="email" value={form.email ?? ''}
                  onChange={e => setF('email', e.target.value)} onBlur={suggestUsername} />
              </div>
              <div className="space-y-1.5">
                <Label>เบอร์โทร</Label>
                <Input variant="elevated" value={form.phone ?? ''} onChange={e => setF('phone', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>ตำแหน่ง</Label>
                <Select value={form.role ?? 'staff'} onValueChange={v => setF('role', v)}>
                  <SelectTrigger variant="elevated" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">ผู้ดูแลระบบ</SelectItem>
                    <SelectItem value="staff">พนักงาน</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>
                  รหัสผ่าน{form.id
                    ? <span className="ml-1 font-normal text-muted-foreground">(เว้นว่างถ้าไม่เปลี่ยน)</span>
                    : <span className="text-destructive ml-0.5">*</span>}
                </Label>
                <Input variant="elevated" type="password" value={form.password ?? ''} onChange={e => setF('password', e.target.value)} />
              </div>
            </div>

            {editing && (
              <Toggle framed variant="destructive" size="lg" className="w-full justify-between"
                checked={!!form.is_disabled} onChange={v => setF('is_disabled', v ? 1 : 0)}
                label="พักการใช้งาน" />
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="elevated" size="xl" onClick={() => setDialog(false)}>ยกเลิก</Button>
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
interface PeopleStats {
  customers_active: number
  customers_disabled: number
  suppliers: number
  staff: number
}

const ADD_BUTTON: Record<string, string> = {
  customers: 'เพิ่มลูกค้า',
  suppliers: 'เพิ่มผู้จำหน่าย',
  staff:     'เพิ่มพนักงาน',
}

const VALID_TABS = ['customers', 'suppliers', 'staff'] as const

export default function PeoplePage() {
  const { isAdmin } = usePermission()
  // Deep-linkable tab via ?tab= (e.g. sidebar "แก้ไขโปรไฟล์" → /people?tab=staff).
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState(() => {
    const t = searchParams.get('tab')
    return (VALID_TABS as readonly string[]).includes(t ?? '') ? (t as string) : 'customers'
  })

  // Keep tab in sync if the ?tab= param changes while already on this page.
  useEffect(() => {
    const t = searchParams.get('tab')
    if (t && (VALID_TABS as readonly string[]).includes(t)) setTab(t)
  }, [searchParams])
  const [stats, setStats] = useState<PeopleStats>({ customers_active: 0, customers_disabled: 0, suppliers: 0, staff: 0 })
  // Trigger nonce — incremented by shell when it wants the active tab to open
  // its "add" dialog. Children watch the nonce in an effect to react.
  const [addNonce, setAddNonce] = useState(0)

  const refreshStats = useCallback(async () => {
    // listStaff is admin-only — staff users skip it (and the staff stat) so the
    // page doesn't fire a FORBIDDEN call.
    const [activeC, allC, sup, st] = await Promise.all([
      window.api.people.listCustomers({ limit: 1, includeDisabled: false }) as Promise<{ total: number }>,
      window.api.people.listCustomers({ limit: 1, includeDisabled: true })  as Promise<{ total: number }>,
      window.api.people.listSuppliers({ limit: 1, includeDisabled: true })  as Promise<{ total: number }>,
      isAdmin ? (window.api.people.listStaff({ includeDisabled: true }) as Promise<any[]>) : Promise.resolve([]),
    ])
    setStats({
      customers_active: activeC.total,
      customers_disabled: allC.total - activeC.total,
      suppliers: sup.total,
      staff: st.length,
    })
  }, [isAdmin])

  useEffect(() => { refreshStats() }, [refreshStats])

  const summary = useMemo(() => [
    { label: 'ลูกค้าที่ใช้งาน',     value: stats.customers_active.toLocaleString(),   icon: Users,     tint: 'primary'   as MetricTint, sub: 'คน',  subClassName: 'text-base text-foreground' },
    { label: 'ลูกค้าที่ปิดใช้งาน',  value: stats.customers_disabled.toLocaleString(), icon: Ban,       tint: 'destructive2' as MetricTint, sub: 'คน',  subClassName: 'text-base text-foreground' },
    { label: 'ผู้จัดจำหน่าย',      value: stats.suppliers.toLocaleString(),          icon: Building2, tint: 'info-soft' as MetricTint, sub: 'ราย', subClassName: 'text-base text-foreground' },
    ...(isAdmin ? [{ label: 'พนักงาน', value: stats.staff.toLocaleString(), icon: UserCog, tint: 'success' as MetricTint, sub: 'คน', subClassName: 'text-base text-foreground', valueClassName: 'text-foreground' }] : []),
  ], [stats, isAdmin])

  // Staff management is admin-only — kick a staff user off that tab if reached.
  useEffect(() => { if (!isAdmin && tab === 'staff') setTab('customers') }, [isAdmin, tab])

  return (
    <div className="flex flex-col h-full px-8 pt-4 pb-4 gap-2">
      <PageHeader title="บุคคล" />

      {/* Tabs + Add button (mirrors ProductsLayout: tabs left, add right). */}
      <TabStrip className="-mb-2">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList variant="segmented" className="h-10">
            <TabsTrigger value="customers"><Users /> ลูกค้า</TabsTrigger>
            <TabsTrigger value="suppliers"><Building2 /> ผู้จัดจำหน่าย</TabsTrigger>
            {isAdmin && <TabsTrigger value="staff"><UserCog /> พนักงาน</TabsTrigger>}
          </TabsList>
        </Tabs>
        <Button onClick={() => setAddNonce(n => n + 1)} className="ml-auto h-10 px-3">
          <Plus className="size-4" /> {ADD_BUTTON[tab]}
        </Button>
      </TabStrip>

      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="shrink-0 pt-3"
      >
        <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-3 p-0.5">
          {summary.map((c, i) => <MetricCard key={i} {...c} />)}
        </div>
      </motion.div>

      <div className="flex-1 min-h-0 flex flex-col">
        {tab === 'customers' && <CustomersTab refreshStats={refreshStats} addNonce={addNonce} />}
        {tab === 'suppliers' && <SuppliersTab refreshStats={refreshStats} addNonce={addNonce} />}
        {tab === 'staff' && isAdmin && <StaffTab refreshStats={refreshStats} addNonce={addNonce} />}
      </div>
    </div>
  )
}
