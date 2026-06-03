import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { SectionCard } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TintIcon } from '@/components/ui/tint-icon'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import {
  PeriodPicker, defaultPeriodFor, allowedModesFor, type PeriodMode,
} from '@/components/ui/period-picker'
import { useToast } from '@/components/ui/toast'
import { useUserStore } from '@/stores/userStore'
import { ExpenseFormDialog } from '@/components/dialogs/ExpenseFormDialog'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Expense } from '@/types'
import type { ReportsOutletContext } from './index'
import {
  ReceiptText, Wallet, ListChecks, Tag, Plus, Edit, Trash2, Layers,
} from 'lucide-react'

interface CategoryBreakdown {
  category_id: number | null
  category_name: string
  total: number
  count: number
}

interface ExpenseSummary {
  expense_total: number
  expense_count: number
  by_category: CategoryBreakdown[]
  top_category: string | null
}

const EMPTY_SUMMARY: ExpenseSummary = {
  expense_total: 0, expense_count: 0, by_category: [], top_category: null,
}

const FREE_RANGE_DAYS = 7

function inclusiveDayCount(from: string, to: string): number {
  const ms = new Date(to).getTime() - new Date(from).getTime()
  return Math.round(ms / 86_400_000) + 1
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'เงินสด', transfer: 'เงินโอน', card: 'บัตร',
}
const PAYMENT_VARIANTS: Record<string, any> = {
  cash: 'success-outline', transfer: 'info-outline', card: 'warning-outline',
}

