import { useEffect, useState, type ComponentType } from 'react'
import { useOutletContext } from 'react-router-dom'
import { MultiDatePicker, rangeForMultiMode, type MultiDateMode } from '@/components/ui/multi-date-picker'
import { Card, CardHeader, CardTitle, CardAction, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { TintIcon, type TintIconTint } from '@/components/ui/tint-icon'
import { ExportButton } from '@/components/ui/export-button'
import { usePermission } from '@/hooks/usePermission'
import { useShopVat } from '@/hooks/useShopVat'
import { formatCurrency } from '@/lib/utils'
import type { ReportsOutletContext } from './index'
import { ReceiptText, ShoppingCart, Wallet, Landmark, CalendarClock, PackageX } from 'lucide-react'

// Report/Export hub (/reports/export) — a card dashboard grouped by topic
// (สไตล์ Hygeia, ขยายได้). Each report = one card: a headline summary number +
// an Export-to-Excel button. ONE date window (TabStrip toolbar) drives the
// date-bound cards (ขาย/ซื้อ/ค่าใช้จ่าย/VAT); the สต็อก cards are snapshots.
//
// Role: the financial groups self-gate on isAdmin (financeSummary/vatSummary are
// requireAdmin-gated main-side anyway). The สต็อก group (วันหมดอายุ/เหลือน้อย) is
// visible to EVERYONE — staff lost the per-page export buttons in การจัดการ, so
// this is now their entry point for those two staff-allowed exports. Adding a new
// report later = one more entry in CARDS.

type GroupKey = 'sales' | 'purchases' | 'finance' | 'stock'
type CardKey = 'sales' | 'purchases' | 'expenses' | 'vat' | 'expiry' | 'lowStock'

interface ReportCard {
  key: CardKey
  group: GroupKey
  label: string
  desc: string
  icon: ComponentType<{ className?: string }>
  tint: TintIconTint
  /** snapshot dataset that ignores the date window (expiry/low-stock). */
  noDate?: boolean
}

const GROUPS: { key: GroupKey; label: string; adminOnly: boolean }[] = [
  { key: 'sales',     label: 'การขาย',    adminOnly: true },
  { key: 'purchases', label: 'การซื้อ',    adminOnly: true },
  { key: 'finance',   label: 'บัญชี-ภาษี', adminOnly: true },
  { key: 'stock',     label: 'สต็อก',      adminOnly: false },
]

const CARDS: ReportCard[] = [
  { key: 'sales',     group: 'sales',     label: 'บิลขาย',        desc: 'หัวบิล + รายการสินค้า (2 ชีต)',          icon: ReceiptText,   tint: 'primary' },
  { key: 'purchases', group: 'purchases', label: 'บิลซื้อ',        desc: 'หัวบิล + รายการรับเข้า (2 ชีต)',         icon: ShoppingCart,  tint: 'info' },
  { key: 'expenses',  group: 'finance',   label: 'ค่าใช้จ่าย',     desc: 'รายการค่าใช้จ่ายทั้งหมดในช่วง (1 ชีต)',   icon: Wallet,        tint: 'violet' },
  { key: 'vat',       group: 'finance',   label: 'ภาษี (VAT)',    desc: 'ภาษีขาย / ภาษีซื้อ / ค่าใช้จ่าย (3 ชีต)', icon: Landmark,      tint: 'success' },
  { key: 'expiry',    group: 'stock',     label: 'วันหมดอายุ',     desc: 'ล็อตที่ยังมีของ พร้อมวันหมดอายุ',         icon: CalendarClock, tint: 'warning', noDate: true },
  { key: 'lowStock',  group: 'stock',     label: 'สต็อกเหลือน้อย', desc: 'สินค้าต่ำกว่าจุดสั่งซื้อ + จำนวนที่ควรซื้อเพิ่ม', icon: PackageX,  tint: 'destructive', noDate: true },
]

// Headline value + sub line per card. While the backing data is still null
// (pre-load), the value renders as "—" so nothing flashes a wrong 0.
function cardDisplay(
  key: CardKey,
  fin: any | null,
  vat: any | null,
  expiry: { d90: number; expired: number } | null,
  lowCount: number | null,
): { value: string; sub?: string } {
  switch (key) {
    case 'sales':     return fin ? { value: `฿${formatCurrency(fin.sales_net)}`,     sub: `${fin.sale_count} บิล` } : { value: '—' }
    case 'purchases': return fin ? { value: `฿${formatCurrency(fin.purchase_total)}`, sub: `${fin.purchase_count} บิล` } : { value: '—' }
    case 'expenses':  return fin ? { value: `฿${formatCurrency(fin.expense_total)}` } : { value: '—' }
    case 'vat':       return vat ? { value: `฿${formatCurrency(vat.net_vat)}`, sub: 'ภาษีสุทธิ (ขาย−ซื้อ)' } : { value: '—' }
    case 'expiry':    return expiry ? { value: String(expiry.d90), sub: `หมดอายุแล้ว ${expiry.expired}` } : { value: '—' }
    case 'lowStock':  return lowCount != null ? { value: String(lowCount), sub: 'ต่ำกว่าจุดสั่งซื้อ' } : { value: '—' }
  }
}

export default function ExportHubPage() {
  const { isAdmin } = usePermission()
  const { vatEnabled } = useShopVat()
  const { setSummary, setToolbar } = useOutletContext<ReportsOutletContext>()

  // The VAT card follows the same hide-when-NO-VAT rule as the ภาษี tab in
  // index.tsx: shown for VAT-registered shops AND shops with VAT history (a
  // downgraded shop still files/gets inspected on past periods). A never-VAT
  // shop has no VAT card at all.
  const [hasVatHistory, setHasVatHistory] = useState(false)
  useEffect(() => {
    let alive = true
    ;(window.api.settings as any).hasVatHistory()
      .then((v: boolean) => { if (alive) setHasVatHistory(!!v) })
      .catch(() => {})
    return () => { alive = false }
  }, [])
  const vatVisible = vatEnabled || hasVatHistory

  const initial = rangeForMultiMode('month')
  const [dateMode, setDateMode] = useState<MultiDateMode>('month')
  const [dateFrom, setDateFrom] = useState(initial.from)
  const [dateTo, setDateTo] = useState(initial.to)

  const [fin, setFin] = useState<any | null>(null)
  const [vat, setVat] = useState<any | null>(null)
  const [expiry, setExpiry] = useState<{ d90: number; expired: number } | null>(null)
  const [lowCount, setLowCount] = useState<number | null>(null)

  // Hub draws no MetricCard summary row at the top.
  useEffect(() => { setSummary(null) }, [setSummary])

  // Shared date window — admin only (staff see only the snapshot สต็อก cards).
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
  }, [isAdmin, dateMode, dateFrom, dateTo, setToolbar])

  // Date-bound summary numbers — admin only (financeSummary + vatSummary are
  // requireAdmin; calling them as staff would throw). Re-fetch on date change.
  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    ;(async () => {
      try {
        const f = await (window.api.reports as any).financeSummary({ date_from: dateFrom, date_to: dateTo })
        if (!cancelled) setFin(f)
      } catch { /* silent — the export buttons still work without the headline number */ }
      if (vatVisible) {
        try {
          const v = await (window.api.reports as any).vatSummary({ date_from: dateFrom, date_to: dateTo })
          if (!cancelled) setVat(v)
        } catch { /* silent */ }
      }
    })()
    return () => { cancelled = true }
  }, [isAdmin, vatVisible, dateFrom, dateTo])

  // Snapshot counts — all roles (these handlers are NOT admin-gated). Fetch once.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await (window.api.reports as any).expiringLots({ count_only: true })
        if (!cancelled) setExpiry({ d90: res?.counts?.d90 ?? 0, expired: res?.counts?.expired ?? 0 })
      } catch { /* silent */ }
      try {
        // lowStock returns an object { rows, count, ... } — read .count, NOT .length.
        const res = await (window.api.products as any).lowStock({})
        if (!cancelled) setLowCount(typeof res?.count === 'number' ? res.count : (res?.rows?.length ?? 0))
      } catch { /* silent */ }
    })()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        {isAdmin
          ? 'เลือกช่วงเวลาจากแถบด้านบน ดูยอดสรุปย่อ แล้วกดส่งออกแต่ละชุดข้อมูลเป็นไฟล์ Excel (.xlsx) ค่ะ'
          : 'กดส่งออกข้อมูลสต็อกเป็นไฟล์ Excel (.xlsx) ค่ะ'}
      </p>

      {GROUPS.filter(g => !g.adminOnly || isAdmin).map(group => (
        <div key={group.key} className="flex flex-col gap-3">
          <h3 className="text-base font-semibold text-foreground">{group.label}</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {CARDS.filter(c => c.group === group.key && (c.key !== 'vat' || vatVisible)).map(card => {
              const d = cardDisplay(card.key, fin, vat, expiry, lowCount)
              const range = { date_from: dateFrom, date_to: dateTo }
              return (
                <Card key={card.key}>
                  <CardHeader>
                    <CardTitle>{card.label}</CardTitle>
                    <CardAction>
                      <TintIcon icon={card.icon} tint={card.tint} size="md" bordered />
                    </CardAction>
                    <CardDescription>{card.desc}</CardDescription>
                  </CardHeader>
                  <CardContent className="min-w-0">
                    <div className="text-3xl font-bold text-foreground truncate">{d.value}</div>
                    {d.sub && <div className="text-sm text-muted-foreground mt-1 truncate">{d.sub}</div>}
                  </CardContent>
                  <CardFooter>
                    <ExportButton
                      className="w-full justify-center"
                      onExport={() => (window.api as any).exports[card.key](card.noDate ? {} : range)}
                    />
                  </CardFooter>
                </Card>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
