import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PriceInput } from '@/components/ui/price-input'
import { Badge } from '@/components/ui/badge'
import { SectionCard } from '@/components/ui/card'
import { FormField } from '@/components/ui/label'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { Tag, Info, History, RotateCcw, StickyNote } from 'lucide-react'

const Field = FormField

interface PriceLog {
  id: number
  price_type: string
  old_price: number
  new_price: number
  note: string | null
  created_at: string
}

const PRICE_TYPE_META: Record<string, { label: string; variant: 'success' | 'info-soft' | 'warm' }> = {
  retail:     { label: 'ราคาปลีก',  variant: 'success' },
  wholesale1: { label: 'ราคาส่ง 1', variant: 'info-soft' },
  wholesale2: { label: 'ราคาส่ง 2', variant: 'warm' },
}

interface Props {
  form: any
  setF: (key: string, value: any) => void
  errors: Set<string>
  productId: number
  isNew: boolean
  /** weighted-avg cost (products.cost_price) — informational only, 0 when new */
  avgCost: number
  baseUnit: string
  /** Changes whenever the product is re-fetched (e.g. after save) → reload history. */
  reloadToken: string | number
}

export function PriceTab({
  form, setF, errors, productId, isNew, avgCost, baseUnit, reloadToken,
}: Props) {
  const { toast } = useToast()
  const [history, setHistory] = useState<PriceLog[] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  const loadHistory = () => {
    if (isNew || !productId) { setHistory([]); return }
    setHistoryLoading(true)
    window.api.products.priceHistory(productId, 50)
      .then((rows: any) => setHistory(rows as PriceLog[]))
      .catch(err => {
        console.error('[priceHistory] failed:', err)
        toast({ title: 'โหลดประวัติราคาไม่สำเร็จ', description: err?.message ?? String(err), variant: 'error' })
        setHistory([])
      })
      .finally(() => setHistoryLoading(false))
  }

  // Load on mount + whenever the product is re-fetched (reloadToken changes
  // after a save, so a freshly-logged price change shows immediately).
  useEffect(loadHistory, [productId, isNew, reloadToken]) // eslint-disable-line react-hooks/exhaustive-deps

  // Profit is computed against the last cost paid (form.cost_price), matching
  // the page-header MetricCard logic — avoids underpricing when cost has risen.
  // The weighted-avg cost (avgCost) is shown as an informational line only.
  const cost = parseFloat(form.cost_price) || 0
  const calc = (price: number) => {
    const profit = price - cost
    const pct = cost > 0 ? (profit / cost) * 100 : 0
    return { profit, pct, pos: profit >= 0, dim: price <= 0 || cost <= 0 }
  }
  const retail = calc(parseFloat(form.price_retail) || 0)
  const ws1 = calc(parseFloat(form.price_wholesale1) || 0)
  const ws2 = calc(parseFloat(form.price_wholesale2) || 0)

  const unitSuffix = (u: string) => <span className="font-normal normal-case text-muted-foreground"> ({u})</span>

  const profitBox = (d: ReturnType<typeof calc>) => {
    const labelCls = `text-sm ${d.dim ? 'text-foreground-subtle' : 'text-muted-foreground'}`
    const valCls = `text-sm font-bold ${d.pos ? 'text-success' : 'text-destructive'}`
    const dash = <span className="text-sm text-foreground-subtle">—</span>
    return (
      <div className="rounded-lg bg-success-soft/50 px-3 py-2 space-y-1">
        <div className="flex items-center justify-between">
          <span className={labelCls}>กำไร ({baseUnit})</span>
          {d.dim ? dash : <span className={valCls}>{d.pos ? '+' : ''}{d.profit.toFixed(2)}</span>}
        </div>
        <div className="flex items-center justify-between">
          <span className={labelCls}>กำไร (%)</span>
          {d.dim ? dash : <span className={valCls}>{d.pos ? '+' : ''}{d.pct.toFixed(0)}%</span>}
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4 pt-4 items-start">

      {/* ── LEFT: ราคาขายปลีก & ต้นทุน + ราคาขายส่ง ── */}
      <div className="space-y-4">

        {/* Card 1: ต้นทุน + ราคาขายปลีก */}
        <SectionCard icon={Tag} title="ราคาขายปลีก & ต้นทุน" tint="success">
          <div className="grid grid-cols-2 gap-3">

            {/* LEFT: ราคาทุนล่าสุด + ราคาทุนเฉลี่ย */}
            <div className="space-y-3">
              <Field label={<>ราคาทุนล่าสุด{unitSuffix(baseUnit)}</>} labelClassName="text-right">
                <PriceInput
                  variant="elevated"
                  value={form.cost_price}
                  onChange={v => setF('cost_price', v)}
                  placeholder="ทุนล่าสุดที่ซื้อ"
                />
              </Field>
              <div className="rounded-lg bg-warm/50 px-3 py-2 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">ทุนเฉลี่ย ({baseUnit})</span>
                {avgCost > 0
                  ? <span className="text-sm font-bold text-warm-foreground">{formatCurrency(avgCost)}</span>
                  : <span className="text-sm text-foreground-subtle">—</span>}
              </div>
            </div>

            {/* RIGHT: ราคาขายปลีก + กล่องกำไร */}
            <div className="space-y-3">
              <div data-field="price_retail">
                <Field label={<>ราคาขายปลีก{unitSuffix(baseUnit)}</>} required labelClassName="text-right">
                  <PriceInput
                    variant="elevated"
                    value={form.price_retail}
                    onChange={v => setF('price_retail', v)}
                    aria-invalid={errors.has('price_retail')}
                  />
                </Field>
              </div>
              {profitBox(retail)}
            </div>

          </div>
        </SectionCard>

        {/* Card 2: นิยามต้นทุนล่าสุด / ต้นทุนเฉลี่ย */}
        <SectionCard icon={Info} title="ต้นทุน">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              <span className="font-semibold text-foreground">ต้นทุนล่าสุด</span>
              {' '}— ราคาทุนจากการรับเข้าครั้งล่าสุด แก้ไขได้ ใช้เป็นฐานคำนวณกำไรในหน้านี้
            </p>
            <p>
              <span className="font-semibold text-foreground">ต้นทุนเฉลี่ย</span>
              {' '}— ราคาทุนถ่วงน้ำหนักจากล็อตที่ยังมีสินค้าอยู่ อัพเดตอัตโนมัติเมื่อรับเข้าหรือมีการแก้ไขล็อต
            </p>
          </div>
        </SectionCard>

        {/* Card 3: ราคาขายส่ง — 2 คอลัมน์ ส่ง 1 ซ้าย / ส่ง 2 ขวา */}
        <SectionCard icon={Tag} title="ราคาขายส่ง">
          <div className="grid grid-cols-2 gap-3">
            {([
              { label: 'ราคาส่ง 1', key: 'price_wholesale1', value: form.price_wholesale1, d: ws1 },
              { label: 'ราคาส่ง 2', key: 'price_wholesale2', value: form.price_wholesale2, d: ws2 },
            ] as const).map(({ label, key, value, d }) => (
              <div key={key} className="space-y-3">
                <Field label={<>{label}{unitSuffix(baseUnit)}</>} labelClassName="text-right">
                  <PriceInput
                    variant="elevated"
                    value={value}
                    onChange={v => setF(key, v)}
                  />
                </Field>
                {profitBox(d)}
              </div>
            ))}
          </div>
        </SectionCard>

      </div>

      {/* ── RIGHT: ประวัติการเปลี่ยนราคา ── */}
      <div className="bg-card rounded-card shadow-card border border-border overflow-hidden">
        <div className="px-4 h-14 shrink-0 flex items-center gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <span className="grid place-items-center size-8 rounded-lg border border-border bg-card shadow-sm">
              <History className="size-4 text-foreground" />
            </span>
            <h3 className="text-lg font-semibold text-foreground">ประวัติการเปลี่ยนราคา</h3>
            <Badge variant="neutral-outline">{history?.length ?? 0}</Badge>
          </div>
          <Button
            size="lg"
            variant="elevated"
            className="h-9 px-2 ml-auto shrink-0"
            onClick={loadHistory}
            disabled={historyLoading || isNew}
          >
            <RotateCcw className="size-4" /> รีเฟรช
          </Button>
        </div>
        <div className="[&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-32">วันที่</TableHead>
                <TableHead className="min-w-20">ชนิดราคา</TableHead>
                <TableHead className="min-w-16">เดิม</TableHead>
                <TableHead className="min-w-16">ใหม่</TableHead>
                <TableHead className="min-w-16">หมายเหตุ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historyLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-12">กำลังโหลด...</TableCell>
                </TableRow>
              ) : !history || history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-16">
                    <History className="size-10 mx-auto mb-2 opacity-30" />
                    {isNew ? 'บันทึกสินค้าก่อนเพื่อดูประวัติราคา' : 'ยังไม่มีประวัติการเปลี่ยนราคา'}
                  </TableCell>
                </TableRow>
              ) : history.map(h => {
                const meta = PRICE_TYPE_META[h.price_type] ?? { label: h.price_type, variant: 'success' as const }
                const up = h.new_price > h.old_price
                return (
                  <TableRow key={h.id} className="[&_td]:py-2.5 [&_td]:font-medium">
                    <TableCell className="text-sm">{formatDateTime(h.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant={meta.variant} className="rounded-md">{meta.label}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatCurrency(h.old_price)}
                    </TableCell>
                    <TableCell className={`text-sm font-semibold ${up ? 'text-success' : 'text-destructive'}`}>
                      {formatCurrency(h.new_price)}
                    </TableCell>
                    <TableCell>
                      {h.note ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button size="icon-lg" variant="warm" title="ดูหมายเหตุ">
                              <StickyNote />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent side="bottom" align="end" className="w-60 max-w-[90vw]">
                            <div className="text-sm whitespace-pre-wrap break-words">{h.note}</div>
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        <div className="px-5 h-12 bg-card border-t border-border flex items-center text-sm text-muted-foreground shrink-0">
          <span>
            ราคาที่แก้จากหน้านี้หรือหน้ารับเข้าสินค้าจะถูกบันทึกไว้ที่นี่
          </span>
        </div>
      </div>

    </div>
  )
}
