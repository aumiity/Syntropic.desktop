import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  [
    "inline-flex w-fit shrink-0 items-center justify-center gap-1",
    "overflow-hidden rounded-full border border-transparent",
    "px-2 py-0.5 text-xs font-medium whitespace-nowrap",
    "transition-[color,box-shadow]",
    "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
    "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
    "dark:aria-invalid:ring-destructive/40",
    "[&>svg]:pointer-events-none [&>svg]:size-3",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground border-border",
        tertiary: [
          "bg-tertiary text-tertiary-foreground",
        ].join(" "),
        "brand-soft": [
          "bg-brand-soft text-brand-soft-foreground",
        ].join(" "),
        "info-soft": [
          "bg-info-soft text-info-soft-foreground",
        ].join(" "),
        warm: [
          "bg-warm text-warm-foreground",
        ].join(" "),
        destructive:
          "bg-destructive text-white dark:bg-destructive-hover dark:text-white",
        outline:
          "border-transparent bg-background aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
        success: "border-transparent bg-success text-success-foreground",
        warning: "border-transparent bg-warning text-warning-foreground",
        danger: "border-transparent bg-destructive text-primary-foreground",
        destructive2: "bg-destructive/15 text-destructive hover:bg-destructive/25 hover:text-destructive",
        "success-outline": "rounded-md border-success/40 bg-success-soft text-success",
        "info-outline": "rounded-md border-info/40 bg-info-soft text-info",
        "warning-outline": "rounded-md border-warning-strong/40 bg-warm text-warning-strong",
        "brand-outline": "rounded-md border-primary/40 bg-brand-soft text-primary",
        "destructive-outline": "rounded-md border-destructive/40 bg-destructive-soft text-destructive-strong",
        "violet-outline": "rounded-md border-violet/40 bg-violet-soft text-violet-strong",
        "neutral-outline": "rounded-md border-border bg-card text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
