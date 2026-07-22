import * as React from "react"

import { cn } from "@/lib/utils"
import { Badge } from "./badge"

/**
 * CountBadge — the single source of truth for the "notification count" look:
 * a red circle (pill when 2+ digits) with a white ring. Used for sidebar nav
 * counts and the POS cart-slot line count. Callers only add positioning
 * (`ml-auto`, `mb-[2px]`, …) via `className`; the shape/colour/ring live here so
 * every noti badge stays in sync. Numbers over 99 render as `99+`.
 */
function CountBadge({
  count,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Badge>, "variant" | "children"> & {
  count: number
}) {
  return (
    <Badge
      {...props}
      variant="destructive"
      className={cn(
        "h-4 min-w-4 px-1 justify-center font-semibold rounded-full ring-2 ring-card leading-none",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </Badge>
  )
}

export { CountBadge }
