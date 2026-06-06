import { useState, useEffect, useMemo, useCallback } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@/components/ui/input'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead,
} from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { usePermission } from '@/hooks/usePermission'
import { TintIcon } from '@/components/ui/tint-icon'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle } from '@/components/ui/popover'
import { formatCurrency, cn } from '@/lib/utils'
import { compareNameBuckets } from '@/lib/sortName'
import type { MetricTint } from '@/components/ui/card'
import type { ManageOutletContext } from './index'
import { PackageSearch, Box, Eye, Hourglass, Filter, Check } from 'lucide-react'

const baht = (v: number) => `฿${formatCurrency(v)}`

type Months = 1 | 3 | 6 | 12
type SortField = 'trade_name' | 'qty_on_hand' | 'cost_value' | 'avg_monthly_6m' | 'last_sold_at'
type SortDir = 'asc' | 'desc'
interface SortState { by: SortField; dir: SortDir }

interface InactiveRow {
  product_id: number
  trade_name: string
  unit_name: string | null
  qty_on_hand: number
  cost_value: number | null
  last_sold_at: string | null
  avg_monthly_6m: number
}

interface InactiveCounts { m1: number; m3: number; m6: number; m12: number }

const EMPTY_COUNTS: InactiveCounts = { m1: 0, m3: 0, m6: 0, m12: 0 }

// Severity rises with the threshold — the longer a SKU sits unsold, the louder
// its card. Four distinct tints (teal → blue → cream → red).
const THRESHOLDS: { months: Months; key: keyof InactiveCounts; tint: MetricTint }[] = [
  { months: 1,  key: 'm1',  tint: 'primary' },
  { months: 3,  key: 'm3',  tint: 'info-soft' },
  { months: 6,  key: 'm6',  tint: 'warm' },
  { months: 12, key: 'm12', tint: 'destructive' },
]

// Generic value comparator: nulls sort last, strings Thai-aware, numbers numeric.
function cmp(a: string | number | null, b: string | number | null, dir: SortDir): number {
  const mul = dir === 'asc' ? 1 : -1
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * mul
  return String(a).localeCompare(String(b), 'th') * mul
}

