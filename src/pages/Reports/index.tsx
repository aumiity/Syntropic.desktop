import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Receipt, PackagePlus, CalendarClock } from 'lucide-react'

const TABS = [
  { to: '/reports',           label: 'การขาย',    icon: Receipt,        end: true  },
  { to: '/reports/purchases', label: 'การซื้อ',   icon: PackagePlus,    end: false },
  { to: '/reports/expiry',    label: 'หมดอายุ',   icon: CalendarClock,  end: false },
]

export default function ReportsLayout() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 px-6 pt-3 border-b border-border bg-background">
        <nav className="flex gap-1">
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-md',
                  'border-b-2 -mb-px transition-colors',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40',
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
