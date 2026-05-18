import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PriceInput } from '@/components/ui/price-input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { SectionCard } from '@/components/ui/card'
import { FormField } from '@/components/ui/label'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { Tag, History, RotateCcw, StickyNote } from 'lucide-react'

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

  const profitText = (d: ReturnType<typeof calc>) => d.dim ? (
    <span className="text-sm text-foreground-subtle">—</span>
  ) : (
    <span className={`text-sm font-bold tabular-nums ${d.pos ? 'text-success' : 'text-destructive'}`}>
      {d.pos ? '+' : ''}{d.profit.toFixed(2)} ({d.pos ? '+' : ''}{d.pct.toFixed(0)}%)
    </span>
  )

  return (
    <div className="grid grid-cols-2 gap-4 pt-4 items-start">

      {/* ── LEFT: ราคาและต้นทุน ── */}
      <SectionCard icon={Tag} title="ราคาและต้นทุน" tint="success">
        <div className="space-y-3">

          {/* ราคาทุน (ล่าสุด) — editable pricing reference (last_cost_price) */}
          <Field label={<>ราคาทุนล่าสุด{unitSuffix(baseUnit)}</>}>
            <PriceInput
              value={form.cost_price}
              onChange={v => setF('cost_price', v)}
              placeholder="ทุนล่าสุดที่ซื้อ — ใช้อ้างอิงตั้งราคา"
            />
          </Field>

          {/* ราคาทุนเฉลี่ย (ถ่วงน้ำหนัก) — อ่านอย่างเดียว, อ้างอิงเฉยๆ */}
          <div className="rounded-lg bg-warm/50 px-3 py-2 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">ราคาทุนเฉลี่ย ({baseUnit})</span>
            {avgCost > 0
              ? <span className="text-sm font-bold text-warm-foreground tabular-nums">{formatCurrency(avgCost)}</span>
              : <span className="text-sm text-foreground-subtle">—</span>}
          </div>

          {/* ราคาขายปลีก + กล่องกำไร */}
          <div data-field="price_retail">
            <Field label={<>ราคาขายปลีก{unitSuffix(baseUnit)}</>} required>
              <PriceInput
                value={form.price_retail}
                onChange={v => setF('price_retail', v)}
                aria-invalid={errors.has('price_retail')}
              />
            </Field>
          </div>
          <div className="rounded-lg bg-success-soft/50 px-3 py-2 tabular-nums">
            <div className="flex items-center justify-between">
              <span className={`text-sm ${retail.dim ? 'text-foreground-subtle' : 'text-muted-foreground'}`}>กำไร ({baseUnit})</span>
              {profitText(retail)}
            </div>
          </div>

          {/* ราคาส่ง 1 + ราคาส่ง 2 — stack แนวตั้ง, แต่ละชุด input + กล่องกำไร */}
          {([
            { label: 'ราคาส่ง 1', key: 'price_wholesale1', value: form.price_wholesale1, d: ws1 },
            { label: 'ราคาส่ง 2', key: 'price_wholesale2', value: form.price_wholesale2, d: ws2 },
          ] as const).map(({ label, key, value, d }) => (
            <div key={key} className="space-y-3">
              <Field label={<>{label}{unitSuffix(baseUnit)}</>}>
                <PriceInput
                  value={value}
                  onChange={v => setF(key, v)}
                />
              </Field>
              <div className="rounded-lg bg-success-soft/50 px-3 py-2 tabular-nums">
                <div className="flex items-center justify-between">
                  <span className={`text-sm ${d.dim ? 'text-foreground-subtle' : 'text-muted-foreground'}`}>กำไร ({baseUnit})</span>
                  {profitText(d)}
                </div>
              </div>
            </div>
          ))}

          {/* มี VAT | นับสต็อก */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between gap-2 border border-border rounded-lg px-3 py-2">
              <div>
                <div className="text-sm font-semibold text-foreground">มี VAT</div>
                <div className="text-xs text-muted-foreground">บวก 7% เมื่อออกใบกำกับภาษี</div>
              </div>
              <Switch size="lg" checked={!!form.is_vat} onCheckedChange={v => setF('is_vat', v ? 1 : 0)} />
            </div>
            <div className="flex items-center justify-between gap-2 border border-border rounded-lg px-3 py-2">
              <div>
                <div className="text-sm font-semibold text-foreground">นับสต็อก</div>
                <div className="text-xs text-muted-foreground">ตัดสต็อกอัตโนมัติเมื่อขาย</div>
              </div>
              <Switch size="lg" checked={!!form.is_stock_item} onCheckedChange={v => setF('is_stock_item', v ? 1 : 0)} />
            </div>
          </div>

        </div>
      </SectionCard>

      {/* ── RIGHT: ประวัติการเปลี่ยนราคา ── */}
      <div className="bg-card rounded-card shadow-card overflow-hidden">
        <div className="h-12 px-5 text-sm font-semibold text-muted-foreground shrink-0 flex items-center justify-between">
          <span>
            ประวัติการเปลี่ยนราคา
            {history && history.length > 0 && (
              <> · <span className="text-foreground tabular-nums">{history.length}</span> รายการ</>
            )}
          </span>
          <Button
            size="lg"
            variant="outline"
            className="px-2"
            onClick={loadHistory}
            disabled={historyLoading || isNew}
          >
            <RotateCcw className="size-4" /> รีเฟรช
          </Button>
        </div>
        <div className="[&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-32">วันที่</TableHead>
                <TableHead className="min-w-20 text-center">ชนิดราคา</TableHead>
                <TableHead className="min-w-16 text-right">เดิม</TableHead>
                <TableHead className="min-w-16 text-right">ใหม่</TableHead>
                <TableHead className="min-w-24 text-center">หมายเหตุ</TableHead>
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
                  <TableRow key={h.id} className="hover:bg-primary-soft/60 transition-colors">
                    <TableCell className="text-sm tabular-nums">{formatDateTime(h.created_at)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={meta.variant} className="rounded-md">{meta.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                      {formatCurrency(h.old_price)}
                    </TableCell>
                    <TableCell className={`text-right text-sm font-semibold tabular-nums ${up ? 'text-success' : 'text-destructive'}`}>
                      {formatCurrency(h.new_price)}
                    </TableCell>
                    <TableCell className="text-center">
                      {h.note ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button className="w-16" size="icon-lg" variant="outline" title="ดูหมายเหตุ">
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
        <div className="h-12 px-5 border-t border-border text-sm text-muted-foreground shrink-0 flex items-center">
          <span>
            ราคาที่แก้จากหน้านี้หรือหน้ารับเข้าสินค้าจะถูกบันทึกไว้ที่นี่
          </span>
        </div>
      </div>

    </div>
  )
}
