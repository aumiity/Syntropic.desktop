import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import type { Sale, SaleItem } from '@/types'
import { Search, TrendingUp, TrendingDown, Receipt, ShoppingBag, Ban, ChevronDown } from 'lucide-react'

interface SaleSummary {
  total_subtotal: number
  total_discount: number
  total_amount: number
  total_cost: number
  total_profit: number
  sale_count: number
}

interface SaleRow extends Sale {
  customer_name?: string
}

interface SaleDetail extends Sale {
  customer_name?: string
  sold_by_name?: string
  items: (SaleItem & { item_cost: number })[]
}

const SALE_TYPE_LABELS: Record<string, string> = {
  retail: 'ปลีก', wholesale: 'ส่ง', rx: 'ใบสั่งยา', return: 'คืนสินค้า',
}
const SALE_TYPE_VARIANTS: Record<string, any> = {
  retail: 'secondary', wholesale: 'default', rx: 'success', return: 'warning',
}

function SummaryCard({ label, value, sub, icon, color = '' }: {
  label: string; value: string; sub?: string; icon: React.ReactNode; color?: string
}) {
  return (
    <div className="bg-card border border-border rounded-lg px-4 py-3 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-bold text-base leading-tight">{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
    </div>
  )
}

export default function ReportsSalesPage() {
  const { toast } = useToast()
  const today = new Date().toISOString().slice(0, 10)

  // Filters
  const [q, setQ] = useState('')
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(today)
  const [sortBy, setSortBy] = useState('sold_at')
  const [sortDir, setSortDir] = useState('DESC')

  // Data
  const [rows, setRows] = useState<SaleRow[]>([])
  const [summary, setSummary] = useState<SaleSummary | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  // Detail modal
  const [detailSale, setDetailSale] = useState<SaleDetail | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Void confirm
  const [voidTarget, setVoidTarget] = useState<SaleRow | null>(null)

  const limit = 30
  const totalPages = Math.ceil(total / limit)

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const res = await window.api.reports.salesList({
        q: q.trim() || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        sort_by: sortBy,
        sort_dir: sortDir,
        page: p,
      }) as any
      setRows(res.rows)
      setSummary(res.summary)
      setTotal(res.total)
      setPage(p)
    } finally {
      setLoading(false)
    }
  }, [q, dateFrom, dateTo, sortBy, sortDir])

  useEffect(() => { load(1) }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    load(1)
  }

  const openDetail = async (sale: SaleRow) => {
    setDetailOpen(true)
    setLoadingDetail(true)
    try {
      const data = await window.api.reports.getSale(sale.id) as SaleDetail
      setDetailSale(data)
    } finally {
      setLoadingDetail(false)
    }
  }

  const handleVoid = async (reason: string) => {
    if (!voidTarget) return
    try {
      await window.api.reports.voidSale(voidTarget.id, reason)
      toast({ title: 'ยกเลิกบิลสำเร็จ', variant: 'success' })
      setVoidTarget(null)
      // Close detail if it's the same sale
      if (detailSale?.id === voidTarget.id) setDetailOpen(false)
      load(page)
    } catch (e: any) {
      toast({ title: 'ยกเลิกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
      setVoidTarget(null)
    }
  }

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir(d => d === 'DESC' ? 'ASC' : 'DESC')
    } else {
      setSortBy(col)
      setSortDir('DESC')
    }
  }

  useEffect(() => { load(1) }, [sortBy, sortDir])

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <ChevronDown className="w-3 h-3 opacity-30 inline ml-0.5" />
    return <ChevronDown className={`w-3 h-3 inline ml-0.5 transition-transform ${sortDir === 'ASC' ? 'rotate-180' : ''}`} />
  }

  const profitColor = (profit: number) =>
    profit > 0 ? 'text-success' : profit < 0 ? 'text-destructive' : ''

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border shrink-0">
        <h1 className="text-xl font-semibold">รายงานการขาย</h1>
        <p className="text-sm text-muted-foreground">ยอดขาย ต้นทุน และกำไร</p>
      </div>

      {/* Filters */}
      <form onSubmit={handleSearch} className="px-6 py-3 border-b border-border bg-muted/30 shrink-0 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาเลขบิล, ชื่อลูกค้า..." className="pl-8" />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>ตั้งแต่</span>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36" />
          <span>ถึง</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36" />
        </div>
        <Button type="submit"><Search className="w-3.5 h-3.5 mr-1" /> ค้นหา</Button>
      </form>

      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-4 space-y-4">

          {/* Summary cards */}
          {summary && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
              <SummaryCard
                label="จำนวนบิล"
                value={summary.sale_count.toLocaleString()}
                icon={<Receipt className="w-4 h-4 text-primary" />}
                color="bg-primary-soft"
              />
              <SummaryCard
                label="ยอดขาย (ก่อนส่วนลด)"
                value={formatCurrency(summary.total_subtotal)}
                icon={<ShoppingBag className="w-4 h-4 text-primary" />}
                color="bg-primary-soft"
              />
              <SummaryCard
                label="ส่วนลดรวม"
                value={formatCurrency(summary.total_discount)}
                icon={<TrendingDown className="w-4 h-4 text-warning-strong" />}
                color="bg-warning-soft"
              />
              <SummaryCard
                label="ยอดสุทธิ"
                value={formatCurrency(summary.total_amount)}
                icon={<Receipt className="w-4 h-4 text-success" />}
                color="bg-success-soft"
              />
              <SummaryCard
                label="ต้นทุนรวม"
                value={formatCurrency(summary.total_cost)}
                icon={<TrendingDown className="w-4 h-4 text-destructive" />}
                color="bg-destructive-soft"
              />
              <SummaryCard
                label="กำไรสุทธิ"
                value={formatCurrency(summary.total_profit)}
                sub={summary.total_amount > 0 ? `${((summary.total_profit / summary.total_amount) * 100).toFixed(1)}%` : undefined}
                icon={<TrendingUp className={`w-4 h-4 ${summary.total_profit >= 0 ? 'text-success' : 'text-destructive'}`} />}
                color={summary.total_profit >= 0 ? 'bg-success-soft' : 'bg-destructive-soft'}
              />
            </div>
          )}

          {/* Table */}
          <div>
            <div className="text-xs text-muted-foreground mb-2">
              {loading ? 'กำลังโหลด...' : `${total.toLocaleString()} รายการ`}
            </div>

            <div className="border border-border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort('invoice_no')}>
                      เลขบิล <SortIcon col="invoice_no" />
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort('sold_at')}>
                      วันที่/เวลา <SortIcon col="sold_at" />
                    </TableHead>
                    <TableHead>ลูกค้า</TableHead>
                    <TableHead className="text-center">ประเภท</TableHead>
                    <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('subtotal')}>
                      ยอดก่อนลด <SortIcon col="subtotal" />
                    </TableHead>
                    <TableHead className="text-right">ส่วนลด</TableHead>
                    <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('total_amount')}>
                      ยอดสุทธิ <SortIcon col="total_amount" />
                    </TableHead>
                    <TableHead className="text-center">สถานะ</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell></TableRow>
                  ) : rows.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-16">ไม่พบข้อมูล</TableCell></TableRow>
                  ) : rows.map(s => (
                    <TableRow key={s.id} className={s.status === 'voided' ? 'opacity-50' : ''}>
                      <TableCell className="font-mono text-sm">{s.invoice_no}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{formatDateTime(s.sold_at)}</TableCell>
                      <TableCell className="text-sm max-w-[140px] truncate">
                        {s.customer_name ?? s.customer_name_free ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={SALE_TYPE_VARIANTS[s.sale_type] ?? 'secondary'} className="text-xs">
                          {SALE_TYPE_LABELS[s.sale_type] ?? s.sale_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm">{formatCurrency(s.subtotal)}</TableCell>
                      <TableCell className="text-right text-sm text-warning-strong">
                        {s.total_discount > 0 ? `-${formatCurrency(s.total_discount)}` : '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(s.total_amount)}</TableCell>
                      <TableCell className="text-center">
                        {s.status === 'voided'
                          ? <Badge variant="destructive" className="text-xs">ยกเลิก</Badge>
                          : <Badge variant="success" className="text-xs">สำเร็จ</Badge>}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => openDetail(s)}>
                            ดูรายการ
                          </Button>
                          {s.status !== 'voided' && (
                            <Button size="sm" variant="ghost" onClick={() => setVoidTarget(s)}
                              className="text-destructive hover:text-destructive" title="ยกเลิกบิล">
                              <Ban className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 && (
              <div className="mt-3 flex justify-center">
                <Pagination page={page} totalPages={totalPages} onPageChange={load} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sale detail modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent size="2xl">
          {loadingDetail || !detailSale ? (
            <>
              <DialogHeader><DialogTitle>กำลังโหลด...</DialogTitle></DialogHeader>
              <DialogBody><div className="py-8 text-center text-muted-foreground">กำลังโหลดข้อมูล...</div></DialogBody>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <span>{detailSale.invoice_no}</span>
                  {detailSale.status === 'voided'
                    ? <Badge variant="destructive">ยกเลิกแล้ว</Badge>
                    : <Badge variant="success">สำเร็จ</Badge>}
                </DialogTitle>
              </DialogHeader>
              <DialogBody className="space-y-4">
                {/* Sale header info */}
                <div className="grid grid-cols-2 gap-3 text-sm bg-muted/30 rounded-lg p-3">
                  <div><span className="text-muted-foreground">วันที่:</span> <span className="font-medium">{formatDateTime(detailSale.sold_at)}</span></div>
                  <div><span className="text-muted-foreground">พนักงาน:</span> <span className="font-medium">{detailSale.sold_by_name ?? '—'}</span></div>
                  <div><span className="text-muted-foreground">ลูกค้า:</span> <span className="font-medium">{detailSale.customer_name ?? detailSale.customer_name_free ?? 'ลูกค้าทั่วไป'}</span></div>
                  <div><span className="text-muted-foreground">ประเภทการขาย:</span> <span className="font-medium">{SALE_TYPE_LABELS[detailSale.sale_type] ?? detailSale.sale_type}</span></div>
                  {detailSale.cash_amount > 0 && <div><span className="text-muted-foreground">เงินสด:</span> <span className="font-medium">{formatCurrency(detailSale.cash_amount)}</span></div>}
                  {detailSale.card_amount > 0 && <div><span className="text-muted-foreground">บัตร:</span> <span className="font-medium">{formatCurrency(detailSale.card_amount)}</span></div>}
                  {detailSale.transfer_amount > 0 && <div><span className="text-muted-foreground">โอน:</span> <span className="font-medium">{formatCurrency(detailSale.transfer_amount)}</span></div>}
                  {detailSale.change_amount > 0 && <div><span className="text-muted-foreground">เงินทอน:</span> <span className="font-medium">{formatCurrency(detailSale.change_amount)}</span></div>}
                  {detailSale.void_reason && (
                    <div className="col-span-2 text-destructive"><span className="font-medium">เหตุผลยกเลิก:</span> {detailSale.void_reason}</div>
                  )}
                </div>

                {/* Items table */}
                <div className="border border-border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>รายการ</TableHead>
                        <TableHead className="text-center">หน่วย</TableHead>
                        <TableHead className="text-right">จำนวน</TableHead>
                        <TableHead className="text-right">ราคา/หน่วย</TableHead>
                        <TableHead className="text-right">ส่วนลด</TableHead>
                        <TableHead className="text-right">รวม</TableHead>
                        <TableHead className="text-right">ต้นทุน</TableHead>
                        <TableHead className="text-right">กำไร</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailSale.items.map(item => {
                        const profit = item.line_total - (item.item_cost ?? 0)
                        return (
                          <TableRow key={item.id} className={item.is_cancelled ? 'opacity-40 line-through' : ''}>
                            <TableCell>
                              <div className="font-medium text-sm">{item.item_name}</div>
                              {item.item_note && <div className="text-xs text-muted-foreground">{item.item_note}</div>}
                            </TableCell>
                            <TableCell className="text-center text-sm">{item.unit_name}</TableCell>
                            <TableCell className="text-right text-sm">{item.qty}</TableCell>
                            <TableCell className="text-right text-sm">{formatCurrency(item.unit_price)}</TableCell>
                            <TableCell className="text-right text-sm text-warning-strong">
                              {item.discount > 0 ? formatCurrency(item.discount) : '—'}
                            </TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(item.line_total)}</TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(item.item_cost ?? 0)}</TableCell>
                            <TableCell className={`text-right text-sm font-medium ${profitColor(profit)}`}>
                              {formatCurrency(profit)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                    <tfoot>
                      <tr className="border-t border-border bg-muted/30">
                        <td colSpan={4} className="px-4 py-2" />
                        <td className="px-4 py-2 text-right text-sm font-medium text-muted-foreground">ส่วนลด</td>
                        <td className="px-4 py-2 text-right text-sm font-medium text-warning-strong">
                          {detailSale.total_discount > 0 ? `-${formatCurrency(detailSale.total_discount)}` : '—'}
                        </td>
                        <td colSpan={2} />
                      </tr>
                      <tr className="border-t border-border bg-muted/30">
                        <td colSpan={4} className="px-4 py-2" />
                        <td className="px-4 py-2 text-right text-sm font-bold">ยอดสุทธิ</td>
                        <td className="px-4 py-2 text-right font-bold text-primary">{formatCurrency(detailSale.total_amount)}</td>
                        <td className="px-4 py-2 text-right text-sm text-muted-foreground">
                          {formatCurrency(detailSale.items.reduce((s, i) => s + (i.item_cost ?? 0), 0))}
                        </td>
                        <td className={`px-4 py-2 text-right font-bold ${profitColor(detailSale.items.reduce((s, i) => s + (i.line_total - (i.item_cost ?? 0)), 0))}`}>
                          {formatCurrency(detailSale.items.reduce((s, i) => s + (i.line_total - (i.item_cost ?? 0)), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </Table>
                </div>
              </DialogBody>
              <DialogFooter>
                {detailSale.status !== 'voided' && (
                  <Button variant="destructive" onClick={() => { setVoidTarget(detailSale as any); setDetailOpen(false) }}>
                    <Ban className="w-4 h-4 mr-1.5" /> ยกเลิกบิล
                  </Button>
                )}
                <Button variant="outline" onClick={() => setDetailOpen(false)}>ปิด</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Void confirm */}
      <ConfirmDialog
        open={!!voidTarget}
        onOpenChange={open => { if (!open) setVoidTarget(null) }}
        title="ยกเลิกบิล"
        description={`ต้องการยกเลิกบิล ${voidTarget?.invoice_no}? สต็อกจะถูกคืนกลับอัตโนมัติ`}
        confirmLabel="ยกเลิกบิล"
        variant="destructive"
        requireReason
        reasonLabel="เหตุผลการยกเลิก"
        onConfirm={reason => handleVoid(reason ?? '')}
      />
    </div>
  )
}

function profitColor(profit: number) {
  if (profit > 0) return 'text-success'
  if (profit < 0) return 'text-destructive'
  return ''
}
