import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"

const buttonVariants = cva(
  [
    "group/button inline-flex shrink-0 items-center justify-center",
    "rounded-lg bg-clip-padding",
    "text-sm font-medium whitespace-nowrap",
    "transition-all outline-none select-none",
    "shadow-sm hover:shadow-sm",
    "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
    "active:not-aria-[haspopup]:translate-y-px",
    "disabled:pointer-events-none disabled:opacity-50",
    "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
    "dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    "transition-transform duration-100 active:scale-95 active:translate-y-[1px] py-1",
  ].join(" "),
  {
    variants: {
      variant: {
        default: [
          "bg-primary text-primary-foreground",
          "hover:bg-primary-hover [a]:hover:bg-primary/80",
        ].join(" "),
        secondary: [
          "bg-secondary border-border border text-secondary-foreground",
          "hover:bg-secondary-hover [a]:hover:bg-secondary/80",
        ].join(" "),
        accent: [
          "bg-accent text-accent-foreground",
          "hover:bg-accent/85 [a]:hover:bg-accent/80",
        ].join(" "),
        "primary-soft": [
          "bg-primary-soft text-primary",
          "hover:bg-primary-soft-hover [a]:hover:bg-primary-soft/80",
        ].join(" "),
        "info-soft": [
          "bg-info-soft text-info-soft-foreground",
          "hover:bg-info-soft-hover [a]:hover:bg-info-soft/80",
        ].join(" "),
        "accent-soft": [
          "bg-accent-soft text-accent-soft-foreground",
          "hover:bg-accent-soft-hover [a]:hover:bg-accent-soft/80",
        ].join(" "),
        outline: [
          "border-transparent bg-muted",
          "hover:bg-muted-hover hover:text-foreground",
          "aria-expanded:bg-muted aria-expanded:text-foreground",
          "dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        ].join(" "),
         mutedborder: [
          "border-border-strong/30 bg-muted",
          "text-muted-foreground border",
          "hover:bg-muted-hover hover:text-foreground",
          "aria-expanded:bg-muted aria-expanded:text-foreground",
          "dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        ].join(" "),
        ghost: [
          "shadow-none hover:shadow-none",
          "hover:bg-muted hover:text-foreground",
          "aria-expanded:bg-muted aria-expanded:text-foreground",
          "dark:hover:bg-muted/50",
        ].join(" "),
        destructive: [
          "bg-destructive text-white",
          "hover:bg-destructive-hover",
          "dark:bg-destructive-hover dark:hover:bg-destructive dark:text-white",
        ].join(" "),
        link: "text-primary underline-offset-4 hover:underline",
        success: "bg-success text-success-foreground hover:bg-success-hover",
        warning: "bg-warning text-warning-foreground hover:bg-warning-hover",
        info: "bg-info text-info-foreground hover:bg-info/85",
        violet: "bg-violet text-violet-foreground hover:bg-violet/85",
        teal: "bg-teal text-teal-foreground hover:bg-teal/85",
        amber: "bg-amber text-amber-foreground hover:bg-amber/85",
        sand: "bg-sand text-sand-foreground hover:bg-sand/85",
        "success-soft": "bg-success-soft text-success hover:bg-success-soft/80",
        // warning-soft = pale ORANGE (distinct from `accent-soft` which is cream)
        "warning-soft": "bg-warning-soft text-warning-soft-foreground hover:bg-warning-soft/80",
        "violet-soft": "bg-violet-soft text-violet-strong hover:bg-violet-soft/80",
        "teal-soft": "bg-teal-soft text-teal-strong hover:bg-teal-soft/80",
        "amber-soft": "bg-amber-soft text-amber-strong hover:bg-amber-soft/80",
        "sand-soft": "bg-sand-soft text-sand-strong hover:bg-sand-soft/80",
        // Soft + colored border — bordered chip look (matches Badge *-outline)
        "primary-outline":      "border border-primary/40 bg-primary-soft text-primary hover:bg-primary-soft-hover",
        "success-outline":      "border border-success/40 bg-success-soft text-success hover:bg-success-soft/80",
        "warning-outline":      "border border-warning/40 bg-warning-soft text-warning-soft-foreground hover:bg-warning-soft/80",
        "destructive-outline":  "border border-destructive/40 bg-destructive-soft text-destructive hover:bg-destructive/25",
        "info-outline":         "border border-info/40 bg-info-soft text-info-soft-foreground hover:bg-info-soft-hover",
        "violet-outline":       "border border-violet/40 bg-violet-soft text-violet-strong hover:bg-violet-soft/80",
        "teal-outline":         "border border-teal/40 bg-teal-soft text-teal-strong hover:bg-teal-soft/80",
        "amber-outline":        "border border-amber/40 bg-amber-soft text-amber-strong hover:bg-amber-soft/80",
        "sand-outline":         "border border-sand/40 bg-sand-soft text-sand-strong hover:bg-sand-soft/80",
        "accent-outline":       "border border-accent/80 bg-accent-soft text-accent-soft-foreground hover:bg-accent-soft-hover",
        "neutral-outline":      "border border-border bg-card text-foreground hover:bg-muted",
        "muted-outline":        "border border-border-strong/30 bg-muted-hover text-muted-foreground hover:bg-muted",
        "destructive-soft": "bg-destructive-soft text-destructive hover:bg-destructive/25 hover:text-destructive",
        elevated: [
          "bg-card text-foreground border-border border shadow-sm",
          "hover:bg-muted hover:shadow-sm",
          "aria-expanded:shadow-sm aria-expanded:bg-muted",
        ].join(" "),
        "elevated-destructive": [
          "bg-card text-foreground border-border border shadow-sm",
          "hover:bg-destructive hover:text-white hover:border-destructive hover:shadow-sm",
          "aria-expanded:bg-destructive aria-expanded:text-white aria-expanded:border-destructive aria-expanded:shadow-sm",
        ].join(" "),
        "elevated-warning": [
          "bg-card text-foreground border-border border shadow-sm",
          "hover:bg-warning hover:text-white hover:border-warning hover:shadow-sm",
          "aria-expanded:bg-warning aria-expanded:text-white aria-expanded:border-warning aria-expanded:shadow-sm",
        ].join(" "),
        "elevated-success": [
          "bg-card text-foreground border-border border shadow-sm",
          "hover:bg-success hover:text-success-foreground hover:border-success hover:shadow-sm",
          "aria-expanded:bg-success aria-expanded:text-success-foreground aria-expanded:border-success aria-expanded:shadow-sm",
        ].join(" "),
        // Soft elevated — role tint shows at rest (soft bg + colored border + shadow), deepens on hover/aria-expanded
        "elevated-destructive-soft": [
          "bg-card text-foreground border-border border shadow-sm",
          "hover:bg-destructive-soft hover:text-destructive hover:border-destructive-soft hover:shadow-sm",
          "aria-expanded:bg-destructive-soft aria-expanded:text-destructive aria-expanded:border-destructive-soft aria-expanded:shadow-sm",
        ].join(" "),
        "elevated-warning-soft": [
          "bg-card text-foreground border-border border shadow-sm",
          "hover:bg-warning-soft hover:text-warning-soft-foreground hover:border-warning-soft hover:shadow-sm",
          "aria-expanded:bg-warning-soft aria-expanded:text-warning-soft-foreground aria-expanded:border-warning-soft aria-expanded:shadow-sm",
        ].join(" "),
        "elevated-success-soft": [
          "bg-card text-foreground border-border border shadow-sm",
          "hover:bg-success-soft hover:text-success hover:border-success-soft hover:shadow-sm",
          "aria-expanded:bg-success-soft aria-expanded:text-success aria-expanded:border-success-soft aria-expanded:shadow-sm",
        ].join(" "),
        "elevated-accent": [
          "bg-card text-foreground border-border border shadow-sm",
          "hover:bg-accent hover:text-accent-foreground hover:border-accent hover:shadow-sm",
          "aria-expanded:bg-accent aria-expanded:text-accent-foreground aria-expanded:border-accent aria-expanded:shadow-sm",
        ].join(" "),
        "elevated-accent-soft": [
          "bg-card text-foreground border-border border shadow-sm",
          "hover:bg-accent-soft hover:text-accent-soft-foreground hover:border-accent-soft hover:shadow-sm",
          "aria-expanded:bg-accent-soft aria-expanded:text-accent-soft-foreground aria-expanded:border-accent-soft aria-expanded:shadow-sm",
        ].join(" "),
      },
      size: {
        default: [
          "h-8 gap-1.5 px-2.5",
          "has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        ].join(" "),
        xs: [
          "h-5 gap-1 rounded-lg px-2 text-xs",
          "in-data-[slot=button-group]:rounded-lg",
          "has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5",
          "[&_svg:not([class*='size-'])]:size-3",
        ].join(" "),
        sm: [
          "h-6 gap-1 rounded-lg px-2.5 text-[0.8rem]",
          "in-data-[slot=button-group]:rounded-lg",
          "has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5",
          "[&_svg:not([class*='size-'])]:size-3.5",
        ].join(" "),
        lg: [
          "h-9 gap-1.5 px-2.5",
          "has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        ].join(" "),
        xl: "h-10 gap-2 rounded-lg px-10 text-base",
        icon: "size-7",
        "icon-xs": [
          "size-5 rounded-lg",
          "in-data-[slot=button-group]:rounded-lg",
          "[&_svg:not([class*='size-'])]:size-3",
        ].join(" "),
        "icon-sm": [
          "size-6 rounded-lg",
          "in-data-[slot=button-group]:rounded-lg",
          "[&_svg:not([class*='size-'])]:size-3.5",
        ].join(" "),
        "icon-lg": "size-8",
        "icon-xl": [
          "size-11 rounded-xl",
          "[&_svg:not([class*='size-'])]:size-6",
        ].join(" "),
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** When set, the button is wrapped in a styled <Tooltip>. A string also sets aria-label for icon-only buttons. */
    tooltip?: React.ReactNode
    /** Side the tooltip pops out toward. Defaults to "top". */
    tooltipSide?: React.ComponentProps<typeof TooltipContent>["side"]
  }

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, tooltip, tooltipSide = "top", "aria-label": ariaLabel, ...props }, ref) => {
  const Comp = asChild ? Slot.Root : "button"

  const button = (
    <Comp
        ref={ref} // <-- ส่ง ref มาที่นี่
      data-slot="button"
      data-variant={variant}
      data-size={size}
      aria-label={ariaLabel ?? (typeof tooltip === "string" ? tooltip : undefined)}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )

  if (tooltip == null) return button

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side={tooltipSide}>{tooltip}</TooltipContent>
    </Tooltip>
  )
}
)
Button.displayName = "Button"

export { Button, buttonVariants }

