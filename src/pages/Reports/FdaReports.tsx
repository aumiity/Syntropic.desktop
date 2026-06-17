import { useEffect } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ReportsOutletContext } from './index'
import { FileText, FileClock, FileBarChart, ArrowRight } from 'lucide-react'

// Hub for official FDA / Pharmacy Council forms. Each card navigates to its
// dedicated report page: ขย.9 (purchase register), ขย.10 (controlled-drug sale
// register), ขย.11 (dangerous-drug sale register).
const FORMS = [
  {
    code: 'แบบ ข.ย. ๙',
    title: 'บัญชีการซื้อยา',
    description: 'รายงานการซื้อยาทุกครั้ง — ลำดับที่ วันที่ ชื่อผู้ขาย ชื่อยา ครั้งที่ผลิต จำนวน',
    icon: FileText,
    to: '/reports/fda/khor-yor-9',
    enabled: true,
  },
  {
    code: 'แบบ ข.ย. ๑๐',
    title: 'บัญชีการขายยาควบคุมพิเศษ',
    description: 'รายงานการขายยาควบคุมพิเศษ รายล็อต — วันที่ขาย จำนวน ชื่อผู้ซื้อ',
    icon: FileClock,
    to: '/reports/fda/khor-yor-10',
    enabled: true,
  },
  {
    code: 'แบบ ข.ย. ๑๑',
    title: 'บัญชีการขายยาอันตราย',
    description: 'รายงานการขายยาอันตรายตามที่เลขาธิการ อย. กำหนด รายล็อต',
    icon: FileBarChart,
    to: '/reports/fda/khor-yor-11',
    enabled: true,
  },
] as const

export default function ReportsFdaPage() {
  const { setSummary } = useOutletContext<ReportsOutletContext>()
  useEffect(() => { setSummary(null) }, [setSummary])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 content-start">
      {FORMS.map(({ code, title, description, icon: Icon, to, enabled }) => {
        const content = (
          <div className="flex items-start gap-4 p-5 h-full">
            <span className={cn(
              'grid place-items-center size-12 rounded-card shrink-0',
              enabled ? 'bg-primary-soft text-primary' : 'bg-muted text-muted-foreground',
            )}>
              <Icon className="size-6" />
            </span>
            <div className="flex flex-col min-w-0 flex-1 gap-1">
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-foreground">{code}</span>
                {!enabled && <Badge variant="warning">เร็วๆ นี้</Badge>}
              </div>
              <span className="text-sm text-foreground font-medium">{title}</span>
              <span className="text-sm text-muted-foreground leading-relaxed">{description}</span>
            </div>
            {enabled && (
              <ArrowRight className="size-5 text-muted-foreground shrink-0 mt-2" />
            )}
          </div>
        )
        return enabled ? (
          <Link
            key={code}
            to={to}
            className="bg-card rounded-card border border-border shadow-card hover:bg-primary-soft/40 hover:shadow-md transition-all"
          >
            {content}
          </Link>
        ) : (
          <div
            key={code}
            className="bg-card rounded-card border border-border shadow-card opacity-60 cursor-not-allowed"
            aria-disabled="true"
          >
            {content}
          </div>
        )
      })}
    </div>
  )
}
