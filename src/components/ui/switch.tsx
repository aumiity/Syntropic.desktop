"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default" | "lg"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center overflow-hidden rounded-full outline-none",
        "transition-[background-color,box-shadow] duration-[250ms] ease-out motion-reduce:transition-none",
        "data-[size=sm]:h-[16px] data-[size=sm]:w-[36px]",
        "data-[size=default]:h-[20px] data-[size=default]:w-[44px]",
        "data-[size=lg]:h-[24px] data-[size=lg]:w-[54px]",
        "bg-foreground/20 dark:bg-foreground/20",
        "data-[state=checked]:bg-primary",
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

function Toggle({ checked, onChange, label }: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <Switch checked={checked} onCheckedChange={onChange} />
      {label ? <span className="text-sm">{label}</span> : null}
    </label>
  )
}

export { Switch, Toggle }
