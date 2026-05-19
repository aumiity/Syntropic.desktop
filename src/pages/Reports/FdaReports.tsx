import { useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import type { ReportsOutletContext } from './index'
import { Construction, ShieldCheck, Thermometer, FileSpreadsheet } from 'lucide-react'

// ⬜ Phase 5 placeholder — รายงาน อย. (controlled-drug registers บ.ย.*, temperature
// logs, regulatory exports). Greenfield, blocked until the operator provides the
// exact อย. forms/columns. This stub keeps the tab visible so it isn't forgotten.
// See PROGRESS.md "Phase 5".
export default function ReportsFdaPage() {
  const { setSummary } = useOutletContext<ReportsOutletContext>()

  // No summary cards for a not-yet-built page — clear the shared slot so a
  // sibling tab's cards don't bleed through.
  useEffect(() => { setSummary(null) }, [setSummary])

  return (
    <div className="flex flex-1 flex-col items-center justify-center min-h-0 bg-card rounded-card shadow-card overflow-hidden text-center px-8">
      <span className="grid place-items-center size-16 rounded-card bg-warning-soft text-warning-strong mb-5">
        <Construction className="size-8" />
      </span>

      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-xl font-semibold text-foreground">รายงาน อย.</h2>
        <Badge variant="warning">อยู่ระหว่างพัฒนา</Badge>
      </div>

      <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
        ส่วนนี้ยังไม่เปิดใช้งาน — รอข้อมูลแบบฟอร์มและคอลัมน์ตามที่ อย. กำหนด
        ก่อนเริ่มพัฒนา (ดู Phase 5 ใน PROGRESS.md)
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm text-foreground-subtle">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted">
          <ShieldCheck className="size-4" /> ทะเบียนยาควบคุม (บ.ย.)
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted">
          <Thermometer className="size-4" /> บันทึกอุณหภูมิ
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted">
          <FileSpreadsheet className="size-4" /> ส่งออกรายงานราชการ
        </span>
      </div>
    </div>
  )
}