export default function ReportsExpensesPage() {
  const { toast } = useToast()
  const { setSummary, setToolbar } = useOutletContext<ReportsOutletContext>()
  const isOwner = useUserStore(s => s.current?.role === 'admin')

  const initial = defaultPeriodFor(isOwner)
  const [mode, setMode] = useState<PeriodMode>(initial.mode)
  const [dateFrom, setDateFrom] = useState(initial.from)
  const [dateTo, setDateTo] = useState(initial.to)

  const [rows, setRows] = useState<Expense[]>([])
  const [summary, setSummaryData] = useState<ExpenseSummary>(EMPTY_SUMMARY)
  const [loading, setLoading] = useState(false)

  // Add/edit dialog
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Expense | null>(null)

  // Delete-confirm dialog
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [list, sum] = await Promise.all([
        window.api.expenses.list({ date_from: dateFrom, date_to: dateTo, pageSize: 0 }),
        window.api.expenses.summary({ date_from: dateFrom, date_to: dateTo }),
      ])
      setRows(((list as any)?.rows ?? []) as Expense[])
      setSummaryData((sum as ExpenseSummary) ?? EMPTY_SUMMARY)
    } catch (e: any) {
      toast(e?.message ?? 'โหลดข้อมูลไม่สำเร็จ', 'error')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo])

  const handlePeriodChange = useCallback((m: PeriodMode, f: string, t: string) => {
    if (m === 'custom' && !isOwner && f && t && inclusiveDayCount(f, t) > FREE_RANGE_DAYS) {
      const clampedFrom = new Date(t)
      clampedFrom.setDate(clampedFrom.getDate() - (FREE_RANGE_DAYS - 1))
      setMode('custom')
      setDateFrom(clampedFrom.toISOString().slice(0, 10))
      setDateTo(t)
      toast(`ดูข้อมูลย้อนหลังได้สูงสุด ${FREE_RANGE_DAYS} วัน — ช่วงที่กว้างกว่านี้ต้องใช้สิทธิ์เจ้าของร้าน`, 'warning')
      return
    }
    setMode(m)
    setDateFrom(f)
    setDateTo(t)
  }, [isOwner, toast])

  useEffect(() => {
    const t = setTimeout(() => { load() }, 250)
    return () => clearTimeout(t)
  }, [load])

  useEffect(() => {
    setSummary([
      { label: 'ยอดรวมรายจ่าย', value: formatCurrency(summary.expense_total), icon: Wallet, tint: 'warm' },
      { label: 'จำนวนรายการ', value: summary.expense_count.toLocaleString(), sub: 'รายการ', icon: ListChecks, tint: 'info-soft' },
      { label: 'หมวดสูงสุด', value: summary.top_category ?? '—', icon: Tag, tint: 'primary' },
    ])
  }, [summary, setSummary])

  useEffect(() => {
    return () => setSummary(null)
  }, [setSummary])

  const openAdd = () => { setEditTarget(null); setFormOpen(true) }
  const openEdit = (e: Expense) => { setEditTarget(e); setFormOpen(true) }

  useEffect(() => {
    setToolbar(
      <PeriodPicker
        mode={mode}
        from={dateFrom}
        to={dateTo}
        onChange={handlePeriodChange}
        allowedModes={allowedModesFor(isOwner)}
        align="end"
      />,
    )
    return () => setToolbar(null)
  }, [mode, dateFrom, dateTo, isOwner, handlePeriodChange, setToolbar])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await window.api.expenses.delete(deleteTarget.id)
      toast('ลบรายการสำเร็จ', 'success')
      setDeleteTarget(null)
      await load()
    } catch (e: any) {
      toast(e?.message ?? 'ลบไม่สำเร็จ', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const colSpan = 7

  return (
    <div className="flex flex-col gap-2">
      {/* ── Expenses table-card ── */}
      <div className="flex flex-col bg-card rounded-card shadow-card border border-border overflow-hidden">
        <div className="px-4 h-14 shrink-0 flex items-center gap-3">
          <TintIcon icon={ReceiptText} tint="neutral" size="sm" />
          <h3 className="text-lg font-semibold text-foreground">รายการค่าใช้จ่าย</h3>
          <Badge variant="neutral-outline">{rows.length.toLocaleString()}</Badge>
          <Button size="lg" className="ml-auto h-9 px-3" onClick={openAdd}>
            <Plus className="size-4" /> เพิ่มค่าใช้จ่าย
          </Button>
        </div>

        <div className="[&>[data-slot=table-container]]:max-h-[480px] [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-24">วันที่</TableHead>
                <TableHead className="min-w-32">เลขที่</TableHead>
                <TableHead className="min-w-32">หมวด</TableHead>
                <TableHead className="min-w-40">ผู้รับ</TableHead>
                <TableHead className="min-w-24 text-center">ช่องทาง</TableHead>
                <TableHead className="min-w-28 text-right">จำนวนเงิน</TableHead>
                <TableHead className="min-w-20 text-center">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={colSpan} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colSpan} className="text-center text-muted-foreground py-16">
                    <ReceiptText className="size-10 mx-auto mb-2 opacity-30" />
                    ไม่มีรายการค่าใช้จ่ายในช่วงเวลานี้
                  </TableCell>
                </TableRow>
              ) : rows.map(r => (
                <TableRow key={r.id} className="[&_td]:py-2.5 [&_td]:font-medium">
                  <TableCell className="whitespace-nowrap text-sm">{formatDate(r.expense_date)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.expense_no}</TableCell>
                  <TableCell className="text-sm text-foreground">{r.category_name ?? '—'}</TableCell>
                  <TableCell className="text-sm truncate">{r.vendor || '—'}</TableCell>
                  <TableCell className="text-center">
                    {r.payment_method
                      ? <Badge variant={PAYMENT_VARIANTS[r.payment_method] ?? 'neutral-outline'}>{PAYMENT_LABELS[r.payment_method] ?? r.payment_method}</Badge>
                      : <span className="text-sm text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right text-sm text-foreground">{formatCurrency(r.amount)}</TableCell>
                  <TableCell>
                    <div className="flex justify-center gap-1.5">
                      <Button size="icon-lg" variant="outline" onClick={() => openEdit(r)} title="แก้ไข">
                        <Edit />
                      </Button>
                      <Button size="icon-lg" variant="destructive2" onClick={() => setDeleteTarget(r)} title="ลบ">
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="px-5 h-12 bg-card border-t border-border flex items-center justify-between text-sm shrink-0">
          <span className="text-muted-foreground">
            {loading ? 'กำลังโหลด...' : <>แสดง <span className="font-semibold text-foreground">{rows.length.toLocaleString()}</span> รายการ</>}
          </span>
          <span className="text-muted-foreground">
            รวม <span className="font-semibold text-foreground">{formatCurrency(summary.expense_total)}</span>
          </span>
        </div>
      </div>

      {/* ── Per-category breakdown ── */}
      <SectionCard icon={Layers} title="สรุปตามหมวด" tint="warm">
        {summary.by_category.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">ไม่มีข้อมูล</div>
        ) : (
          <div className="space-y-1.5">
            {summary.by_category.map(c => (
              <div key={c.category_id ?? 'none'} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {c.category_name}
                  <span className="ml-1.5 text-foreground-subtle">· {c.count.toLocaleString()} รายการ</span>
                </span>
                <span className="text-sm font-semibold text-foreground">{formatCurrency(c.total)}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <ExpenseFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        expense={editTarget}
        onSaved={load}
      />

      {/* ── Delete-confirm dialog ── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!deleting && !o) setDeleteTarget(null) }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>ลบรายการค่าใช้จ่าย</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-muted-foreground">
              ต้องการลบรายการ{' '}
              <span className="font-semibold text-foreground">{deleteTarget?.expense_no}</span>
              {' '}จำนวน{' '}
              <span className="font-semibold text-foreground">{deleteTarget ? formatCurrency(deleteTarget.amount) : ''}</span>
              {' '}ใช่หรือไม่? การลบไม่สามารถย้อนกลับได้
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="destructive2" size="xl" onClick={() => setDeleteTarget(null)} disabled={deleting}>ยกเลิก</Button>
            <Button variant="destructive" size="xl" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'กำลังลบ...' : 'ลบรายการ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
