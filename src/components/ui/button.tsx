import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  [
    "group/button inline-flex shrink-0 items-center justify-center",
    "rounded-lg border border-transparent bg-clip-padding",
    "text-xs font-regular whitespace-nowrap",
    "transition-all outline-none select-none",
    "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
    "active:not-aria-[haspopup]:translate-y-px",
    "disabled:pointer-events-none disabled:opacity-50",
    "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
    "dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    "transition-transform duration-100 active:scale-95 active:translate-y-[1px]",
  ].join(" "),
  {
    variants: {
      variant: {
        default: [
          "bg-primary text-primary-foreground",
          "hover:bg-primary-hover [a]:hover:bg-primary/80",
        ].join(" "),
        secondary: [
          "bg-secondary text-secondary-foreground",
          "border-border hover:bg-surface-hover",
        ].join(" "),
        closebutton: [
          "bg-secondary text-secondary-foreground",
          "border-border hover:bg-surface-hover",
        ].join(" "),
        outline: [
          "border-transparent bg-background",
          "hover:bg-muted hover:text-foreground",
          "aria-expanded:bg-muted aria-expanded:text-foreground",
          "dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        ].join(" "),
        ghost: [
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
      },
      size: {
        default: [
          "h-7 gap-1.5 px-2.5",
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
          "h-8 gap-1.5 px-2.5",
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
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef<HTMLButtonElement, React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }>(
  ({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
        ref={ref} // <-- ส่ง ref มาที่นี่
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}
)
Button.displayName = "Button"

export { Button, buttonVariants }

