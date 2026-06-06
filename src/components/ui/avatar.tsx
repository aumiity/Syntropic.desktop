import * as React from "react"
import { User } from "lucide-react"
import { cn } from "@/lib/utils"

// Soft-tinted palette — each entry pairs bg + text so the icon stays
// readable. Index picked from a stable string hash of the source name, so the
// same customer always gets the same color across the app.
const PALETTE = [
  "bg-primary-soft text-primary",
  "bg-success-soft text-success",
  "bg-info-soft text-info-soft-foreground",
  "bg-warm text-warm-foreground",
  "bg-primary-soft text-primary",
  "bg-warm text-warm-foreground",
  "bg-violet-soft text-violet-strong",
  "bg-destructive-soft text-destructive",
] as const

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

type AvatarSize = "xs" | "sm" | "default" | "lg"

const SIZE_CLASSES: Record<AvatarSize, string> = {
  xs:      "size-6",
  sm:      "size-7",
  default: "size-9",
  lg:      "size-12",
}

const ICON_SIZE: Record<AvatarSize, string> = {
  xs:      "size-3.5",
  sm:      "size-4",
  default: "size-5",
  lg:      "size-6",
}

// Renders a circle avatar with a User icon, tinted by a stable hash of the
// name so the same customer always gets the same color. Initials were tried
// first but produced awkward output for Thai names (leading vowels) — a
// single neutral icon reads cleanly across both scripts.
export function InitialAvatar({
  name,
  size = "sm",
  className,
}: {
  name: string | null | undefined
  size?: AvatarSize
  className?: string
}) {
  const palette = PALETTE[hashString(name ?? "") % PALETTE.length]
  return (
    <span
      data-slot="initial-avatar"
      aria-label={name ?? undefined}
      title={name ?? undefined}
      className={cn(
        "inline-grid place-items-center rounded-full shrink-0 select-none",
        SIZE_CLASSES[size],
        palette,
        className,
      )}
    >
      <User className={ICON_SIZE[size]} />
    </span>
  )
}
