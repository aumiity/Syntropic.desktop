// Bundle pricing section + price-history dialog used by GeneralTab.
// Originally a standalone tab; merged into General (option D) so users see
// price/cost alongside the bundle fields. History stays as an on-demand
// dialog instead of inline.
//
// Bundle pricing: manual retail/wholesale, auto cost. cost_price is computed
// by recomputeBundleCost on every saveBundleItems and component-cost change
// (propagateCostToBundles in pricing.ts), so it's read-only here. The cost
// shown comes from product.cost_price (post-refresh), not form state.
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { PriceInput } from '@/components/ui/price-input'
import { Badge } from '@/components/ui/badge'
import { FormField } from '@/components/ui/label'
import { SectionCard } from '@/components/ui/card'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { CircleDollarSign, History, StickyNote, Info } from 'lucide-react'
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

const PRICE_TYPE_META: Record<string, { label: string; variant: 'success' | 'info-soft' | 'amber-soft' }> = {
  retail:     { label: 'ราคาปลีก',  variant: 'success' },
  wholesale1: { label: 'ราคาส่ง 1', variant: 'info-soft' },
  wholesale2: { label: 'ราคาส่ง 2', variant: 'amber-soft' },
}

interface PriceSectionProps {
  form: any
  setF: (key: string, v: any) => void
  errors: Set<string>
  // null in new-mode (no DB row yet) — cost is then unknown until save (and
  // recomputeBundleCost runs server-side).
  product: FullProduct | null
  baseUnit: string
  isNew: boolean
  onOpenHistory: () => void
}

export function PriceSection({ form, setF, errors, product, baseUnit, isNew, onOpenHistory }: PriceSectionProps) {
  const cost = Number(product?.cost_price) || 0

  // Markup-style %: profit / cost. Same shape as EditProduct/PriceSection so
  // the profit box reads identically across products and bundles.
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
      <div className={`rounded-lg grid grid-cols-2 ${d.dim ? 'bg-muted/40 border border-border divide-x divide-border opacity-70' : 'bg-success-soft/50 border border-success/30 divide-x divide-success/30'}`}>
        <div className="space-y-0.5 min-w-0 px-3 py-2">
          <div className={labelCls}>กำไร</div>
          {d.dim ? dash : <div className={valCls}>{d.pos ? '+' : ''}{d.profit.toFixed(2)}</div>}
        </div>
        <div className="space-y-0.5 min-w-0 px-3 py-2">
          <div className={labelCls}>กำไร (%)</div>
          {d.dim ? dash : <div className={valCls}>{d.pos ? '+' : ''}{d.pct.toFixed(0)}%</div>}
        </div>
      </div>
    )
  }

  const historyButton = (
    <Button
      size="lg"
      variant="elevated"
      className="h-9 px-3"
      onClick={onOpenHistory}
      disabled={isNew}
      title={isNew ? 'บันทึกชุดสินค้าก่อนเพื่อดูประวัติราคา' : 'ดูประวัติการเปลี่ยนราคา'}
    >
      <History className="size-4" /> ประวัติ
    </Button>
  )

  const titleNode = (
    <span className="inline-flex items-center gap-2">
      ราคาขาย & ต้นทุน
      <Badge variant="success-outline" className="rounded-md font-normal">{baseUnit}</Badge>
    </span>
  )

  return (
    <>
      <SectionCard icon={CircleDollarSign} title={titleNode} tint="success" right={historyButton}>
        <div className="space-y-4">
          {/* Row 1: ต้นทุน (auto, disabled) + ราคาปลีก (input on top, detail below within each cell) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Field label="ต้นทุนรวม (อัตโนมัติ)">
                <PriceInput
                  variant="elevated"
                  value={cost > 0 ? cost.toFixed(2) : ''}
                  onChange={() => {}}
                  disabled
                  className="text-left"
                />
              </Field>
              <div className="rounded-lg bg-amber-soft/50 border border-amber-strong/25 px-3 py-2 flex-1 flex items-center">
                <div className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Info className="size-3.5 shrink-0" />
                  <span>คำนวณอัตโนมัติจากทุนของส่วนประกอบ</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2" data-field="price_retail">
              <Field label="ราคาขายปลีก" required>
                <PriceInput
                  variant="elevated"
                  value={form.price_retail}
                  onChange={v => setF('price_retail', v)}
                  aria-invalid={errors.has('price_retail')}
                  className="text-left"
                />
              </Field>
              {profitBox(retail)}
            </div>
          </div>

          {/* Row 2: ราคาส่ง 1 + ราคาส่ง 2 */}
          <div className="grid grid-cols-2 gap-3">
            {([
              { label: 'ราคาส่ง 1', key: 'price_wholesale1', value: form.price_wholesale1, d: ws1 },
              { label: 'ราคาส่ง 2', key: 'price_wholesale2', value: form.price_wholesale2, d: ws2 },
            ] as const).map(({ label, key, value, d }) => (
              <div key={key} className="space-y-2">
                <Field label={label}>
                  <PriceInput
                    variant="elevated"
                    value={value}
                    onChange={v => setF(key, v)}
                    className="text-left"
                  />
                </Field>
                {profitBox(d)}
              </div>
            ))}
          </div>
        </div>
      </SectionCard>
    </>
  )
}

interface PriceHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  productId: number
  isNew: boolean
  reloadToken: string | number
}

export function PriceHistoryDialog({ open, onOpenChange, productId, isNew, reloadToken }: PriceHistoryDialogProps) {
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

  useEffect(() => {
    if (open) loadHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, productId, isNew, reloadToken])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-5" /> ประวัติการเปลี่ยนราคา
            <Badge variant="neutral-outline" className="ml-1">{history?.length ?? 0}</Badge>
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="p-0">
          <Table containerClassName="max-h-[60vh] scrollbar-thin">
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
                    {isNew ? 'บันทึกชุดสินค้าก่อนเพื่อดูประวัติราคา' : 'ยังไม่มีประวัติการเปลี่ยนราคา'}
                  </TableCell>
                </TableRow>
              ) : history.map(h => {
                const meta = PRICE_TYPE_META[h.price_type] ?? { label: h.price_type, variant: 'success' as const }
                const up = h.new_price > h.old_price
                return (
                  <TableRow key={h.id} className="[&_td]:py-1.5 [&_td]:font-medium">
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
                            <Button size="icon-sm" variant="elevated" title="ดูหมายเหตุ">
                              <StickyNote className="size-3.5" />
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
        </DialogBody>
        <DialogFooter>
          <Button size="xl" onClick={() => onOpenChange(false)}>ปิด</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
