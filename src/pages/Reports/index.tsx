import React, { useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/layout/PageHeader'
import { MetricCard, type MetricTint } from '@/components/ui/card'
import { LineChart, Wallet, ShieldCheck } from 'lucide-react'

// Phase 4: finance dashboard (ภาพรวมการเงิน + เจ้าหนี้การค้า).
// Phase 5: รายงาน อย. — placeholder tab (under construction). See PROGRESS.md.
const TABS = [
  { value: 'finance',  to: '/reports',          label: 'ภาพรวมการเงิน', icon: LineChart },
  { value: 'payables', to: '/reports/payables', label: 'เจ้าหนี้การค้า', icon: Wallet },
  { value: 'fda',      to: '/reports/fda',      label: 'รายงาน อย.',    icon: ShieldCheck },
] as const

type TabValue = typeof TABS[number]['value']

function resolveTab(pathname: string): TabValue {
  if (pathname.startsWith('/reports/payables')) return 'payables'
  if (pathname.startsWith('/reports/fda')) return 'fda'
  return 'finance'
}

export interface ReportsSummaryCard {
  label: string
  value: string
  sub?: string
  icon: React.ComponentType<{ className?: string }>
  tint: MetricTint
}

export interface ReportsOutletContext {
  setSummary: (cards: ReportsSummaryCard[] | null) => void
}

// Tailwind needs literal class strings to be discoverable in source.
const COLS_BY_COUNT: Record<number, string> = {
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
  5: 'xl:grid-cols-5',
  6: 'xl:grid-cols-6',
}

export default function ReportsLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const current = resolveTab(location.pathname)
  const [summary, setSummary] = useState<ReportsSummaryCard[] | null>(null)

  const ctx = useMemo<ReportsOutletContext>(() => ({ setSummary }), [])

  return (
    <div className="flex flex-col h-full px-8 pt-10 pb-4 gap-3">
      <div className="no-print contents">
        <PageHeader title="รายงาน" />

        {summary && summary.length > 0 && (
          <div className={`grid grid-cols-2 md:grid-cols-3 ${COLS_BY_COUNT[summary.length] ?? 'xl:grid-cols-6'} gap-3 shrink-0`}>
            {summary.map((c, i) => <MetricCard key={i} {...c} />)}
          </div>
        )}

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
      </div>

      <Outlet context={ctx} />
    </div>
  )
}
