import React, { useCallback, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/layout/PageHeader'
import { MetricCard, type MetricTint } from '@/components/ui/card'
import { LineChart, ShoppingBag, Wallet, ShieldCheck, LayoutDashboard } from 'lucide-react'

// Phase 4: finance dashboard split into ภาพรวม / ขาย / ซื้อ (each with its own
// DateRangePicker). Phase 5: รายงาน อย. — placeholder. See PROGRESS.md.
// Dashboard tab added later as an operational view (top sellers, stock risk,
// safety-stock helper) — kept first so it's the primary entry; Finance stays
// the /reports index route so the existing URL keeps working.
const TABS = [
  { value: 'dashboard', to: '/reports/dashboard', label: 'แดชบอร์ด',   icon: LayoutDashboard },
  { value: 'finance',   to: '/reports',           label: 'ภาพรวม',    icon: LineChart },
  { value: 'sales',     to: '/reports/sales',     label: 'ขาย',        icon: ShoppingBag },
  { value: 'purchases', to: '/reports/purchases', label: 'ซื้อ',       icon: Wallet },
  { value: 'fda',       to: '/reports/fda',       label: 'รายงาน อย.', icon: ShieldCheck },
] as const

type TabValue = typeof TABS[number]['value']

function resolveTab(pathname: string): TabValue {
  if (pathname.startsWith('/reports/dashboard')) return 'dashboard'
  if (pathname.startsWith('/reports/sales')) return 'sales'
  if (pathname.startsWith('/reports/purchases')) return 'purchases'
  if (pathname.startsWith('/reports/fda')) return 'fda'
  return 'finance'
}

export interface ReportsSummaryCard {
  label: string
  value: string
  sub?: string
  subTitle?: string
  subClassName?: string
  sparkline?: number[]
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
  const [summaryState, setSummaryState] = useState<{ tab: TabValue; cards: ReportsSummaryCard[] } | null>(null)
  const [toolbarState, setToolbarState] = useState<{ tab: TabValue; node: React.ReactNode } | null>(null)
  // Mirror of Manage: overflow-hidden during height transition only, so any
  // future ring/glow on a child card isn't clipped post-animation.
  const [animatingSummary, setAnimatingSummary] = useState(true)

  const setSummary = useCallback((cards: ReportsSummaryCard[] | null) => {
    const ownerTab = current
    setSummaryState(prev => {
      if (cards && cards.length > 0) return { tab: ownerTab, cards }
      return prev?.tab === ownerTab ? null : prev
    })
  }, [current])

  const setToolbar = useCallback((node: React.ReactNode | null) => {
    const ownerTab = current
    setToolbarState(prev => {
      if (node) return { tab: ownerTab, node }
      return prev?.tab === ownerTab ? null : prev
    })
  }, [current])

  const ctx = useMemo<ReportsOutletContext>(() => ({ setSummary, setToolbar }), [setSummary, setToolbar])
  const summary = summaryState?.tab === current ? summaryState.cards : null
  const toolbar = toolbarState?.tab === current ? toolbarState.node : null

  return (
    /* Page-scroll dashboard pattern: the whole layout is the single scroll
       context. Only the PageHeader (title + clock) sticks at top-0 so the
       page identity is always visible; Tabs + Summary scroll away with the
       content. Individual report pages drop their own
       `flex-1 min-h-0 overflow-y-auto` and just flow. */
    <div className="flex flex-col h-full overflow-y-auto scrollbar-thin px-8 pb-4">
      <div className="no-print sticky top-0 z-20 bg-background">
        <PageHeader title="รายงาน" />
      </div>

      <div className="no-print flex items-center gap-3 shrink-0 pb-2">
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

      {summary && summary.length > 0 && (
        <motion.div
          key={`reports-summary-${current}`}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onAnimationStart={() => setAnimatingSummary(true)}
          onAnimationComplete={() => setAnimatingSummary(false)}
          className={`no-print shrink-0 mb-2 ${animatingSummary ? 'overflow-hidden' : ''}`}
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

      <Outlet context={ctx} />
    </div>
  )
}
