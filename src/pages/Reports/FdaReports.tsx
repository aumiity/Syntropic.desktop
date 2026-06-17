import { Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ReportsOutletContext } from './index'
import { FileText, FileClock, FileBarChart } from 'lucide-react'

// Sub-layout for the official FDA / Pharmacy Council registers. A `line` tab row
// switches inline between ขย.9 (purchase register), ขย.10 (controlled-drug sale
// register), ขย.11 (dangerous-drug sale register); each report renders into the
// nested <Outlet/>. Outlet context (setSummary/setToolbar) is forwarded down from
// ReportsLayout so the report pages keep working unchanged.
const FORMS = [
  { value: 'khor-yor-9',  to: '/reports/fda/khor-yor-9',  label: 'ข.ย.๙ บัญชีการซื้อยา',           icon: FileText },
  { value: 'khor-yor-10', to: '/reports/fda/khor-yor-10', label: 'ข.ย.๑๐ บัญชีการขายยาควบคุมพิเศษ', icon: FileClock },
  { value: 'khor-yor-11', to: '/reports/fda/khor-yor-11', label: 'ข.ย.๑๑ บัญชีการขายยาอันตราย',     icon: FileBarChart },
] as const

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

  return (
    <div className="flex flex-1 flex-col min-h-0 gap-3">
      <Tabs
        value={current}
        onValueChange={(v) => {
          const form = FORMS.find(f => f.value === v)
          if (form) navigate(form.to)
        }}
        className="no-print shrink-0"
      >
        <TabsList variant="line" className="inline-grid grid-flow-col auto-cols-fr">
          {FORMS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value}>
              <Icon /> {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Outlet context={ctx} />
    </div>
  )
}
