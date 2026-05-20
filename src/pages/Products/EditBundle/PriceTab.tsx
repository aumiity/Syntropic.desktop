import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/label'
import { SectionCard } from '@/components/ui/card'
import { Tag, Info } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { FullProduct } from '../EditProduct/shared'

interface Props {
  form: any
  setF: (key: string, v: any) => void
  // null in new-mode (no DB row yet) — cost is then unknown until save (and
  // recomputeBundleCost runs server-side). Show 0 with a hint.
  product: FullProduct | null
}

// Bundle pricing — manual retail/wholesale, auto cost.
// cost_price is computed by recomputeBundleCost on every saveBundleItems and
// every component-cost change (via propagateCostToBundles in pricing.ts), so
// it's read-only here. The displayed value comes from product.cost_price
// (post-refresh), not form state — keeps the cost in sync without an edit.
export function PriceTab({ form, setF, product }: Props) {
  const cost = Number(product?.cost_price) || 0
  const retail = Number(form.price_retail) || 0
  const profit = retail - cost
  const margin = retail > 0 ? (profit / retail) * 100 : 0

  // Per-row profit box for wholesale (mirrors EditProduct/PriceTab): profit
  // and pct are vs. cost (markup-style %), dim when either side is 0.
  const calcWs = (price: number) => {
    const p = price - cost
    const pct = cost > 0 ? (p / cost) * 100 : 0
    return { profit: p, pct, pos: p >= 0, dim: price <= 0 || cost <= 0 }
  }
  const ws1 = calcWs(parseFloat(form.price_wholesale1) || 0)
  const ws2 = calcWs(parseFloat(form.price_wholesale2) || 0)

  const profitText = (d: ReturnType<typeof calcWs>) => d.dim ? (
    <span className="text-sm text-foreground-subtle">—</span>
  ) : (
    <span className={`text-sm font-bold tabular-nums ${d.pos ? 'text-success' : 'text-destructive'}`}>
      {d.pos ? '+' : ''}{d.profit.toFixed(2)} ({d.pos ? '+' : ''}{d.pct.toFixed(0)}%)
    </span>
  )

  return (
    <div className="space-y-3">
      <SectionCard icon={Tag} title="ราคาขายปลีก & ต้นทุน">
        <div className="grid grid-cols-4 gap-3">
          <FormField label="ราคาขายปลีก" required>
            <Input
              type="number" step="0.01"
              value={form.price_retail ?? 0}
              onChange={e => setF('price_retail', e.target.value)}
            />
          </FormField>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">ต้นทุนรวม</span>
            <span className="text-2xl font-bold tabular-nums text-foreground">
              {formatCurrency(cost)}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">กำไรต่อชุด</span>
            <span className={`text-2xl font-bold tabular-nums ${profit >= 0 ? 'text-success' : 'text-destructive'}`}>
              {formatCurrency(profit)}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">มาร์จิ้น</span>
            <span className={`text-2xl font-bold tabular-nums ${profit >= 0 ? 'text-success' : 'text-destructive'}`}>
              {margin.toFixed(1)}%
            </span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-3 flex items-start gap-1.5">
          <Info className="size-4 shrink-0 mt-0.5" />
          <span>
            ต้นทุน = ผลรวมของ <span className="font-semibold">(ราคาทุนของส่วนประกอบ × จำนวนต่อชุด)</span>
            {' '}อัพเดตอัตโนมัติเมื่อราคาทุนของส่วนประกอบเปลี่ยน
          </span>
        </p>
      </SectionCard>

      <SectionCard icon={Tag} title="ราคาขายส่ง">
        <div className="grid grid-cols-2 gap-3">
          {([
            { label: 'ราคาขายส่ง 1', key: 'price_wholesale1', value: form.price_wholesale1, d: ws1 },
            { label: 'ราคาขายส่ง 2', key: 'price_wholesale2', value: form.price_wholesale2, d: ws2 },
          ] as const).map(({ label, key, value, d }) => (
            <div key={key} className="space-y-3">
              <FormField label={label}>
                <Input
                  type="number" step="0.01"
                  value={value ?? 0}
                  onChange={e => setF(key, e.target.value)}
                />
              </FormField>
              <div className="rounded-lg bg-success-soft/50 px-3 py-2 tabular-nums">
                <div className="flex items-center justify-between">
                  <span className={`text-sm ${d.dim ? 'text-foreground-subtle' : 'text-muted-foreground'}`}>กำไรต่อชุด</span>
                  {profitText(d)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}
