import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { TabStrip } from '@/components/layout/TabStrip'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { MetricCard, type MetricTint } from '@/components/ui/card'
import { InitialAvatar } from '@/components/ui/avatar'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Pagination, type PageSize } from '@/components/ui/pagination'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { TintIcon } from '@/components/ui/tint-icon'
import { formatCurrency, formatDate } from '@/lib/utils'
import { printQuotation, previewQuotation } from '@/lib/receipt/print'
import { useQuotationConvert } from '@/lib/quotation/useConvert'
import type { Quotation } from '@/types'
import { FileText, Plus, MoreHorizontal, Pencil, Printer, Trash2, Send, ThumbsUp, ThumbsDown, Undo2, ShoppingCart, Play, X, FilePen, Clock, Ban } from 'lucide-react'

type StatusFilter = 'all' | 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'canceled'
const STATUS_LABEL: Record<string, string> = { draft: 'ร่าง', sent: 'รอตอบรับ', accepted: 'ยอมรับ', rejected: 'ปฏิเสธ', expired: 'พ้นกำหนด', canceled: 'ยกเลิก', converting: 'กำลังแปลง', converted: 'แปลงเป็นบิลแล้ว' }
const STATUS_VARIANT: Record<string, any> = { draft: 'neutral-outline', sent: 'info-outline', accepted: 'success-outline', rejected: 'destructive-outline', expired: 'warning-outline', canceled: 'muted-outline', converting: 'warning-outline', converted: 'violet-outline' }

// Allowed transitions mirror the IPC guard (quotation:setStatus). Cancel is
// handled separately (confirm dialog) — see CANCELABLE below.
const TRANSITIONS: Record<string, { to: string; label: string; icon: any }[]> = {
  draft: [{ to: 'sent', label: 'ทำเครื่องหมายว่าส่งแล้ว', icon: Send }],
  sent: [
    { to: 'accepted', label: 'ลูกค้ายอมรับ', icon: ThumbsUp },
    { to: 'rejected', label: 'ลูกค้าปฏิเสธ', icon: ThumbsDown },
    { to: 'draft', label: 'กลับเป็นร่าง', icon: Undo2 },
  ],
  accepted: [], rejected: [], converted: [], canceled: [],
}
// Statuses from which the document can be canceled (terminal).
const CANCELABLE = ['draft', 'sent', 'accepted']

// valid_until in the past while still draft/sent → display as expired.
const displayStatus = (q: Quotation): string =>
  (q.status === 'draft' || q.status === 'sent') && q.valid_until && q.valid_until.slice(0, 10) < new Date().toISOString().slice(0, 10)
    ? 'expired' : q.status

// Status tabs double as the list filter (replaces the old Filter popover).
const STATUS_TABS: { value: StatusFilter; label: string; icon: any }[] = [
  { value: 'all', label: 'ทั้งหมด', icon: FileText },
  { value: 'draft', label: 'ร่าง', icon: FilePen },
  { value: 'sent', label: 'รอตอบรับ', icon: Send },
  { value: 'accepted', label: 'ยอมรับ', icon: ThumbsUp },
  { value: 'rejected', label: 'ปฏิเสธ', icon: ThumbsDown },
  { value: 'expired', label: 'พ้นกำหนด', icon: Clock },
  { value: 'canceled', label: 'ยกเลิก', icon: Ban },
]

interface QuoteSummary {
  count_all: number; count_draft: number; count_sent: number; count_accepted: number
  count_rejected: number; count_expired: number; count_canceled: number
}
const EMPTY_SUMMARY: QuoteSummary = { count_all: 0, count_draft: 0, count_sent: 0, count_accepted: 0, count_rejected: 0, count_expired: 0, count_canceled: 0 }

