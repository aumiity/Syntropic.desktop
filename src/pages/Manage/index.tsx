import React, { useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/layout/PageHeader'
import { MetricCard, StatCard, type MetricTint } from '@/components/ui/card'
import { Receipt, CalendarClock, PackagePlus, PackageX } from 'lucide-react'

// Phase 1: ประวัติการขาย + ใกล้หมดอายุ. Phase 2: + ประวัติการซื้อ.
// Phase 3: + ต่ำกว่าจุดสั่งซื้อ. See PROGRESS.md.
const TABS = [
  { value: 'sales',     to: '/manage',           label: 'ประวัติการขาย', icon: Receipt },
  { value: 'purchases', to: '/manage/purchases', label: 'ประวัติการซื้อ', icon: PackagePlus },
  { value: 'low-stock', to: '/manage/low-stock', label: 'ต่ำกว่าจุดสั่งซื้อ', icon: PackageX },
  { value: 'expiry',    to: '/manage/expiry',    label: 'ใกล้หมดอายุ',   icon: CalendarClock },
] as const

type TabValue = typeof TABS[number]['value']

function resolveTab(pathname: string): TabValue {
  if (pathname.startsWith('/manage/expiry')) return 'expiry'
  if (pathname.startsWith('/manage/purchases')) return 'purchases'
  if (pathname.startsWith('/manage/low-stock')) return 'low-stock'
  return 'sales'
}

export interface ManageSummaryCard {
  label: string
  value: string
  sub?: string
  icon: React.ComponentType<{ className?: string }>
  tint: MetricTint
  // When set, the card renders as a clickable StatCard filter shortcut
  // (active = ring) instead of a passive MetricCard.
  onClick?: () => void
  isActive?: boolean
}

export interface ManageOutletContext {
  setSummary: (cards: ManageSummaryCard[] | null) => void
}

// Tailwind needs literal class strings to be discoverable in source.
const COLS_BY_COUNT: Record<number, string> = {
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
  5: 'xl:grid-cols-5',
  6: 'xl:grid-cols-6',
}

export default function ManageLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const current = resolveTab(location.pathname)
  const [summary, setSummary] = useState<ManageSummaryCard[] | null>(null)

  const ctx = useMemo<ManageOutletContext>(() => ({ setSummary }), [])

  return (
    <div className="flex flex-col h-full px-8 pt-10 pb-4 gap-3">
      <PageHeader title="ประวัติ & สต็อก" />

      <Tabs
        value={current}
        onValueChange={(v) => {
          const tab = TABS.find(t => t.value === v)
          if (tab) navigate(tab.to)
        }}
        className="shrink-0 items-center"
      >
        <TabsList>
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value}>
              <Icon className="size-4 mr-1.5" /> {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {summary && summary.length > 0 && (
        <div className={`grid grid-cols-2 md:grid-cols-3 ${COLS_BY_COUNT[summary.length] ?? 'xl:grid-cols-6'} gap-3 shrink-0`}>
          {summary.map((c, i) => c.onClick
            ? <StatCard key={i} label={c.label} value={c.value} icon={c.icon} tint={c.tint} onClick={c.onClick} isActive={c.isActive} />
            : <MetricCard key={i} {...c} />)}
        </div>
      )}

      <Outlet context={ctx} />
    </div>
  )
}
