import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { PriceInput } from '@/components/ui/price-input'
import { Badge } from '@/components/ui/badge'
import { FormField } from '@/components/ui/label'
import { SectionCard } from '@/components/ui/card'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { Tag, Info, History, RotateCcw, StickyNote } from 'lucide-react'
import type { FullProduct } from '../EditProduct/shared'

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
  setF: (key: string, v: any) => void
  // null in new-mode (no DB row yet) — cost is then unknown until save (and
  // recomputeBundleCost runs server-side).
  product: FullProduct | null
  productId: number
  isNew: boolean
  /** Changes whenever the product is re-fetched (e.g. after save) → reload history. */
  reloadToken: string | number
}

// Bundle pricing — manual retail/wholesale, auto cost.
// cost_price is computed by recomputeBundleCost on every saveBundleItems and
// every component-cost change (via propagateCostToBundles in pricing.ts), so
// it's read-only here. The displayed value comes from product.cost_price
// (post-refresh), not form state — keeps the cost in sync without an edit.
// Layout mirrors EditProduct/PriceTab so both pricing screens read the same.
export function PriceTab({ form, setF, product, productId, isNew, reloadToken }: Props) {
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

  const cost = Number(product?.cost_price) || 0

  // Markup-style %: profit / cost. Same shape as EditProduct/PriceTab so the
  // profit box reads identically across products and bundles.
  const calc = (price: number) => {
    const profit = price - cost
    const pct = cost > 0 ? (profit / cost) * 100 : 0
    return { profit, pct, pos: profit >= 0, dim: price <= 0 || cost <= 0 }
  }
  const retail = calc(parseFloat(form.price_retail) || 0)
  const ws1 = calc(parseFloat(form.price_wholesale1) || 0)
  const ws2 = calc(parseFloat(form.price_wholesale2) || 0)

  const profitBox = (d: ReturnType<typeof calc>) => {
    const labelCls = `text-sm ${d.dim ? 'text-foreground-subtle' : 'text-muted-foreground'}`
    const valCls = `text-sm font-bold ${d.pos ? 'text-success' : 'text-destructive'}`
    const dash = <span className="text-sm text-foreground-subtle">—</span>
    return (
      <div className="rounded-lg bg-success-soft/50 px-3 py-2 space-y-1">
        <div className="flex items-center justify-between">
          <span className={labelCls}>กำไรต่อชุด</span>
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

        {/* Card 1: ต้นทุนรวม + ราคาขายปลีก */}
        <SectionCard icon={Tag} title="ราคาขายปลีก & ต้นทุน" tint="success">
          <div className="grid grid-cols-2 gap-3">

            {/* LEFT: ต้นทุนรวม (อ่านอย่างเดียว) — input หลอกๆ ด้านบนเพื่อจัดบรรทัดให้ตรงกับ ราคาขายปลีก ฝั่งขวา */}
            <div className="space-y-3">
              <Field label="ราคาทุนล่าสุด" labelClassName="text-right">
                <PriceInput
                  value={cost > 0 ? cost.toFixed(2) : ''}
                  onChange={() => {}}
                  disabled
                />
              </Field>
              <div className="rounded-lg bg-warm/50 px-3 py-2 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">ต้นทุนรวม (อัตโนมัติ)</span>
                {cost > 0
                  ? <span className="text-sm font-bold text-warm-foreground">{formatCurrency(cost)}</span>
                  : <span className="text-sm text-foreground-subtle">—</span>}
              </div>
            </div>

            {/* RIGHT: ราคาขายปลีก + กล่องกำไร */}
            <div className="space-y-3">
              <Field label="ราคาขายปลีก" required labelClassName="text-right">
                <PriceInput
                  value={form.price_retail}
                  onChange={v => setF('price_retail', v)}
                />
              </Field>
              {profitBox(retail)}
            </div>

          </div>
        </SectionCard>

        {/* Card 2: คำอธิบายสูตรต้นทุน — แยกออกมาเพื่อไม่ให้ Card 1 หนักเกินไป */}
        <SectionCard icon={Info} title="สูตรคำนวณต้นทุน">
          <p className="text-sm text-muted-foreground">
            ต้นทุน = ผลรวมของ <span className="font-semibold">(ราคาทุนของส่วนประกอบ × จำนวนต่อชุด)</span>
            {' '}อัพเดตอัตโนมัติเมื่อราคาทุนของส่วนประกอบเปลี่ยน
          </p>
        </SectionCard>

        {/* Card 3: ราคาขายส่ง — 2 คอลัมน์ ส่ง 1 ซ้าย / ส่ง 2 ขวา */}
        <SectionCard icon={Tag} title="ราคาขายส่ง">
          <div className="grid grid-cols-2 gap-3">
            {([
              { label: 'ราคาส่ง 1', key: 'price_wholesale1', value: form.price_wholesale1, d: ws1 },
              { label: 'ราคาส่ง 2', key: 'price_wholesale2', value: form.price_wholesale2, d: ws2 },
            ] as const).map(({ label, key, value, d }) => (
              <div key={key} className="space-y-3">
                <Field label={label} labelClassName="text-right">
                  <PriceInput
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
      <div className="bg-card rounded-card shadow-card overflow-hidden">
        <div className="h-12 px-5 text-sm font-semibold text-muted-foreground shrink-0 flex items-center justify-between">
          <span>
            ประวัติการเปลี่ยนราคา
            {history && history.length > 0 && (
              <> · <span className="text-foreground">{history.length}</span> รายการ</>
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
                    {isNew ? 'บันทึกชุดสินค้าก่อนเพื่อดูประวัติราคา' : 'ยังไม่มีประวัติการเปลี่ยนราคา'}
                  </TableCell>
                </TableRow>
              ) : history.map(h => {
                const meta = PRICE_TYPE_META[h.price_type] ?? { label: h.price_type, variant: 'success' as const }
                const up = h.new_price > h.old_price
                return (
                  <TableRow key={h.id} className="hover:bg-primary-soft/60 transition-colors">
                    <TableCell className="text-sm">{formatDateTime(h.created_at)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={meta.variant} className="rounded-md">{meta.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {formatCurrency(h.old_price)}
                    </TableCell>
                    <TableCell className={`text-right text-sm font-semibold ${up ? 'text-success' : 'text-destructive'}`}>
                      {formatCurrency(h.new_price)}
                    </TableCell>
                    <TableCell className="text-center">
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
        <div className="h-12 px-5 border-t border-border text-sm text-muted-foreground shrink-0 flex items-center">
          <span>
            ราคาที่แก้จากหน้านี้จะถูกบันทึกไว้ที่นี่
          </span>
        </div>
      </div>

    </div>
  )
}
