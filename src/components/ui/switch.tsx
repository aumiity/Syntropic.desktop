"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Switch({
  className,
  size = "default",
  variant = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default" | "lg"
  variant?: "default" | "destructive" | "warning"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      data-variant={variant}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center overflow-hidden rounded-full outline-none",
        "transition-[background-color,box-shadow] duration-[250ms] ease-out motion-reduce:transition-none",
        "data-[size=sm]:h-[16px] data-[size=sm]:w-[36px]",
        "data-[size=default]:h-[20px] data-[size=default]:w-[44px]",
        "data-[size=lg]:h-[24px] data-[size=lg]:w-[54px]",
        "bg-foreground/20 dark:bg-foreground/20",
        "data-[variant=default]:data-[state=checked]:bg-primary",
        "data-[variant=destructive]:data-[state=checked]:bg-destructive",
        "data-[variant=warning]:data-[state=checked]:bg-warning",
        "focus-visible:ring-3 focus-visible:ring-ring/50",
        "aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none flex origin-center rounded-full bg-white",
          "ms-0.5",
          "transition-[margin,background-color,box-shadow] duration-300 ease-out motion-reduce:transition-none",
          "group-data-[size=sm]/switch:h-[12px] group-data-[size=sm]/switch:w-[20px]",
          "group-data-[size=default]/switch:h-[16px] group-data-[size=default]/switch:w-[26px]",
          "group-data-[size=lg]/switch:h-[19px] group-data-[size=lg]/switch:w-[29px]",
          "group-data-[size=sm]/switch:data-[state=checked]:ms-[calc(100%-22px)]",
          "group-data-[size=default]/switch:data-[state=checked]:ms-[calc(100%-28px)]",
          "group-data-[size=lg]/switch:data-[state=checked]:ms-[calc(100%-32px)]",
          "group-active/switch:scale-110",
        )}
      />
    </SwitchPrimitive.Root>
  )
}

// Toggle = label + Switch. Label sits on the LEFT, switch on the RIGHT
// (iOS/macOS settings convention: setting name first, control after).
// `framed` wraps it in a h-12 rounded-lg pill with a thin border so it reads
// as a control on both tinted page backgrounds AND inside white dialogs
// (where a borderless white pill would be invisible). The pill stays a plain
// neutral frame (bg-card border-border) while OFF for every variant — only
// when switched ON does variant=destructive pick up the soft red bg/border
// (พักการใช้งาน, ปิดบัญชี) and variant=warning the yellow tint (เปิดการแจ้งเตือน),
// signalling the active destructive/attention state. The switch itself already
// turns red/yellow when on via the Switch variant.
//
// `framed="input"` is the top-bar variant: a borderless h-8 bg-input pill that
// blends with the search Input next to it in the table-card top bar (reads as
// one continuous control row, not a popped-out chip). Use whenever a Toggle
// lives in a top bar beside a search field. h-8 matches the other bar controls
// being retuned in the 2026-07 redesign (search Input, DateInput/DateRangePicker/
// Combobox/NativeSelect) — the h-9 rule is PAUSED (see CLAUDE.md), don't revert.
function Toggle({ checked, onChange, label, size, variant = "default", framed, disabled, className }: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: React.ReactNode
  size?: "sm" | "default" | "lg"
  variant?: "default" | "destructive" | "warning"
  framed?: boolean | "input"
  disabled?: boolean
  className?: string
}) {
  const frameInput = framed === "input"
  return (
    <label className={cn(
      "flex items-center gap-2 cursor-pointer select-none",
      disabled && "cursor-not-allowed opacity-50",
      // top-bar input-blended frame (matches the search Input)
      frameInput && "h-8 px-3 rounded-lg bg-input transition-colors",
      // standard pill frame (border + bg-card)
      framed && !frameInput && "h-12 px-3 rounded-lg border transition-colors",
      // plain neutral frame for every variant while off
      framed && !frameInput && (variant === "default" || !checked) && "bg-card border-border",
      // colored frame/tint only once switched on
      framed && !frameInput && variant === "destructive" && checked && "bg-destructive-soft border-destructive/30 text-destructive",
      framed && !frameInput && variant === "warning" && checked && "bg-amber-soft border-warning/40 text-amber-strong",
      className,
    )}>
      {label ? <span className="text-sm">{label}</span> : null}
      <Switch checked={checked} onCheckedChange={onChange} size={size} variant={variant} disabled={disabled} />
    </label>
  )
}

export { Switch, Toggle }
