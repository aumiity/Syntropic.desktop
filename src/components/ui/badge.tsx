import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  [
    "inline-flex w-fit shrink-0 items-center justify-center gap-1",
    "overflow-hidden rounded-sm border border-transparent",
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
        accent: [
          "bg-accent text-accent-foreground",
        ].join(" "),
        "primary-soft": [
          "bg-primary-soft text-primary",
        ].join(" "),
        "info-soft": [
          "bg-info-soft text-info-soft-foreground",
        ].join(" "),
        "accent-soft": [
          "bg-accent-soft text-accent-soft-foreground",
        ].join(" "),
        destructive:
          "bg-destructive text-white dark:bg-destructive-hover dark:text-white",
        outline:
          "border-transparent bg-background aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        mutedborder:
          "border-border-strong/30 bg-muted text-muted-foreground dark:border-input dark:bg-input/30 [a]:hover:bg-muted-hover [a]:hover:text-foreground",
        elevated:
          "bg-card text-foreground border-border shadow-sm [a]:hover:bg-muted",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
        success: "border-transparent bg-success text-success-foreground",
        warning: "border-transparent bg-warning text-warning-foreground",
        info: "border-transparent bg-info text-info-foreground",
        violet: "border-transparent bg-violet text-violet-foreground",
        teal: "border-transparent bg-teal text-teal-foreground",
        amber: "border-transparent bg-amber text-amber-foreground",
        sand: "border-transparent bg-sand text-sand-foreground",
        "success-soft": "border-transparent bg-success-soft text-success",
        "warning-soft": "border-transparent bg-warning-soft text-warning-soft-foreground",
        "violet-soft": "border-transparent bg-violet-soft text-violet-strong",
        "teal-soft": "border-transparent bg-teal-soft text-teal-strong",
        "amber-soft": "border-transparent bg-amber-soft text-amber-strong",
        "sand-soft": "border-transparent bg-sand-soft text-sand-strong",
        "destructive-soft": "bg-destructive-soft text-destructive hover:bg-destructive/25 hover:text-destructive",
        "success-outline": "border-success/40 bg-success-soft text-success",
        "info-outline": "border-info/40 bg-info-soft text-info",
        "warning-outline": "border-warning/40 bg-warning-soft text-warning-soft-foreground",
        "primary-outline": "border-primary/40 bg-primary-soft text-primary",
        "destructive-outline": "border-destructive/40 bg-destructive-soft text-destructive",
        "violet-outline": "border-violet/40 bg-violet-soft text-violet-strong",
        "teal-outline": "border-teal/40 bg-teal-soft text-teal-strong",
        "amber-outline": "border-amber/40 bg-amber-soft text-amber-strong",
        "sand-outline": "border-sand/40 bg-sand-soft text-sand-strong",
        "accent-outline": "border-accent/80 bg-accent-soft text-accent-soft-foreground",
        "neutral-outline": "border-border bg-card text-foreground",
        "muted-outline": "border-border-strong/30 bg-muted-hover text-muted-foreground",
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
