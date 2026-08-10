import { useState, useEffect, useCallback, useMemo } from 'react'
import { useToast } from '@/components/ui/toast'
import { TintIcon } from '@/components/ui/tint-icon'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { MultiDatePicker, rangeForMultiMode, type MultiDateMode } from '@/components/ui/multi-date-picker'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ExpenseFormDialog } from '@/components/dialogs/ExpenseFormDialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, SortableTableHead,
} from '@/components/ui/table'
import { usePagePrefs } from '@/hooks/usePagePrefs'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Expense, ExpenseCategory } from '@/types'
import { ReceiptText, Plus, Edit, Trash2 } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────
type SortDir = 'asc' | 'desc'
type ExpenseSortField = 'expense_date' | 'expense_no' | 'category_name' | 'amount'

interface ExpensesPrefs {
  // mode persisted always (day/month/year roll on mount); from/to only used
  // when mode === 'custom'.
  dateMode: MultiDateMode
  dateFrom: string
  dateTo: string
  catFilter: string
  sort: { by: ExpenseSortField; dir: SortDir }
}

const EXPENSES_DEFAULTS: ExpensesPrefs = {
  dateMode: 'month',
  dateFrom: new Date().toISOString().slice(0, 8) + '01',
  dateTo: new Date().toISOString().slice(0, 10),
  catFilter: 'all',
  sort: { by: 'expense_date', dir: 'desc' },
}

// Generic value comparator for client-side sort. Nulls sort last; strings use
// Thai-aware localeCompare, numbers compare numerically.
function sortCmp(a: string | number | null, b: string | number | null, dir: SortDir): number {
  const mul = dir === 'asc' ? 1 : -1
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * mul
  return String(a).localeCompare(String(b), 'th') * mul
}