export default function ManageDeadStockPage() {
  const { toast } = useToast()
  const { isAdmin } = usePermission()
  const { setSummary } = useOutletContext<ManageOutletContext>()
  const navigate = useNavigate()

  const [months, setMonths] = useState<Months>(6)
  const [counts, setCounts] = useState<InactiveCounts>(EMPTY_COUNTS)
  const [rows, setRows] = useState<InactiveRow[]>([])
  const [q, setQ] = useState('')
  // Staff never see the cost column, so the default sort can't reference it.
  const [sort, setSort] = useState<SortState>(
    isAdmin ? { by: 'cost_value', dir: 'desc' } : { by: 'last_sold_at', dir: 'asc' },
  )
  const [loading, setLoading] = useState(false)

  const toggleSort = (field: SortField) =>
    setSort(s => s.by === field ? { by: field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { by: field, dir: 'asc' })

  // Threshold counts are independent of the selected window — load once.
  useEffect(() => {
    (window.api.reports as any).inactiveCounts()
      .then((c: InactiveCounts) => setCounts(c ?? EMPTY_COUNTS))
      .catch((e: any) => toast(e?.message ?? 'โหลดข้อมูลไม่สำเร็จ', 'error'))
  }, [toast])

  // Table rows follow the selected threshold (trailing window now-N → today).
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const from = dayjs().subtract(months, 'month').format('YYYY-MM-DD')
      const to = dayjs().format('YYYY-MM-DD')
      const res = await (window.api.reports as any).inactiveProducts({ date_from: from, date_to: to, limit: 500 })
      setRows(((res as any[]) ?? []) as InactiveRow[])
    } catch (e: any) {
      toast(e?.message ?? 'โหลดข้อมูลไม่สำเร็จ', 'error')
    } finally {
      setLoading(false)
    }
  }, [months, toast])

  useEffect(() => { load() }, [load])

  const filteredRows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const base = needle
      ? rows.filter(r => r.trade_name.toLowerCase().includes(needle))
      : rows
    return [...base].sort((a, b) => {
      if (sort.by === 'trade_name') {
        const c = compareNameBuckets(a.trade_name || '', b.trade_name || '')
        return sort.dir === 'asc' ? c : -c
      }
      return cmp(a[sort.by], b[sort.by], sort.dir)
    })
  }, [rows, q, sort])

  const costTotal = useMemo(
    () => filteredRows.reduce((s, r) => s + (r.cost_value ?? 0), 0),
    [filteredRows],
  )

  // Passive MetricCard snapshot of the threshold counts. The active window
  // filter lives in the filter strip's Filter popover (no onClick → ManageLayout
  // renders MetricCard instead of the clickable StatCard). Counts are nested
  // (m1 >= m3 >= m6 >= m12) by construction.
  useEffect(() => {
    setSummary(THRESHOLDS.map(t => ({
      label: `ไม่ขายเกิน ${t.months} เดือน`,
      value: counts[t.key].toLocaleString(),
      icon: Hourglass,
      tint: t.tint,
      sub: 'รายการ',
      subClassName: 'text-base text-foreground',
    })))
  }, [counts, setSummary])

  // Clear slot summary on unmount so cards don't leak into the next tab.
  useEffect(() => {
    return () => setSummary(null)
  }, [setSummary])

  // Cost column only renders for admins, so the empty/loading row spans vary.
  const colCount = isAdmin ? 6 : 5

  return (
    <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card border border-border overflow-hidden">
      <div className="px-4 h-14 shrink-0 flex items-center gap-3">
        <div className="flex items-center gap-3 shrink-0">
          <TintIcon icon={Box} tint="neutral" size="sm" />
          <h3 className="text-lg font-semibold text-foreground">สินค้าค้างสต็อก</h3>
          <Badge variant="neutral-outline">{filteredRows.length.toLocaleString()}</Badge>
        </div>

        <SearchInput
          variant="elevated"
          wrapperClassName="w-72 shrink-0 ml-auto"
          className="h-9"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="ชื่อสินค้า..."
        />

        {/* Threshold-window filter popover — was previously the clickable summary cards */}
        <Popover>
          <PopoverTrigger asChild>
            <Button size="lg" variant="elevated" className="h-9 w-9 p-0 shrink-0" title="ตัวกรองช่วงเวลา">
              <Filter className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-1 gap-0">
            <PopoverHeader className="px-2">
              <PopoverTitle>ช่วงเวลา</PopoverTitle>
            </PopoverHeader>
            {THRESHOLDS.map(t => (
              <button
                key={t.months}
                type="button"
                onClick={() => setMonths(t.months)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
                  months === t.months ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted',
                )}
              >
                <Check className={cn('size-4', months === t.months ? 'opacity-100' : 'opacity-0')} />
                <span className="flex-1 text-left">ไม่ขายเกิน {t.months} เดือน</span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead field="trade_name" sort={sort} onToggle={toggleSort} className="min-w-[260px]">สินค้า</SortableTableHead>
              <SortableTableHead field="qty_on_hand" align="right" sort={sort} onToggle={toggleSort} className="min-w-24">คงเหลือ</SortableTableHead>
              {isAdmin && (
                <SortableTableHead field="cost_value" align="right" sort={sort} onToggle={toggleSort} className="min-w-28">มูลค่าทุน</SortableTableHead>
              )}
              <SortableTableHead field="avg_monthly_6m" align="right" sort={sort} onToggle={toggleSort} className="min-w-28">เฉลี่ย 6 ด.</SortableTableHead>
              <SortableTableHead field="last_sold_at" align="right" sort={sort} onToggle={toggleSort} className="min-w-32">ขายล่าสุด</SortableTableHead>
              <TableHead className="min-w-20 text-center">จัดการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={colCount} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell>
              </TableRow>
            ) : filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colCount} className="text-center text-muted-foreground py-16">
                  <PackageSearch className="size-10 mx-auto mb-2 opacity-30" />
                  ทุกสินค้ามีการขายภายใน {months} เดือน
                </TableCell>
              </TableRow>
            ) : filteredRows.map(r => (
              <TableRow key={r.product_id} className="[&_td]:py-2.5 [&_td]:font-medium">
                <TableCell className="text-sm font-medium">{r.trade_name}</TableCell>
                <TableCell className="text-right text-sm">
                  {(r.qty_on_hand ?? 0).toLocaleString()} {r.unit_name ?? ''}
                </TableCell>
                {isAdmin && (
                  <TableCell className="text-right text-sm">{baht(r.cost_value ?? 0)}</TableCell>
                )}
                <TableCell className="text-right text-sm">
                  {r.avg_monthly_6m > 0 ? r.avg_monthly_6m.toFixed(1) : <span className="text-foreground-subtle">—</span>}
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  {r.last_sold_at ? dayjs(r.last_sold_at).format('D MMM BB') : 'ไม่เคยขาย'}
                </TableCell>
                <TableCell>
                  <div className="flex justify-center">
                    <Button size="icon-lg" variant="elevated" title="ดูรายละเอียดสินค้า"
                      onClick={() => navigate(`/products/${r.product_id}/edit`)}>
                      <Eye />
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
          {loading ? 'กำลังโหลด...' : <>แสดง <span className="font-semibold text-foreground">{filteredRows.length.toLocaleString()}</span> รายการ</>}
        </span>
        {isAdmin && (
          <span className="text-muted-foreground">
            มูลค่าทุนรวม <span className="font-semibold text-foreground">{baht(costTotal)}</span>
          </span>
        )}
      </div>
    </div>
  )
}