export default function QuotationList() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const convert = useQuotationConvert()
  const today = new Date().toISOString().slice(0, 10)

  const [q, setQ] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [pageSize, setPageSize] = useState<PageSize>(50)
  const [rows, setRows] = useState<(Quotation & { customer_display?: string; item_count?: number })[]>([])
  const [summary, setSummary] = useState<QuoteSummary>(EMPTY_SUMMARY)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; quote_no: string } | null>(null)
  const [cancelTarget, setCancelTarget] = useState<{ id: number; quote_no: string } | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  const totalPages = pageSize === 'all' ? 1 : Math.ceil(total / pageSize)

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const res = await window.api.quotation.list({
        q: q.trim() || undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined,
        status_filter: statusFilter, page: p, limit: pageSize,
      }) as any
      setRows(res.rows); setSummary(res.summary ?? EMPTY_SUMMARY); setTotal(res.total); setPage(p)
    } finally { setLoading(false) }
  }, [q, dateFrom, dateTo, statusFilter, pageSize])

  useEffect(() => { const t = setTimeout(() => load(1), 300); return () => clearTimeout(t) }, [load])

  const withQuote = async (id: number, fn: (full: any) => Promise<void>) => {
    setBusyId(id)
    try {
      const full = await window.api.quotation.get(id)
      if (!full) { toast({ title: 'ไม่พบใบเสนอราคา', variant: 'error' }); return }
      await fn(full)
    } catch (e: any) {
      toast({ title: 'ดำเนินการไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setBusyId(null) }
  }

  const doPrint = (id: number) => withQuote(id, async full => {
    const res = await printQuotation(full)
    if (!res.success) toast({ title: 'พิมพ์ไม่สำเร็จ', description: res.error, variant: 'error' })
  })
  const doPreview = (id: number) => withQuote(id, async full => {
    const res = await previewQuotation(full)
    if (!res.success) toast({ title: 'สร้าง PDF ไม่สำเร็จ', description: res.error, variant: 'error' })
  })
  const changeStatus = async (id: number, to: string) => {
    try {
      await window.api.quotation.setStatus({ id, status: to })
      toast({ title: 'เปลี่ยนสถานะแล้ว', variant: 'success' })
      load(page)
    } catch (e: any) { toast({ title: 'เปลี่ยนสถานะไม่สำเร็จ', description: e?.message ?? '', variant: 'error' }) }
  }
  const cancelConversion = async (id: number) => {
    try {
      await window.api.quotation.releaseConversion(id)
      toast({ title: 'ยกเลิกการแปลงแล้ว', variant: 'success' })
      load(page)
    } catch (e: any) { toast({ title: 'ยกเลิกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' }) }
  }
  const doDelete = async () => {
    if (!deleteTarget) return
    try {
      await window.api.quotation.delete(deleteTarget.id)
      toast({ title: 'ลบใบเสนอราคาแล้ว', variant: 'success' })
      setDeleteTarget(null); load(page)
    } catch (e: any) { toast({ title: 'ลบไม่สำเร็จ', description: e?.message ?? '', variant: 'error' }); setDeleteTarget(null) }
  }
  const doCancel = async () => {
    if (!cancelTarget) return
    try {
      await window.api.quotation.setStatus({ id: cancelTarget.id, status: 'canceled' })
      toast({ title: 'ยกเลิกเอกสารแล้ว', variant: 'success' })
      setCancelTarget(null); load(page)
    } catch (e: any) { toast({ title: 'ยกเลิกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' }); setCancelTarget(null) }
  }

  const metrics = [
    { label: 'ทั้งหมด', value: summary.count_all.toLocaleString(),      icon: FileText,   tint: 'primary'      as MetricTint, sub: 'ใบ', subClassName: 'text-base text-foreground' },
    { label: 'ร่าง',    value: summary.count_draft.toLocaleString(),    icon: FilePen,    tint: 'secondary'    as MetricTint, sub: 'ใบ', subClassName: 'text-base text-foreground', valueClassName: 'text-foreground' },
    { label: 'รอตอบรับ', value: summary.count_sent.toLocaleString(),    icon: Send,       tint: 'info-soft'    as MetricTint, sub: 'ใบ', subClassName: 'text-base text-foreground' },
    { label: 'ยอมรับ',  value: summary.count_accepted.toLocaleString(), icon: ThumbsUp,   tint: 'success'      as MetricTint, sub: 'ใบ', subClassName: 'text-base text-foreground', valueClassName: 'text-foreground' },
    { label: 'ปฏิเสธ',  value: summary.count_rejected.toLocaleString(), icon: ThumbsDown, tint: 'destructive2' as MetricTint, sub: 'ใบ', subClassName: 'text-base text-foreground' },
  ]

  return (
    <div className="flex flex-col h-full px-8 pt-4 pb-4 gap-2">
      <PageHeader title="ใบเสนอราคา" />

      {/* Top row: status filter tabs (left) + create button (right) */}
      <TabStrip className="-mb-2">
        <Tabs value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
          <TabsList variant="segmented" className="h-9">
            {STATUS_TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value}><Icon /> {label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button onClick={() => navigate('/quotation/new')} className="ml-auto h-9 px-3">
          <Plus className="size-4" /> สร้างใบเสนอราคา
        </Button>
      </TabStrip>

      <div className="shrink-0 pt-3">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 p-0.5">
          {metrics.map((c, i) => <MetricCard key={i} {...c} />)}
        </div>
      </div>

      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card border border-border overflow-hidden">
        <div className="px-4 h-12 shrink-0 flex items-center gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <TintIcon icon={FileText} tint="neutral" size="sm" />
            <h3 className="text-lg font-semibold text-foreground">รายการใบเสนอราคา</h3>
            <Badge variant="neutral-outline">{total.toLocaleString()}</Badge>
          </div>
          <SearchInput variant="elevated" wrapperClassName="w-72 shrink-0 ml-auto" className="h-9" value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาเลขที่, ชื่อลูกค้า..." />
          <DateRangePicker variant="elevated" from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t) }} className="w-60 shrink-0" />
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-28">เลขที่</TableHead>
                <TableHead className="min-w-24">วันที่ออก</TableHead>
                <TableHead className="min-w-[180px]">ลูกค้า</TableHead>
                <TableHead className="min-w-24">ครบกำหนด</TableHead>
                <TableHead className="min-w-24 text-right">ยอดรวม</TableHead>
                <TableHead className="min-w-28">สถานะ</TableHead>
                <TableHead className="text-center min-w-14">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-16"><FileText className="size-10 mx-auto mb-2 opacity-30" />ไม่พบข้อมูล</TableCell></TableRow>
              ) : rows.map(qrow => {
                const st = displayStatus(qrow)
                const trans = TRANSITIONS[qrow.status] ?? []
                const name = qrow.customer_display || qrow.customer_name || null
                return (
                  <TableRow key={qrow.id} className="[&_td]:py-2.5 [&_td]:font-medium">
                    <TableCell className="text-sm text-foreground">
                      <div>{qrow.quote_no}</div>
                      <div className="text-xs font-normal text-muted-foreground">{(qrow.item_count ?? 0).toLocaleString()} รายการ</div>
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{formatDate(qrow.issue_date)}</TableCell>
                    <TableCell className="text-sm max-w-[220px]">
                      {name ? (
                        <div className="flex items-center gap-2 min-w-0"><InitialAvatar name={name} size="sm" /><span className="truncate" title={name}>{name}</span></div>
                      ) : <span className="text-foreground-subtle">—</span>}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{qrow.valid_until ? formatDate(qrow.valid_until) : '—'}</TableCell>
                    <TableCell className="text-sm text-right text-foreground">{formatCurrency(qrow.total_amount)}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[st] ?? 'secondary'}>{STATUS_LABEL[st] ?? st}</Badge>
                      {qrow.status === 'converted' && qrow.converted_invoice_no && (
                        <div className="text-xs font-normal text-muted-foreground mt-0.5">{qrow.converted_invoice_no}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button size="icon-lg" variant="elevated" title="ตัวเลือก" disabled={busyId === qrow.id}><MoreHorizontal /></Button>
                          </PopoverTrigger>
                          <PopoverContent align="end" sideOffset={4} className="w-52 p-1 gap-0">
                            <button type="button" onClick={() => navigate(`/quotation/${qrow.id}/edit`)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-muted transition-colors">
                              <Pencil className="size-4" /> {qrow.status === 'draft' ? 'แก้ไข' : 'ดูรายละเอียด'}
                            </button>
                            <button type="button" onClick={() => doPrint(qrow.id)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-muted transition-colors">
                              <Printer className="size-4" /> พิมพ์
                            </button>
                            <button type="button" onClick={() => doPreview(qrow.id)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-muted transition-colors">
                              <FileText className="size-4" /> ดูตัวอย่าง PDF
                            </button>
                            {qrow.status === 'accepted' && (
                              <button type="button" onClick={() => convert.start(qrow.id)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-primary hover:bg-primary/10 transition-colors">
                                <ShoppingCart className="size-4" /> แปลงเป็นการขาย
                              </button>
                            )}
                            {qrow.status === 'converting' && (<>
                              <button type="button" onClick={() => convert.start(qrow.id)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-primary hover:bg-primary/10 transition-colors">
                                <Play className="size-4" /> ดำเนินการขายต่อ
                              </button>
                              <button type="button" onClick={() => cancelConversion(qrow.id)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-muted transition-colors">
                                <X className="size-4" /> ยกเลิกการแปลง
                              </button>
                            </>)}
                            {trans.map(t => (
                              <button key={t.to} type="button" onClick={() => changeStatus(qrow.id, t.to)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-muted transition-colors">
                                <t.icon className="size-4" /> {t.label}
                              </button>
                            ))}
                            {CANCELABLE.includes(qrow.status) && (
                              <button type="button" onClick={() => setCancelTarget({ id: qrow.id, quote_no: qrow.quote_no })} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-destructive hover:bg-destructive/10 transition-colors">
                                <Ban className="size-4" /> ยกเลิกเอกสาร
                              </button>
                            )}
                            {qrow.status === 'draft' && (
                              <button type="button" onClick={() => setDeleteTarget({ id: qrow.id, quote_no: qrow.quote_no })} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-destructive hover:bg-destructive/10 transition-colors">
                                <Trash2 className="size-4" /> ลบ
                              </button>
                            )}
                          </PopoverContent>
                        </Popover>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        <div className="px-5 h-12 bg-card border-t border-border flex items-center justify-between gap-3 text-sm shrink-0">
          <div className="flex items-center gap-2 text-muted-foreground shrink-0">
            <span>จำนวนแถว</span>
            <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v) as PageSize)}>
              <SelectTrigger variant="elevated" className="h-9 min-w-20"><SelectValue>{String(pageSize)}</SelectValue></SelectTrigger>
              <SelectContent className="min-w-28">{[50, 100, 250, 500].map(o => <SelectItem key={o} value={String(o)}>{String(o)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={load} className="w-auto" />
        </div>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={o => { if (!o) setDeleteTarget(null) }}
        variant="destructive"
        title="ลบใบเสนอราคา?"
        description={deleteTarget?.quote_no}
        confirmLabel="ลบ"
        onConfirm={doDelete}
      />
      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={o => { if (!o) setCancelTarget(null) }}
        variant="destructive"
        title="ยกเลิกเอกสารนี้?"
        description={`${cancelTarget?.quote_no ?? ''} — ยกเลิกแล้วจะนำกลับมาใช้งานไม่ได้`}
        confirmLabel="ยกเลิกเอกสาร"
        cancelLabel="ย้อนกลับ"
        onConfirm={doCancel}
      />
      {convert.dialogs}
    </div>
  )
}
