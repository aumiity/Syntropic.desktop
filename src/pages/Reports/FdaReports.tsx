import { useMemo, useState, type ReactNode } from 'react'
import { Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ReportsOutletContext } from './index'
import { FileText, FileClock, FileBarChart } from 'lucide-react'

// Sub-layout for the official FDA / Pharmacy Council registers. A `line` tab row
// switches inline between ขย.9 (purchase register), ขย.10 (controlled-drug sale
// register), ขย.11 (dangerous-drug sale register); each report renders into the
// nested <Outlet/>. Outlet context (setSummary/setToolbar) is forwarded down from
// ReportsLayout so the report pages keep working unchanged, EXTENDED with
// setActions so each report can mount its print buttons on this sub-tab line.
const FORMS = [
  { value: 'khor-yor-9',  to: '/reports/fda/khor-yor-9',  label: 'ข.ย.9 บัญชีการซื้อยา',           icon: FileText },
  { value: 'khor-yor-10', to: '/reports/fda/khor-yor-10', label: 'ข.ย.10 บัญชีการขายยาควบคุมพิเศษ', icon: FileClock },
  { value: 'khor-yor-11', to: '/reports/fda/khor-yor-11', label: 'ข.ย.11 บัญชีการขายยาอันตราย',     icon: FileBarChart },
] as const

// Report pages register their toolbar (ฟอร์มเปล่า / พิมพ์) here; it renders on the
// right of the sub-tab line so the table card below stays action-free.
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
  const [actions, setActions] = useState<ReactNode>(null)
  const fdaCtx = useMemo<FdaOutletContext>(() => ({ ...ctx, setActions }), [ctx, setActions])

  return (
    <div className="flex flex-1 flex-col min-h-0 gap-3">
      {/* Sub-tab line (h-10): forms on the left, the active report's print
          actions on the right. */}
      <div className="no-print shrink-0 flex items-center gap-3">
        <Tabs
          value={current}
          onValueChange={(v) => {
            const form = FORMS.find(f => f.value === v)
            if (form) navigate(form.to)
          }}
        >
          <TabsList variant="line" className="inline-grid grid-flow-col auto-cols-fr">
            {FORMS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value}>
                <Icon /> {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {actions && <div className="ml-auto flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      <Outlet context={fdaCtx} />
    </div>
  )
}
