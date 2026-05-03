import { useEffect, useState } from 'react'
import { formatThaiDateHeader } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  right?: React.ReactNode
}

export function PageHeader({ title, right }: PageHeaderProps) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(tick)
  }, [])

  const dateStr = formatThaiDateHeader(now)
  const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

  return (
    <div className="flex items-end justify-between shrink-0 px-1 mb-2">
      <h1 className="text-3xl font-bold leading-none tracking-tight">{title}</h1>
      <div className="flex items-center gap-3">
        {right}
        <div className="text-m font-semibold text-foreground">
          {dateStr} · <span className="tabular-nums">{timeStr}</span>
        </div>
      </div>
    </div>
  )
}
