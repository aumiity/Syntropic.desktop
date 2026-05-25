import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { Boxes } from 'lucide-react'

const THAI_MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
function formatThaiMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const be = (y + 543) % 100
  return `${THAI_MONTHS_SHORT[m - 1]} ${String(be).padStart(2, '0')}`
}

type MonthlySales = {
  current_month: { ym: string; qty: number }
  history: Array<{ ym: string; qty: number }>
  avg_per_month: number
}

export interface QuickStockTarget {
  id: number
  trade_name: string
  code?: string | null
  unit_name?: string | null
  stock_qty: number
  reorder_point: number | null
  safety_stock: number | null
  is_disabled?: number
}

export function QuickStockDialog({
  target, onClose, onSaved,
}: {
  target: QuickStockTarget | null
  onClose: () => void
  onSaved?: () => void
}) {
  const { toast } = useToast()
  const open = !!target

  const [reorderPoint, setReorderPoint] = useState('')
  const [safetyStock, setSafetyStock] = useState('')
  const [isDisabled, setIsDisabled] = useState(false)
  const [monthlySales, setMonthlySales] = useState<MonthlySales | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!target) { setMonthlySales(null); return }
    setReorderPoint(target.reorder_point != null ? String(target.reorder_point) : '')
    setSafetyStock(target.safety_stock != null ? String(target.safety_stock) : '')
    setIsDisabled(!!target.is_disabled)

    let cancelled = false
    ;(async () => {
      try {
        const data = await window.api.products.monthlySales(target.id) as MonthlySales
        if (!cancelled) setMonthlySales(data)
      } catch {
        if (!cancelled) setMonthlySales(null)
      }
    })()
    return () => { cancelled = true }
  }, [target])

  const parseField = (raw: string): number | null | 'invalid' => {
    if (raw.trim() === '') return null
    const n = Number(raw)
    if (!isFinite(n) || n < 0) return 'invalid'
    return n
  }

  const handleSave = async () => {
    if (!target) return
    const rp = parseField(reorderPoint)
    const ss = parseField(safetyStock)
    if (rp === 'invalid') { toast('จุดสั่งซื้อไม่ถูกต้อง', 'error'); return }
    if (ss === 'invalid') { toast('สต็อกปลอดภัยไม่ถูกต้อง', 'error'); return }
    setSaving(true)
    try {
      await window.api.products.update(target.id, {
        reorder_point: rp,
        safety_stock: ss,
        is_disabled: isDisabled ? 1 : 0,
      })
      toast('บันทึกสำเร็จ', 'success')
      onSaved?.()
      onClose()
    } catch (e: any) {
      toast(e?.message ?? 'บันทึกไม่สำเร็จ', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose() }}>
      <DialogContent
        size="md"
        onKeyDown={e => { if (e.key === 'Enter' && !saving) { e.preventDefault(); handleSave() } }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-start gap-2.5">
            <span className="grid place-items-center size-9 rounded-lg bg-warning-soft text-warning-strong shrink-0">
              <Boxes className="size-5" />
            </span>
            <div className="min-w-0">
              <div>สต็อกและการแจ้งเตือน</div>
              <div className="text-sm font-normal text-muted-foreground truncate">
                {target?.code && <span className="font-mono mr-1.5">{target.code}</span>}
                {target?.trade_name}
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {/* Current stock summary */}
          <div className="rounded-lg bg-muted/40 px-3 py-2 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">คงเหลือ</span>
            <span className="text-base font-bold text-foreground">
              {target?.stock_qty.toLocaleString()}
              {target?.unit_name && <span className="text-sm font-normal text-muted-foreground ml-1.5">{target.unit_name}</span>}
            </span>
          </div>

          {/* Reorder + safety stock inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">จุดสั่งซื้อ</label>
              <Input
                type="number"
                value={reorderPoint}
                onChange={e => setReorderPoint(e.target.value)}
                min={0}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">สต็อกปลอดภัย</label>
              <Input
                type="number"
                value={safetyStock}
                onChange={e => setSafetyStock(e.target.value)}
                min={0}
              />
            </div>
          </div>

          {/* Monthly sales tiles */}
          <div className="space-y-3 pt-3 border-t border-border">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-warm/50 px-3 py-2 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">เฉลี่ย / เดือน</span>
                {monthlySales
                  ? <span className="text-base font-bold text-warm-foreground">{monthlySales.avg_per_month.toFixed(2)}</span>
                  : <span className="text-sm text-foreground-subtle">—</span>}
              </div>
              <div className="rounded-lg bg-warm/50 px-3 py-2 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {monthlySales ? formatThaiMonth(monthlySales.current_month.ym) : 'เดือนปัจจุบัน'}
                </span>
                {monthlySales
                  ? <span className="text-base font-bold text-warm-foreground">{monthlySales.current_month.qty.toFixed(2)}</span>
                  : <span className="text-sm text-foreground-subtle">—</span>}
              </div>
            </div>

            <div className="text-sm font-semibold text-muted-foreground">
              ยอดขายย้อนหลัง
              <span className="font-normal mx-1.5">·</span>
              <span className="font-normal">6 เดือน</span>
            </div>
            <div className="rounded-lg bg-muted/40 divide-y divide-border overflow-hidden">
              {(monthlySales?.history ?? Array.from({ length: 6 }, (_, i) => ({ ym: `_${i}`, qty: 0 }))).map(h => (
                <div key={h.ym} className="flex items-center justify-between px-3 py-1.5 text-sm">
                  <span className="text-muted-foreground">
                    {monthlySales ? formatThaiMonth(h.ym) : '—'}
                  </span>
                  {monthlySales
                    ? <span className="font-semibold text-foreground">{h.qty.toFixed(2)}</span>
                    : <span className="text-foreground-subtle">—</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Disable toggle */}
          <div className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 border ${isDisabled ? 'border-destructive/40 bg-destructive-soft/40' : 'border-border'}`}>
            <div>
              <div className="text-sm font-semibold text-foreground">ปิดใช้งานสินค้า</div>
              <div className="text-xs text-muted-foreground">ปิดการใช้งานทั้งสินค้า</div>
            </div>
            <Switch size="lg" variant="destructive" checked={isDisabled} onCheckedChange={setIsDisabled} />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="destructive2" size="xl" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button size="xl" onClick={handleSave} disabled={saving}>
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
