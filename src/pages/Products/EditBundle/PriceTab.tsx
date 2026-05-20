import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/label'
import { SectionCard } from '@/components/ui/card'
import { Tag, Info } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { FullProduct } from '../EditProduct/shared'

interface Props {
  form: any
  setF: (key: string, v: any) => void
  product: FullProduct
}

// Bundle pricing — manual retail/wholesale, auto cost.
// cost_price is computed by recomputeBundleCost on every saveBundleItems and
// every component-cost change (via propagateCostToBundles in pricing.ts), so
// it's read-only here. The displayed value comes from product.cost_price
// (post-refresh), not form state — keeps the cost in sync without an edit.
export function PriceTab({ form, setF, product }: Props) {
  const cost = Number(product.cost_price) || 0
  const retail = Number(form.price_retail) || 0
  const profit = retail - cost
  const margin = retail > 0 ? (profit / retail) * 100 : 0

  return (
    <div className="space-y-3">
      <SectionCard icon={Tag} title="ราคาขาย">
        <div className="grid grid-cols-3 gap-3">
          <FormField label="ราคาขายปลีก" required>
            <Input
              type="number" step="0.01"
              value={form.price_retail ?? 0}
              onChange={e => setF('price_retail', e.target.value)}
            />
          </FormField>
          <FormField label="ราคาขายส่ง 1">
            <Input
              type="number" step="0.01"
              value={form.price_wholesale1 ?? 0}
              onChange={e => setF('price_wholesale1', e.target.value)}
            />
          </FormField>
          <FormField label="ราคาขายส่ง 2">
            <Input
              type="number" step="0.01"
              value={form.price_wholesale2 ?? 0}
              onChange={e => setF('price_wholesale2', e.target.value)}
            />
          </FormField>
        </div>
      </SectionCard>

      <SectionCard icon={Info} title="ต้นทุน (อัตโนมัติ)">
        <div className="grid grid-cols-3 gap-3">
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
        <p className="text-sm text-muted-foreground mt-3">
          ต้นทุน = ผลรวมของ <span className="font-semibold">(ราคาทุนของส่วนประกอบ × จำนวนต่อชุด)</span>
          {' '}อัพเดตอัตโนมัติเมื่อราคาทุนของส่วนประกอบเปลี่ยน
        </p>
      </SectionCard>
    </div>
  )
}
