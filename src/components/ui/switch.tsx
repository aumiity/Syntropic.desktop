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
        "data-[size=sm]:h-4 data-[size=sm]:w-8",
        "data-[size=default]:h-5 data-[size=default]:w-10",
        "data-[size=lg]:h-6 data-[size=lg]:w-12",
        "bg-input hover:bg-input/80 dark:bg-input/80",
        "data-[state=checked]:bg-primary data-[state=checked]:hover:bg-primary-hover",
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
          "shadow-[0_1px_2px_rgb(0_0_0/0.08)]",
          "ms-0.5",
          "transition-[margin,background-color,box-shadow] duration-300 ease-out motion-reduce:transition-none",
          "group-data-[size=sm]/switch:h-3 group-data-[size=sm]/switch:w-[1.03125rem]",
          "group-data-[size=default]/switch:h-4 group-data-[size=default]/switch:w-[1.375rem]",
          "group-data-[size=lg]/switch:h-5 group-data-[size=lg]/switch:w-[1.71875rem]",
          "group-data-[size=sm]/switch:data-[state=checked]:ms-[calc(100%-1.15625rem)]",
          "group-data-[size=default]/switch:data-[state=checked]:ms-[calc(100%-1.5rem)]",
          "group-data-[size=lg]/switch:data-[state=checked]:ms-[calc(100%-1.84375rem)]",
          "data-[state=checked]:shadow-[0_0_5px_0_rgb(0_0_0/0.02),0_2px_10px_0_rgb(0_0_0/0.06),0_0_1px_0_rgb(0_0_0/0.3)]"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
