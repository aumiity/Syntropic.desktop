import { useMemo, type ReactNode } from 'react'
import { Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ReportsOutletContext } from './index'
import { FileText, FileClock, FileBarChart } from 'lucide-react'

// Sub-layout for the official FDA / Pharmacy Council registers. A `line` tab row
// switches inline between ขย.9 (purchase register), ขย.10 (controlled-drug sale
// register), ขย.11 (dangerous-drug sale register); each report renders into the
// nested <Outlet/>. Outlet context (setSummary/setToolbar) is forwarded down from
// ReportsLayout so the report pages keep working unchanged, EXTENDED with
// setActions — a thin alias to the parent's setToolbar — so each report's print
// buttons mount on the Reports MAIN tab strip, not this sub-tab row.
const FORMS = [
  { value: 'khor-yor-9',  to: '/reports/fda/khor-yor-9',  label: 'ข.ย.9',  icon: FileText },
  { value: 'khor-yor-10', to: '/reports/fda/khor-yor-10', label: 'ข.ย.10', icon: FileClock },
  { value: 'khor-yor-11', to: '/reports/fda/khor-yor-11', label: 'ข.ย.11', icon: FileBarChart },
] as const

// Report pages register their toolbar (ฟอร์มเปล่า / พิมพ์) here; it is forwarded to
// the parent's setToolbar so it renders on the Reports MAIN tab strip, keeping
// both the sub-tab row and the table card below action-free.
export interface FdaOutletContext extends ReportsOutletContext {
  setActions: (node: ReactNode | null) => void
}

function resolveForm(pathname: string): string {
  if (pathname.includes('khor-yor-10')) return 'khor-yor-10'
  if (pathname.includes('khor-yor-11')) return 'khor-yor-11'
  return 'khor-yor-9'
}

export default function ReportsFdaLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const ctx = useOutletContext<ReportsOutletContext>()
  const current = resolveForm(location.pathname)
  // Lift the active report's print buttons up to the Reports MAIN tab strip (via
  // the parent's setToolbar) instead of rendering them on this sub-tab row —
  // same placement pattern as Manage's stock export button.
  const fdaCtx = useMemo<FdaOutletContext>(() => ({ ...ctx, setActions: ctx.setToolbar }), [ctx])

  return (
    <div className="flex flex-1 flex-col min-h-0 gap-3">
      {/* Sub-tab line (h-12 bar): the four register forms, stretched full-width.
          The active report's print actions are lifted to the Reports main tab
          strip (see fdaCtx above), so this row holds the tabs only. */}
      <div className="no-print flex items-center gap-3 h-12 shrink-0">
        <Tabs
          value={current}
          className="flex-1"
          onValueChange={(v) => {
            const form = FORMS.find(f => f.value === v)
            if (form) navigate(form.to)
          }}
        >
          <TabsList variant="line" className="w-full">
            {FORMS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="flex-1 px-4 py-2">
                <Icon /> {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <Outlet context={fdaCtx} />
    </div>
  )
}
