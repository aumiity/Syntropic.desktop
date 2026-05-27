import * as React from 'react'
import { cn } from '@/lib/utils'

interface TabStripProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
}

// Horizontal strip wrapping primary navigation tabs with a bottom divider line.
// `sticky top-0` pins the strip when a scrollable ancestor exists (no-op when
// the parent isn't a scroll container). `bg-background` covers any content
// scrolling beneath. To make the border line sit flush against the next
// element, pages with parent `gap-2` should pass `className="-mb-2"`.
export function TabStrip({ className, children, ...props }: TabStripProps) {
  return (
    <div
      className={cn('sticky top-0 z-10 bg-background flex items-center shrink-0 border-b border-border pb-3', className)}
      {...props}
    >
      {children}
    </div>
  )
}
