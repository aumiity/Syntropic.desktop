import React, { useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/layout/PageHeader'
import { MetricCard, type MetricTint } from '@/components/ui/card'
import { LineChart, ShoppingBag, Wallet, ShieldCheck } from 'lucide-react'

// Phase 4: finance dashboard split into ภาพรวม / ขาย / ซื้อ (each with its own
// DateRangePicker). Phase 5: รายงาน อย. — placeholder. See PROGRESS.md.
const TABS = [
  { value: 'finance',   to: '/reports',           label: 'ภาพรวม',    icon: LineChart },
  { value: 'sales',     to: '/reports/sales',     label: 'ขาย',        icon: ShoppingBag },
  { value: 'purchases', to: '/reports/purchases', label: 'ซื้อ',       icon: Wallet },
  { value: 'fda',       to: '/reports/fda',       label: 'รายงาน อย.', icon: ShieldCheck },
] as const

type TabValue = typeof TABS[number]['value']

function resolveTab(pathname: string): TabValue {
  if (pathname.startsWith('/reports/sales')) return 'sales'
  if (pathname.startsWith('/reports/purchases')) return 'purchases'
  if (pathname.startsWith('/reports/fda')) return 'fda'
  return 'finance'
}

export interface ReportsSummaryCard {
  label: string
  value: string
  sub?: string
  subClassName?: string
  icon: React.ComponentType<{ className?: string }>
  tint: MetricTint
}

export interface ReportsOutletContext {
  setSummary: (cards: ReportsSummaryCard[] | null) => void
  setToolbar: (node: React.ReactNode | null) => void
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
  const [toolbar, setToolbar] = useState<React.ReactNode | null>(null)
  // Mirror of Manage: overflow-hidden during height transition only, so any
  // future ring/glow on a child card isn't clipped post-animation.
  const [animatingSummary, setAnimatingSummary] = useState(true)

  // Drop summary + toolbar the instant the tab changes so the new tab never
  // paints with the previous tab's cards/controls. During-render reset (vs
  // useEffect) avoids the one-frame flash of stale data after route change.
  const [prevTab, setPrevTab] = useState(current)
  if (prevTab !== current) {
    setPrevTab(current)
    setSummary(null)
    setToolbar(null)
  }

  const ctx = useMemo<ReportsOutletContext>(() => ({ setSummary, setToolbar }), [])

  return (
    <div className="flex flex-col h-full px-8 pt-4 pb-4 gap-2">
      <div className="no-print contents">
        <PageHeader title="รายงาน" />

        <div className="flex items-center gap-3 shrink-0">
          <Tabs
            value={current}
            onValueChange={(v) => {
              const tab = TABS.find(t => t.value === v)
              if (tab) navigate(tab.to)
            }}
          >
            <TabsList>
              {TABS.map(({ value, label, icon: Icon }) => (
                <TabsTrigger key={value} value={value}>
                  <Icon className="size-4 mr-1.5" /> {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {/* Page-provided toolbar (DateRangePicker / DEV / etc.) — right-aligned */}
          {toolbar && <div className="ml-auto flex items-center gap-3">{toolbar}</div>}
        </div>

        <AnimatePresence initial={false}>
          {summary && summary.length > 0 && (
            <motion.div
              key="reports-summary"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              onAnimationStart={() => setAnimatingSummary(true)}
              onAnimationComplete={() => setAnimatingSummary(false)}
              className={`shrink-0 ${animatingSummary ? 'overflow-hidden' : ''}`}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={location.pathname}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className={`grid grid-cols-2 md:grid-cols-3 ${COLS_BY_COUNT[summary.length] ?? 'xl:grid-cols-6'} gap-3 p-0.5`}
                >
                  {summary.map((c, i) => <MetricCard key={i} {...c} />)}
                </motion.div>
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Outlet context={ctx} />
    </div>
  )
}