// ── Page ───────────────────────────────────────────────────────────────────
// ค่าใช้จ่าย register — full CRUD over window.api.expenses.* (folded out of the
// old Reports dashboard, which now only shows a read-only breakdown). Expenses
// are low-volume manual entries, so the whole date window is loaded at once and
// sorted/filtered client-side (no server pagination needed).
export default function ManageExpensesPage() {
  const { toast } = useToast()

  const [prefs, setPrefs] = usePagePrefs<ExpensesPrefs>('expenses', EXPENSES_DEFAULTS)
  const initialRange = prefs.dateMode === 'custom'
    ? { from: prefs.dateFrom, to: prefs.dateTo }
    : rangeForMultiMode(prefs.dateMode)

  const [dateMode, setDateMode] = useState<MultiDateMode>(prefs.dateMode)
  const [dateFrom, setDateFrom] = useState(initialRange.from)
  const [dateTo, setDateTo] = useState(initialRange.to)
  const [rows, setRows] = useState<Expense[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [loading, setLoading] = useState(false)

  const catFilter = prefs.catFilter
  const sort = prefs.sort
  const setCatFilter = (v: string) => setPrefs({ catFilter: v })
  const toggleSort = (f: ExpenseSortField) =>
    setPrefs({ sort: sort.by === f ? { by: f, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { by: f, dir: 'asc' } })

  // CRUD dialog state
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Expense | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Categories for the filter dropdown — static, load once.
  useEffect(() => {
    window.api.expenses.activeCategories()
      .then((data: any) => setCategories((data ?? []) as ExpenseCategory[]))
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await window.api.expenses.list({ date_from: dateFrom, date_to: dateTo, pageSize: 0 })
      setRows(((res as any)?.rows ?? []) as Expense[])
    } catch (e: any) {
      toast(e?.message ?? 'โหลดข้อมูลไม่สำเร็จ', 'error')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, toast])

  useEffect(() => {
    const tid = setTimeout(() => { load() }, 250)
    return () => clearTimeout(tid)
  }, [load])

  const filtered = useMemo(
    () => catFilter === 'all' ? rows : rows.filter(r => String(r.category_id) === catFilter),
    [rows, catFilter],
  )
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => sortCmp(a[sort.by] as any, b[sort.by] as any, sort.dir)),
    [filtered, sort],
  )
  const total = useMemo(() => filtered.reduce((s, r) => s + (r.amount ?? 0), 0), [filtered])

  // ── CRUD ───────────────────────────────────────────────────────────────
  const openAdd = () => { setEditTarget(null); setFormOpen(true) }
  const openEdit = (e: Expense) => { setEditTarget(e); setFormOpen(true) }

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

  return (
    <>
      <div className="flex flex-1 flex-col bg-card rounded-card shadow-card border border-border overflow-hidden min-h-0">
        {/* Filter strip */}
        <div className="px-4 h-12 shrink-0 flex items-center gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <TintIcon icon={ReceiptText} tint="elevated" size="sm" />
            <h3 className="text-lg font-semibold text-foreground">รายการค่าใช้จ่าย</h3>
            <Badge variant="neutral">{filtered.length.toLocaleString()}</Badge>
          </div>

          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger variant="elevated" className="h-9 w-48 ml-auto shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="w-auto min-w-56">
              <SelectItem value="all" className="whitespace-nowrap">ทุกหมวด</SelectItem>
              {categories.map(c => (
                <SelectItem key={c.id} value={String(c.id)} className="whitespace-nowrap">{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <MultiDatePicker
            mode={dateMode}
            from={dateFrom}
            to={dateTo}
            onChange={(m, from, to) => {
              setDateMode(m); setDateFrom(from); setDateTo(to)
              setPrefs({ dateMode: m, dateFrom: from, dateTo: to })
            }}
            className="shrink-0"
          />

          <Button size="lg" variant="elevated" className="h-9 px-2 shrink-0" onClick={openAdd}>
            <Plus className="size-4" /> เพิ่มค่าใช้จ่าย
          </Button>
        </div>

        {/* Table */}
        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin [&>[data-slot=table-container]]:[scrollbar-gutter:stable]">
          <Table className="table-fixed border-l-[16px] border-r-[6px] border-card">
            <TableHeader>
              <TableRow>
                <SortableTableHead field="expense_date" sort={sort} onToggle={toggleSort} className="w-[16%]">วันที่</SortableTableHead>
                <SortableTableHead field="expense_no" sort={sort} onToggle={toggleSort} className="w-[22%]">เลขที่</SortableTableHead>
                <SortableTableHead field="category_name" sort={sort} onToggle={toggleSort} className="w-[32%]">หมวด</SortableTableHead>
                <SortableTableHead field="amount" align="right" sort={sort} onToggle={toggleSort} className="w-[18%]">จำนวนเงิน</SortableTableHead>
                <TableHead className="w-[12%] text-center">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell>
                </TableRow>
              ) : sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-16">
                    <ReceiptText className="size-10 mx-auto mb-2 opacity-30" />
                    {catFilter === 'all' ? 'ไม่มีรายการค่าใช้จ่ายในช่วงเวลานี้' : 'ไม่มีรายการในหมวดที่เลือก'}
                  </TableCell>
                </TableRow>
              ) : sorted.map(r => (
                <TableRow key={r.id} className="[&_td]:py-1 [&_td]:font-medium">
                  <TableCell className="whitespace-nowrap text-sm">{formatDate(r.expense_date)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground overflow-x-clip overflow-y-visible">{r.expense_no}</TableCell>
                  <TableCell className="text-sm text-foreground overflow-x-clip overflow-y-visible">{r.category_name ?? '—'}</TableCell>
                  <TableCell className="text-right text-sm text-foreground">{formatCurrency(r.amount)}</TableCell>
                  <TableCell>
                    <div className="flex justify-center gap-1.5">
                      <Button
                        size="icon-lg"
                        variant="elevated"
                        tooltip="แก้ไข"
                        onClick={() => openEdit(r)}
                      >
                        <Edit />
                      </Button>
                      <Button
                        size="icon-lg"
                        variant="elevated-destructive-soft"
                        tooltip="ลบ"
                        onClick={() => setDeleteTarget(r)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Status footer */}
        <div className="px-5 h-12 bg-card border-t border-border flex items-center justify-between text-sm shrink-0">
          <span className="text-muted-foreground">
            {loading ? 'กำลังโหลด...' : <>แสดง <span className="font-semibold text-foreground">{filtered.length.toLocaleString()}</span> รายการ</>}
          </span>
          <span className="text-muted-foreground">
            รวม <span className="font-semibold text-foreground">{formatCurrency(total)}</span>
          </span>
        </div>
      </div>

      <ExpenseFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        expense={editTarget}
        onSaved={load}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!deleting && !o) setDeleteTarget(null) }}
        variant="destructive"
        title="ลบรายการค่าใช้จ่าย"
        content={deleteTarget && (
          <div className="space-y-3">
            <div className="rounded-xl border bg-card shadow-sm p-3 space-y-2 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground shrink-0">เลขที่</span>
                <span className="font-semibold">{deleteTarget.expense_no}</span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground shrink-0">จำนวนเงิน</span>
                <span className="font-semibold">{formatCurrency(deleteTarget.amount)}</span>
              </div>
            </div>
            <div className="rounded-xl bg-destructive-soft p-3 text-sm text-destructive-strong leading-relaxed">
              การลบไม่สามารถย้อนกลับได้
            </div>
          </div>
        )}
        confirmLabel={deleting ? 'กำลังลบ...' : 'ลบรายการ'}
        onConfirm={handleDelete}
        busy={deleting}
      />
    </>
  )
}
