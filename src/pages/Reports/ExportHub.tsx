import { useEffect, useState, type ComponentType } from 'react'
import { useOutletContext } from 'react-router-dom'
import { MultiDatePicker, rangeForMultiMode, type MultiDateMode } from '@/components/ui/multi-date-picker'
import { Card } from '@/components/ui/card'
import { TintIcon, type TintIconTint } from '@/components/ui/tint-icon'
import { ExportButton } from '@/components/ui/export-button'
import type { ReportsOutletContext } from './index'
import { usePermission } from '@/hooks/usePermission'
import { ReceiptText, ShoppingCart, Landmark, Wallet, ShieldAlert, CalendarClock, PackageX } from 'lucide-react'

// Central Export Hub (/reports/export). One date window drives every dataset.
// Body is SELF-GATED on isAdmin — the /reports route itself is NOT role-guarded
// (staff can type the URL), so a non-admin sees a "เฉพาะผู้ดูแล" notice and the
// IPC requireAdmin gate blocks the actual data anyway.

interface DatasetRow {
  key: 'sales' | 'purchases' | 'vat' | 'expenses' | 'expiry' | 'lowStock'
  label: string
  desc: string
  icon: ComponentType<{ className?: string }>
  tint: TintIconTint
  /** true = a snapshot dataset that ignores the date window (expiry/low-stock). */
  noDate?: boolean
}

const DATASETS: DatasetRow[] = [
  { key: 'sales',     label: 'บิลขาย',      desc: 'หัวบิล + รายการสินค้า (2 ชีต)', icon: ReceiptText,  tint: 'primary' },
  { key: 'purchases', label: 'บิลซื้อ',      desc: 'หัวบิล + รายการรับเข้า (2 ชีต)', icon: ShoppingCart, tint: 'info' },
  { key: 'vat',       label: 'ภาษี (VAT)',  desc: 'ภาษีขาย / ภาษีซื้อ-รับสินค้า / ค่าใช้จ่าย (3 ชีต)', icon: Landmark, tint: 'success' },
  { key: 'expenses',  label: 'ค่าใช้จ่าย',  desc: 'รายการค่าใช้จ่ายทั้งหมดในช่วง (1 ชีต)', icon: Wallet, tint: 'violet' },
  { key: 'expiry',    label: 'วันหมดอายุ',  desc: 'ล็อตที่ยังมีของ พร้อมวันหมดอายุ (ไม่ขึ้นกับช่วงเวลา)', icon: CalendarClock, tint: 'warning', noDate: true },
  { key: 'lowStock',  label: 'สต็อกเหลือน้อย', desc: 'สินค้าต่ำกว่าจุดสั่งซื้อ + จำนวนที่ควรซื้อเพิ่ม (ไม่ขึ้นกับช่วงเวลา)', icon: PackageX, tint: 'destructive', noDate: true },
]

export default function ExportHubPage() {
  const { isAdmin } = usePermission()
  const { setSummary, setToolbar } = useOutletContext<ReportsOutletContext>()

  const initial = rangeForMultiMode('month')
  const [dateMode, setDateMode] = useState<MultiDateMode>('month')
  const [dateFrom, setDateFrom] = useState(initial.from)
  const [dateTo, setDateTo] = useState(initial.to)

  // Hub draws no summary cards.
  useEffect(() => { setSummary(null) }, [setSummary])

  // Toolbar — shared date window (admin only; non-admin can't export anyway).
  useEffect(() => {
    if (!isAdmin) { setToolbar(null); return }
    setToolbar(
      <MultiDatePicker
        mode={dateMode}
        from={dateFrom}
        to={dateTo}
        onChange={(m, f, t) => { setDateMode(m); setDateFrom(f); setDateTo(t) }}
        className="shrink-0"
      />,
    )
    return () => setToolbar(null)
  }, [setToolbar, dateMode, dateFrom, dateTo, isAdmin])

  if (!isAdmin) {
    return (
      <Card className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <TintIcon icon={ShieldAlert} tint="warning" size="lg" />
        <div className="text-base font-semibold text-foreground">เฉพาะผู้ดูแล</div>
        <p className="text-sm text-muted-foreground">การส่งออกข้อมูลการเงินทำได้เฉพาะผู้ดูแลระบบเท่านั้นค่ะ</p>
      </Card>
    )
  }

  const range = { date_from: dateFrom, date_to: dateTo }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        เลือกช่วงเวลาจากแถบด้านบน แล้วกดส่งออกแต่ละชุดข้อมูลเป็นไฟล์ Excel (.xlsx) ค่ะ
      </p>
      {DATASETS.map(d => (
        <Card key={d.key} className="flex items-center gap-4 p-4">
          <TintIcon icon={d.icon} tint={d.tint} size="md" />
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold text-foreground">{d.label}</div>
            <div className="text-sm text-muted-foreground">{d.desc}</div>
          </div>
          <ExportButton onExport={() => (window.api as any).exports[d.key](d.noDate ? {} : range)} />
        </Card>
      ))}
    </div>
  )
}
