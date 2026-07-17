import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from './dialog'
import { Button } from './button'
import { Input } from './input'
import { Label } from './label'
import { RotateCcw, Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { formatCurrency } from '@/lib/utils'

// number helpers (mirror POS) — raw value while focused, comma-grouped when blurred
const stripCommas = (v: string) => v.replace(/,/g, '')
const formatNumWithCommas = (raw: string, forceTwoDecimals = false): string => {
  if (raw === '' || raw == null) return ''
  const n = parseFloat(raw)
  if (!isFinite(n)) return raw
  return forceTwoDecimals
    ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : n.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

interface DiscountDialogProps {
  open: boolean
  onClose: () => void
  /** ชื่อรายการ โชว์ใต้หัวข้อ */
  itemName?: string
  /** ราคารวมก่อนหักส่วนลด (จำนวน × ราคา/ทุนต่อหน่วย) — ฐานคำนวณ % และราคาสุดท้าย */
  totalPrice: number
  /** ส่วนลด (บาท) ปัจจุบัน — seed ทุกครั้งที่เปิด */
  initialDiscount: number
  /** ข้อความอธิบาย/คำเตือน — render เป็นกล่องเหนือปุ่มเลือก % (เว้นว่าง = ไม่โชว์) */
  note?: ReactNode
  onApply: (discount: number) => void
}

/**
 * Shared per-line discount dialog (lifted from the POS cart). Three synced
 * inputs — % / บาท / ราคาสุดท้าย — plus quick-percent presets. Owns its own
 * draft state (seeded from `initialDiscount` + `totalPrice` on open); the
 * consumer reacts via `onApply(discount)` in baht. Used by POS and the GR
 * receive table.
 */
export function DiscountDialog({
  open, onClose, itemName, totalPrice, initialDiscount, note, onApply,
}: DiscountDialogProps) {
  const [baht, setBaht] = useState('')
  const [pct, setPct] = useState('')
  const [final, setFinal] = useState('')
  const [focus, setFocus] = useState<'pct' | 'baht' | 'final' | null>(null)

  // Re-seed every open from the current discount + total (blank when no discount).
  useEffect(() => {
    if (!open) return
    if (initialDiscount > 0) {
      const disc = parseFloat(initialDiscount.toFixed(2))
      setBaht(String(disc))
      setPct(totalPrice > 0 ? String(parseFloat((disc / totalPrice * 100).toFixed(2))) : '')
      setFinal(String(parseFloat((totalPrice - disc).toFixed(2))))
    } else {
      setBaht(''); setPct(''); setFinal('')
    }
    setFocus(null)
  }, [open, initialDiscount, totalPrice])

  const d = parseFloat(baht) || 0
  const apply = (disc: number) => { onApply(disc); onClose() }
  const applyPercent = (p: number) => {
    const disc = parseFloat((totalPrice * p / 100).toFixed(2))
    setBaht(String(disc)); setPct(String(p)); setFinal(String(parseFloat((totalPrice - disc).toFixed(2))))
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      {open && (
        <DialogContent size="sm" divided onClose={onClose}>
          <DialogHeader>
            <DialogTitle className="text-2xl">ส่วนลด</DialogTitle>
            {itemName && <div className="text-base font-semibold text-foreground overflow-x-clip overflow-y-visible">{itemName}</div>}
          </DialogHeader>
          <DialogBody className="space-y-4">
            {note && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive-soft/50 p-3 text-sm text-destructive">
                <Info className="size-4 shrink-0 mt-0.5" />
                <span>{note}</span>
              </div>
            )}
            {/* preset % — iOS-style segmented control (แพทเทิร์น TabsList segmented:
                track bg-muted + sliding card pill ขาว, ตัวอักษร active = foreground) */}
            <div className="grid grid-cols-5 gap-1 rounded-lg bg-muted p-1">
              {[3, 5, 10, 15, 20].map(p => {
                const isActive = totalPrice > 0 && Math.abs(d - totalPrice * p / 100) < 0.01
                return (
                  <Button key={p} variant="ghost" size="sm" onClick={() => applyPercent(p)}
                    className={`relative w-full h-8 rounded-md text-sm font-medium transition-colors hover:bg-transparent active:scale-100 active:translate-y-0 ${isActive ? 'text-destructive-foreground hover:text-destructive-foreground' : 'text-foreground/60 hover:text-foreground'}`}>
                    {isActive && (
                      <motion.div layoutId="discount-pct-pill" aria-hidden
                        className="absolute inset-0 rounded-md bg-destructive shadow-md"
                        transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }} />
                    )}
                    <span className="relative z-10">{p}%</span>
                  </Button>
                )
              })}
            </div>

            {/* ส่วนลด (%)  +  ส่วนลด (บาท) — เคียงกัน */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>ส่วนลด (%)</Label>
                <div className="relative">
                  <Input
                    type="text" inputMode="decimal"
                    value={focus === 'pct' ? pct : formatNumWithCommas(pct)}
                    onFocus={e => { setFocus('pct'); e.currentTarget.select() }}
                    onBlur={() => setFocus(null)}
                    onChange={e => {
                      const v = stripCommas(e.target.value)
                      setPct(v)
                      const p = parseFloat(v)
                      if (!isNaN(p)) {
                        const disc = parseFloat((totalPrice * p / 100).toFixed(2))
                        setBaht(String(disc)); setFinal(String(parseFloat((totalPrice - disc).toFixed(2))))
                      }
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') apply(d) }}
                    placeholder="0"
                    className="h-10 text-right text-xl font-bold leading-none pl-4 pr-10"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-subtle text-lg font-bold pointer-events-none">%</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>ส่วนลด (บาท)</Label>
                <Input
                  type="text" inputMode="decimal" autoFocus
                  value={focus === 'baht' ? baht : formatNumWithCommas(baht, true)}
                  onFocus={e => { setFocus('baht'); e.currentTarget.select() }}
                  onBlur={() => setFocus(null)}
                  onChange={e => {
                    const v = stripCommas(e.target.value)
                    setBaht(v)
                    const disc = parseFloat(v) || 0
                    if (totalPrice > 0) setPct(String(parseFloat((disc / totalPrice * 100).toFixed(2))))
                    setFinal(String(parseFloat((totalPrice - disc).toFixed(2))))
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') apply(d) }}
                  placeholder="0.00"
                  className="h-10 text-right text-xl font-bold leading-none px-6"
                />
              </div>
            </div>

            {/* กล่องสรุป — ราคารวม / ส่วนลด / ยอดสุทธิ (ช่องกรอกคำนวณส่วนลดย้อนกลับ) */}
            <div className="rounded-lg border border-destructive/20 bg-destructive-soft/50">
              <div className="flex items-center justify-between pl-4 pr-6 h-9">
                <span className="text-sm text-muted-foreground">ราคารวม</span>
                <span className="text-xl font-semibold text-foreground">{formatCurrency(totalPrice)}</span>
              </div>
              <div className="flex items-center justify-between pl-4 pr-6 h-9">
                <span className="text-sm text-muted-foreground">ส่วนลด</span>
                <span className="text-xl font-semibold text-destructive">{d > 0 ? '−' : ''}{formatCurrency(d)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 pl-4 pr-4 py-2.5">
                <span className="text-sm font-semibold text-foreground">ยอดสุทธิ</span>
                <Input
                  type="text" inputMode="decimal"
                  value={focus === 'final' ? final : formatNumWithCommas(final, true)}
                  onFocus={e => { setFocus('final'); e.currentTarget.select() }}
                  onBlur={() => setFocus(null)}
                  onChange={e => {
                    const v = stripCommas(e.target.value)
                    setFinal(v)
                    const fp = parseFloat(v)
                    if (!isNaN(fp)) {
                      const disc = Math.max(0, parseFloat((totalPrice - fp).toFixed(2)))
                      setBaht(String(disc))
                      if (totalPrice > 0) setPct(String(parseFloat((disc / totalPrice * 100).toFixed(2))))
                    }
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') apply(d) }}
                  placeholder={formatCurrency(totalPrice)}
                  className="h-10 w-36 text-right text-xl font-bold leading-none px-2"
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="destructive-soft" size="lg" className="mr-auto w-24 h-8" onClick={() => { setBaht('0'); apply(0) }}><RotateCcw className="size-4" /> ล้าง</Button>
            <Button className="w-24 h-8" variant="elevated" size="lg" onClick={onClose}>ยกเลิก</Button>
            <Button className="w-24 h-8" variant="destructive" size="lg" onClick={() => apply(d)}>ตกลง</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
