import * as React from "react"
import { Search } from "lucide-react"

import { cn } from "@/lib/utils"
import { fieldVariant, type FieldVariant } from "./field-variants"
import { type Radius } from "./radius"

// See field-variants.ts — shape x shadow on the house ELEVATED surface.
type InputVariant = FieldVariant

const Input = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input"> & { variant?: InputVariant; radius?: Radius }
>(({ className, type, variant = "default", radius = "md", ...props }, ref) => {
  return (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      data-variant={variant}
      className={cn(
        "h-9 w-full min-w-0",
        "px-2.5 py-1",
        "text-sm outline-none transition-all",
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        "placeholder:text-foreground-subtle/50",
        "focus:ring-[1px] focus:ring-ring focus:border-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:ring-destructive aria-invalid:ring-[1px] aria-invalid:border-destructive",
        fieldVariant(variant, radius),
        className
      )}
      {...props}
    />
  )
})
Input.displayName = "Input"

const SearchInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input"> & { wrapperClassName?: string; variant?: InputVariant; radius?: Radius }
>(({ className, wrapperClassName, variant, radius, ...props }, ref) => {
  return (
    <div className={cn("relative w-96 shrink-0", wrapperClassName)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
      <Input ref={ref} variant={variant} radius={radius} className={cn("pl-9", className)} {...props} />
    </div>
  )
})
SearchInput.displayName = "SearchInput"

export { Input, SearchInput }
export type { InputVariant }


