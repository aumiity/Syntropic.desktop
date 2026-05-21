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

  // Right cluster (buttons + clock) is absolute-positioned so its height
  // never affects the header's box — any `right` content (e.g. h-10 action
  // buttons in EditProduct) stays visually anchored at the title's baseline
  // without growing the container past min-h-10 and shifting the title /
  // the next row (Tabs / stat cards) down on some pages but not others.
  return (
    <div className="relative flex items-end shrink-0 px-1 mt-4 pb-2 min-h-10">
      <h1 className="text-3xl font-bold leading-none tracking-tight">{title}</h1>
      <div className="absolute right-1 bottom-2 flex items-center gap-3">
        {right}
        <div className="text-base font-semibold text-foreground leading-none">
          {dateStr} · <span className="tabular-nums">{timeStr}</span>
        </div>
      </div>
    </div>
  )
}
