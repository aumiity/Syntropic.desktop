import * as React from "react"
import { Search } from "lucide-react"

import { cn } from "@/lib/utils"

// "default" is now the house ELEVATED treatment (bg-card + border + shadow) so
// a bare <Input> is correct by default. "elevated" is kept as an explicit alias
// for the ~existing call sites. "filled" is the old flat bg-input look — opt in
// only where the flat treatment is genuinely wanted (e.g. dense inline edits).
type InputVariant = "default" | "elevated" | "filled"

const Input = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input"> & { variant?: InputVariant }
>(({ className, type, variant = "default", ...props }, ref) => {
  return (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      data-variant={variant}
      className={cn(
        "h-9 w-full min-w-0",
        "rounded-lg",
        "px-2.5 py-1",
        "text-sm outline-none transition-all",
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        "placeholder:text-foreground-subtle",
        "focus:ring-[1px] focus:ring-ring focus:border-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:ring-destructive/50 aria-invalid:ring-[1px] aria-invalid:border-destructive/50",
        variant === "filled" ? "bg-input" : "bg-card border border-border shadow-sm",
        className
      )}
      {...props}
    />
  )
})
Input.displayName = "Input"

const SearchInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input"> & { wrapperClassName?: string; variant?: InputVariant }
>(({ className, wrapperClassName, variant, ...props }, ref) => {
  return (
    <div className={cn("relative w-96 shrink-0", wrapperClassName)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
      <Input ref={ref} variant={variant} className={cn("pl-9", className)} {...props} />
    </div>
  )
})
SearchInput.displayName = "SearchInput"

export { Input, SearchInput }
export type { InputVariant }


